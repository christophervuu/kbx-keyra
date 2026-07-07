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
  readonly sourceData: unknown;
  readonly enrichmentInputs: Readonly<Record<string, unknown>>;
  readonly executionContext: {
    readonly correlationId?: string;
    readonly trace: boolean;
  };
  readonly responseMode: 'legacy' | 'canonical';
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
  if (!isNonEmptyString(mappingId) || !Object.hasOwn(body, 'sourceData')) {
    return null;
  }

  const sourceData = body.sourceData;
  const enrichmentInputsCandidate = body.enrichmentInputs;
  const externalSourcesCandidate = body.externalSources;
  const executionContextCandidate = body.executionContext;
  const responseModeCandidate = body.responseMode;

  if (enrichmentInputsCandidate !== undefined && (!enrichmentInputsCandidate || typeof enrichmentInputsCandidate !== 'object' || Array.isArray(enrichmentInputsCandidate))) {
    return null;
  }

  if (externalSourcesCandidate !== undefined && (!externalSourcesCandidate || typeof externalSourcesCandidate !== 'object' || Array.isArray(externalSourcesCandidate))) {
    return null;
  }

  if (executionContextCandidate !== undefined && (!executionContextCandidate || typeof executionContextCandidate !== 'object' || Array.isArray(executionContextCandidate))) {
    return null;
  }

  const enrichmentInputs = {
    ...(
      externalSourcesCandidate && typeof externalSourcesCandidate === 'object' && !Array.isArray(externalSourcesCandidate)
        ? (externalSourcesCandidate as Readonly<Record<string, unknown>>)
        : {}
    ),
    ...(
      enrichmentInputsCandidate && typeof enrichmentInputsCandidate === 'object' && !Array.isArray(enrichmentInputsCandidate)
        ? (enrichmentInputsCandidate as Readonly<Record<string, unknown>>)
        : {}
    ),
  };

  const executionContextRecord = executionContextCandidate as Record<string, unknown> | undefined;
  const correlationIdRaw = executionContextRecord?.correlationId;
  const traceRaw = executionContextRecord?.trace;

  if (correlationIdRaw !== undefined && !isNonEmptyString(correlationIdRaw)) {
    return null;
  }

  if (traceRaw !== undefined && typeof traceRaw !== 'boolean') {
    return null;
  }

  if (responseModeCandidate !== undefined && responseModeCandidate !== 'legacy' && responseModeCandidate !== 'canonical') {
    return null;
  }

  return {
    mappingId,
    sourceData,
    enrichmentInputs,
    executionContext: {
      ...(isNonEmptyString(correlationIdRaw) ? { correlationId: correlationIdRaw.trim() } : {}),
      trace: traceRaw === true,
    },
    responseMode: responseModeCandidate === 'canonical' ? 'canonical' : 'legacy',
  };
}

function runtimeTaxonomyDetails(code: string): { runtimeErrorCode: string } {
  return {
    runtimeErrorCode: code,
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

function hasImmutableSchemaBundle(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const record = payload as Record<string, unknown>;
  const metadata = record.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }

  const schemaRefs = (metadata as Record<string, unknown>).schemaRefs;
  return Array.isArray(schemaRefs);
}

function hasDerivableImmutableSchemaPins(config: RuntimeMappingConfig): boolean {
  const source = (config as { sourceSchemaRef?: unknown }).sourceSchemaRef;
  const target = (config as { targetSchemaRef?: unknown }).targetSchemaRef;

  const hasPinnedRef = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const record = value as Record<string, unknown>;
    const schemaVersion = record.schemaVersion;
    return (
      typeof record.schemaId === 'string'
      && typeof schemaVersion === 'number'
      && Number.isInteger(schemaVersion)
      && schemaVersion > 0
      && typeof record.schemaVersionId === 'string'
      && typeof record.contentHash === 'string'
    );
  };

  if (hasPinnedRef(source) || hasPinnedRef(target)) {
    return true;
  }

  const enrichments = Array.isArray(config.enrichmentSources) ? config.enrichmentSources : [];
  return enrichments.some((entry) => hasPinnedRef(entry));
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

function serializeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(typeof error.stack === 'string' ? { stack: error.stack } : {}),
    };
  }

  return {
    name: 'UnknownError',
    message: typeof error === 'string' ? error : 'Unknown error',
  };
}

