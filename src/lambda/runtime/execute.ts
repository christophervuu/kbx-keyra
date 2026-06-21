import { execute } from '../../engine/index.js';
import { getActiveSnapshot } from '../../lib/persistence/deployments.js';
import { RUNTIME_BUCKET_NAME, runtimeSnapshotKey } from '../../lib/persistence/config.js';
import {
  ERROR_CODES,
  errorResponse,
  generateRequestId,
  getObject,
  internalError,
  jsonResponse,
  parseBody,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

interface RuntimeExecuteRequest {
  readonly mappingId: string;
  readonly sourceData: Readonly<Record<string, unknown>>;
  readonly externalSources: Readonly<Record<string, unknown>>;
}

interface RuntimeSnapshotPayload {
  readonly mappingConfig?: unknown;
  readonly config?: unknown;
}

interface MappingEnrichmentSource {
  readonly alias: string;
  readonly schemaId?: string;
  readonly required?: boolean;
  readonly description?: string;
}

interface RuntimeMappingConfig {
  readonly enrichmentSources?: readonly MappingEnrichmentSource[];
  readonly config?: {
    readonly externalSources?: readonly string[];
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseExecuteRequest(body: Record<string, unknown> | null): RuntimeExecuteRequest | null {
  if (!body) {
    return null;
  }

  const mappingId = body.mappingId;
  const sourceData = body.sourceData;
  const externalSourcesCandidate = body.externalSources;

  const externalSources =
    externalSourcesCandidate && typeof externalSourcesCandidate === 'object' && !Array.isArray(externalSourcesCandidate)
      ? (externalSourcesCandidate as Readonly<Record<string, unknown>>)
      : {};

  if (!isNonEmptyString(mappingId) || !sourceData || typeof sourceData !== 'object' || Array.isArray(sourceData)) {
    return null;
  }

  return {
    mappingId,
    sourceData: sourceData as Readonly<Record<string, unknown>>,
    externalSources,
  };
}

function uniqueAliases(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    aliases.push(value);
  }

  return aliases;
}

function normalizeLegacyExternalAliases(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueAliases(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

function normalizeCanonicalEnrichmentSources(value: unknown): readonly MappingEnrichmentSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const aliases = new Set<string>();
  const normalized: MappingEnrichmentSource[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const alias = typeof candidate.alias === 'string' ? candidate.alias.trim() : '';
    if (!alias || aliases.has(alias)) {
      continue;
    }

    aliases.add(alias);
    const schemaId = typeof candidate.schemaId === 'string' ? candidate.schemaId.trim() : '';
    const required = typeof candidate.required === 'boolean' ? candidate.required : true;
    const description = typeof candidate.description === 'string' ? candidate.description.trim() : '';
    normalized.push({
      alias,
      ...(schemaId ? { schemaId } : {}),
      required,
      ...(description ? { description } : {}),
    });
  }

  return normalized;
}

function deriveEnrichmentSources(config: RuntimeMappingConfig): readonly MappingEnrichmentSource[] {
  const canonical = normalizeCanonicalEnrichmentSources(config.enrichmentSources);
  if (canonical.length > 0) {
    return canonical;
  }

  const legacyExternalAliases = normalizeLegacyExternalAliases(config.config?.externalSources);
  return legacyExternalAliases.map((alias) => ({ alias, required: false }));
}

function findMissingRequiredEnrichments(
  config: RuntimeMappingConfig,
  externalSources: Readonly<Record<string, unknown>>,
): readonly string[] {
  const enrichmentSources = deriveEnrichmentSources(config);
  return enrichmentSources
    .filter((source) => source.required !== false)
    .map((source) => source.alias)
    .filter((alias) => !Object.hasOwn(externalSources, alias));
}

function parseSnapshotConfig(snapshotRaw: string): Parameters<typeof execute>[0] | null {
  const parsed = JSON.parse(snapshotRaw) as RuntimeSnapshotPayload;
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  if (parsed.mappingConfig && typeof parsed.mappingConfig === 'object') {
    return parsed.mappingConfig as Parameters<typeof execute>[0];
  }

  if (parsed.config && typeof parsed.config === 'object') {
    return parsed.config as Parameters<typeof execute>[0];
  }

  return null;
}

function hasUnresolvedProjectValueTableReferences(config: Parameters<typeof execute>[0]): boolean {
  const rules = Array.isArray((config as { rules?: unknown }).rules)
    ? ((config as { rules: readonly unknown[] }).rules)
    : [];

  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') {
      continue;
    }

    const valueTableRef = (rule as { valueTableRef?: unknown }).valueTableRef;
    if (!valueTableRef || typeof valueTableRef !== 'object') {
      continue;
    }

    const scope = (valueTableRef as { scope?: unknown }).scope;
    if (scope !== 'project') {
      continue;
    }

    const resolvedEntries = (valueTableRef as { resolvedEntries?: unknown }).resolvedEntries;
    if (!Array.isArray(resolvedEntries)) {
      return true;
    }
  }

  return false;
}

function logExecute(fields: {
  requestId: string;
  mappingId: string;
  snapshotId?: string;
  outcome: 'success' | 'not-deployed' | 'validation-error' | 'integrity-error' | 'error';
  durationMs: number;
}): void {
  console.info(
    JSON.stringify({
      eventType: 'execute',
      ...fields,
    }),
  );
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startedAt = Date.now();
  const requestId = generateRequestId();
  const request = parseExecuteRequest(parseBody(event));

  if (!request) {
    logExecute({
      requestId,
      mappingId: 'unknown',
      outcome: 'validation-error',
      durationMs: Date.now() - startedAt,
    });

    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid runtime execute request body. Expected { mappingId, sourceData }',
      400,
      false,
      requestId,
    );
  }

  try {
    const active = await getActiveSnapshot(request.mappingId);
    if (!active) {
      logExecute({
        requestId,
        mappingId: request.mappingId,
        outcome: 'not-deployed',
        durationMs: Date.now() - startedAt,
      });

      return errorResponse(
        ERROR_CODES.SOURCE_NOT_FOUND,
        `No active runtime snapshot found for mapping '${request.mappingId}'`,
        404,
        false,
        requestId,
      );
    }

    const snapshotKey = runtimeSnapshotKey(request.mappingId, active.activeSnapshotId);
    const rawSnapshot = await getObject({
      Bucket: RUNTIME_BUCKET_NAME,
      Key: snapshotKey,
    });

    const config = parseSnapshotConfig(rawSnapshot);
    if (!config) {
      logExecute({
        requestId,
        mappingId: request.mappingId,
        snapshotId: active.activeSnapshotId,
        outcome: 'integrity-error',
        durationMs: Date.now() - startedAt,
      });

      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        `Runtime snapshot payload invalid: ${request.mappingId}:${active.activeSnapshotId}`,
        500,
        false,
        requestId,
      );
    }

    if (hasUnresolvedProjectValueTableReferences(config)) {
      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        `Runtime snapshot is missing resolved project value-table entries: ${request.mappingId}:${active.activeSnapshotId}`,
        500,
        false,
        requestId,
      );
    }

    const missingRequiredAliases = findMissingRequiredEnrichments(
      config as RuntimeMappingConfig,
      request.externalSources,
    );

    if (missingRequiredAliases.length > 0) {
      const aliases = [...uniqueAliases(missingRequiredAliases)].sort();
      const aliasList = aliases.join(', ');
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `Missing required enrichment payload(s): ${aliasList}`,
        400,
        false,
        requestId,
      );
    }

    const result = execute(config, request.sourceData, null, null, {
      externalSources: request.externalSources,
    });

    logExecute({
      requestId,
      mappingId: request.mappingId,
      snapshotId: active.activeSnapshotId,
      outcome: 'success',
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse(
      200,
      {
        mappingId: request.mappingId,
        snapshotId: active.activeSnapshotId,
        output: (result.output ?? {}) as Readonly<Record<string, unknown>>,
        diagnostics: result.diagnostics,
        stats: result.stats,
      },
      requestId,
    );
  } catch {
    logExecute({
      requestId,
      mappingId: request.mappingId,
      outcome: 'error',
      durationMs: Date.now() - startedAt,
    });

    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }
}