function logExecuteError(fields: {
  requestId: string;
  mappingId: string;
  snapshotId?: string;
  phase: string;
  error: unknown;
  durationMs: number;
}): void {
  console.error(
    JSON.stringify({
      eventType: 'execute-error',
      requestId: fields.requestId,
      mappingId: fields.mappingId,
      ...(fields.snapshotId ? { snapshotId: fields.snapshotId } : {}),
      phase: fields.phase,
      durationMs: fields.durationMs,
      ...serializeError(fields.error),
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
      'Invalid runtime execute request body. Expected { mappingId, sourceData, enrichmentInputs?, executionContext?, responseMode? }',
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
        runtimeTaxonomyDetails('MappingNotDeployed'),
      );
    }

    const snapshotKey = runtimeSnapshotKey(request.mappingId, active.activeSnapshotId);
    const rawSnapshot = await getObject({
      Bucket: RUNTIME_BUCKET_NAME,
      Key: snapshotKey,
    });

    const snapshotPayload = JSON.parse(rawSnapshot) as unknown;
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
        runtimeTaxonomyDetails('SnapshotInvalid'),
      );
    }

    if (!hasImmutableSchemaBundle(snapshotPayload)) {
      console.warn(
        JSON.stringify({
          eventType: 'execute-legacy-snapshot-schema-bundle-missing',
          requestId,
          mappingId: request.mappingId,
          snapshotId: active.activeSnapshotId,
          compatibilityFallback: hasDerivableImmutableSchemaPins(config as RuntimeMappingConfig)
            ? 'derived-from-config-pins'
            : 'migration-window-allowed',
        }),
      );
    }

    if (hasUnresolvedProjectValueTableReferences(config)) {
      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        `Runtime snapshot is missing resolved project value-table entries: ${request.mappingId}:${active.activeSnapshotId}`,
        500,
        false,
        requestId,
        runtimeTaxonomyDetails('ArtifactCorrupt'),
      );
    }

    const missingRequiredAliases = findMissingRequiredEnrichments(
      config as RuntimeMappingConfig,
      request.enrichmentInputs,
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
        runtimeTaxonomyDetails('MissingEnrichmentInput'),
      );
    }

    const result = execute(config, request.sourceData, null, null, {
      trace: request.executionContext.trace,
      externalSources: request.enrichmentInputs,
    });

    logExecute({
      requestId,
      mappingId: request.mappingId,
      snapshotId: active.activeSnapshotId,
      outcome: 'success',
      durationMs: Date.now() - startedAt,
    });

    const canonicalResponse = {
      outputFormat: 'json' as const,
      output: (result.output ?? {}) as Readonly<Record<string, unknown>>,
      diagnostics: result.diagnostics,
      metadata: {
        mappingId: request.mappingId,
        snapshotId: active.activeSnapshotId,
        snapshotHash: active.snapshotHash,
        sourceType: active.sourceType,
        sourceNumber: active.sourceNumber,
        engineVersion: (config as { engineVersion?: unknown }).engineVersion ?? null,
        executedAt: new Date().toISOString(),
        correlationId: request.executionContext.correlationId ?? null,
        traceEnabled: request.executionContext.trace,
        stats: result.stats,
      },
    };

    if (request.responseMode === 'canonical') {
      return jsonResponse(200, canonicalResponse, requestId);
    }

    return jsonResponse(
      200,
      {
        mappingId: request.mappingId,
        snapshotId: active.activeSnapshotId,
        output: canonicalResponse.output,
        diagnostics: canonicalResponse.diagnostics,
        stats: canonicalResponse.metadata.stats,
        compatibility: {
          mode: 'legacy',
          canonical: canonicalResponse,
        },
      },
      requestId,
    );
  } catch (error) {
    logExecute({
      requestId,
      mappingId: request.mappingId,
      outcome: 'error',
      durationMs: Date.now() - startedAt,
    });
    logExecuteError({
      requestId,
      mappingId: request.mappingId,
      phase: 'execute-runtime-snapshot',
      error,
      durationMs: Date.now() - startedAt,
    });

    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }
}
