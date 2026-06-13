import { validate } from '../../engine/index.js';
import type {
  MappingConfig as EngineMappingConfig,
  MappingRule as EngineMappingRule,
  SchemaRef as EngineSchemaRef,
} from '../../engine/types/index.js';
import {
  computeConfigHash,
  type MappingConfig as PersistenceMappingConfig,
} from '../../lib/persistence/index.js';
import {
  ERROR_CODES,
  conflict,
  errorResponse,
  getItem,
  getObject,
  internalError,
  jsonResponse,
  notFound,
  parseBody,
  parsePathParam,
  putObject,
  query,
  requireFields,
  updateItem,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

interface SchemaRef {
  readonly schemaId: string;
  readonly type: 'github' | 'local' | 'published';
  readonly commitSha?: string;
}

interface MappingRule {
  readonly target: string;
  readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'any';
  readonly expression: string;
  readonly description?: string;
}

interface MappingConfigOptions {
  readonly unmappedTargets?: 'omit' | 'null' | 'error';
  readonly nullSubtrees?: readonly string[];
  readonly constants?: Readonly<Record<string, unknown>>;
  readonly externalSources?: readonly string[];
  readonly editorPreferences?: {
    readonly defaultSelectedSampleId?: string;
  };
}

interface MappingConfig {
  readonly id?: string;
  readonly projectId?: string;
  readonly name: string;
  readonly businessContext?: string;
  readonly version: number;
  readonly engineVersion: string;
  readonly sourceSchemaRef?: SchemaRef;
  readonly targetSchemaRef?: SchemaRef;
  readonly enrichmentSources?: readonly MappingEnrichmentSource[];
  readonly config: MappingConfigOptions;
  readonly rules: readonly MappingRule[];
}

interface MappingEnrichmentSource {
  readonly alias: string;
  readonly schemaId?: string;
  readonly required?: boolean;
  readonly description?: string;
}

interface MappingMetadata {
  readonly mappingId: string;
  readonly projectId: string;
  readonly name: string;
  readonly businessContext?: string;
  readonly version: number;
  readonly revision?: number;
  readonly latestVersion?: number | null;
  readonly configHash?: string;
  readonly status: 'draft' | 'ready' | 'has-errors';
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly enrichmentSources?: readonly MappingEnrichmentSource[];
  readonly ruleCount: number;
  readonly coverage: number;
  readonly configS3Key: string;
  readonly createdAt: string;
  readonly updatedAt: string;
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

function normalizeCanonicalEnrichmentSources(value: unknown): {
  ok: true;
  value: readonly MappingEnrichmentSource[];
} | {
  ok: false;
  message: string;
} {
  if (value === undefined) {
    return { ok: true, value: [] };
  }

  if (!Array.isArray(value)) {
    return { ok: false, message: 'Invalid enrichmentSources: expected array' };
  }

  const aliases = new Set<string>();
  const normalized: MappingEnrichmentSource[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, message: 'Invalid enrichmentSources: entries must be objects' };
    }

    const candidate = entry as Record<string, unknown>;
    const alias = typeof candidate.alias === 'string' ? candidate.alias.trim() : '';
    const schemaId = typeof candidate.schemaId === 'string' ? candidate.schemaId.trim() : '';

    if (!alias) {
      return { ok: false, message: 'Invalid enrichmentSources: alias is required' };
    }

    if (!schemaId) {
      return { ok: false, message: `Invalid enrichmentSources: schemaId is required for alias '${alias}'` };
    }

    if (aliases.has(alias)) {
      return { ok: false, message: `Invalid enrichmentSources: duplicate alias '${alias}'` };
    }

    aliases.add(alias);

    const required = typeof candidate.required === 'boolean' ? candidate.required : true;
    const description = typeof candidate.description === 'string' ? candidate.description.trim() : '';
    normalized.push({
      alias,
      schemaId,
      required,
      ...(description ? { description } : {}),
    });
  }

  return { ok: true, value: normalized };
}

function deriveCompatibilityExternals(
  enrichmentSources: readonly MappingEnrichmentSource[],
  legacyExternalAliases: readonly string[],
): readonly string[] {
  return uniqueAliases([
    ...enrichmentSources.map((source) => source.alias),
    ...legacyExternalAliases,
  ]);
}

function deriveEnrichmentSources(
  canonical: readonly MappingEnrichmentSource[],
  legacyExternalAliases: readonly string[],
): readonly MappingEnrichmentSource[] {
  if (canonical.length > 0) {
    return canonical;
  }

  return legacyExternalAliases.map((alias) => ({ alias, required: false }));
}

function normalizeOptionalBusinessContext(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

interface MappingRevisionItem {
  readonly mappingId: string;
  readonly revision: number;
  readonly savedAt: string;
  readonly savedBy: string;
  readonly ruleCount: number;
  readonly configS3Key: string;
  readonly configHash: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');
const MAPPING_REVISIONS_TABLE = getEnvValue('MAPPING_REVISIONS_TABLE');
const SCHEMAS_TABLE = getEnvValue('SCHEMAS_TABLE');
const CONTENT_BUCKET = getEnvValue('CONTENT_BUCKET');

function getMappingsTableOrThrow(): string {
  const table = MAPPINGS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return table;
}

function getMappingRevisionsTableOrThrow(): string {
  const table = MAPPING_REVISIONS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPING_REVISIONS_TABLE');
  }

  return table;
}

function getContentBucketOrThrow(): string {
  const bucket = CONTENT_BUCKET?.trim();
  if (!bucket) {
    throw new Error('Missing required environment variable: CONTENT_BUCKET');
  }

  return bucket;
}

function getSchemasTable(): string | null {
  const table = SCHEMAS_TABLE?.trim();
  return table && table.length > 0 ? table : null;
}

interface SchemaMetadata {
  readonly schemaId: string;
  readonly format: 'json-schema' | 'xsd';
}

function buildSchemaContentS3Key(schemaId: string, format: SchemaMetadata['format']): string {
  return `schemas/${schemaId}/content.${format === 'xsd' ? 'xsd' : 'json'}`;
}

async function loadTargetSchemaContent(schemaId: string | undefined): Promise<unknown | null> {
  if (!schemaId) {
    return null;
  }

  const schemasTable = getSchemasTable();
  if (!schemasTable) {
    return null;
  }

  try {
    const schemaMetadata = await getItem<SchemaMetadata>({
      TableName: schemasTable,
      Key: { schemaId },
    });

    if (!schemaMetadata) {
      return null;
    }

    const rawSchema = await getObject({
      Bucket: getContentBucketOrThrow(),
      Key: buildSchemaContentS3Key(schemaId, schemaMetadata.format),
    });

    if (schemaMetadata.format === 'xsd') {
      return rawSchema;
    }

    return JSON.parse(rawSchema) as unknown;
  } catch {
    return null;
  }
}

function toEngineConfig(config: MappingConfig): EngineMappingConfig {
  const sourceSchemaRef: EngineSchemaRef = {
    schemaId: config.sourceSchemaRef?.schemaId ?? '',
    type: config.sourceSchemaRef?.type === 'github' ? 'github' : 'local',
    ...(config.sourceSchemaRef?.commitSha ? { commitSha: config.sourceSchemaRef.commitSha } : {}),
  };

  const targetSchemaRef: EngineSchemaRef = {
    schemaId: config.targetSchemaRef?.schemaId ?? '',
    type: config.targetSchemaRef?.type === 'github' ? 'github' : 'local',
    ...(config.targetSchemaRef?.commitSha ? { commitSha: config.targetSchemaRef.commitSha } : {}),
  };

  const rules: EngineMappingRule[] = (config.rules ?? []).map((rule) => ({
    target: rule.target,
    type: (rule.type === 'null' || rule.type === 'any' ? 'string' : rule.type) as EngineMappingRule['type'],
    expression: rule.expression,
    ...(rule.description ? { description: rule.description } : {}),
  }));

  return {
    name: config.name,
    version: config.version,
    engineVersion: config.engineVersion,
    sourceSchemaRef,
    targetSchemaRef,
    config: {
      unmappedTargets: config.config.unmappedTargets ?? 'omit',
      nullSubtrees: config.config.nullSubtrees ?? [],
      constants: config.config.constants ?? {},
      externalSources: config.config.externalSources ?? [],
    },
    rules,
  };
}

async function deriveStatusAndCoverage(config: MappingConfig): Promise<{ status: MappingMetadata['status']; coverage: number; ruleCount: number }> {
  const ruleCount = config.rules.length;
  if (ruleCount === 0) {
    return { status: 'draft', coverage: 0, ruleCount };
  }

  const targetSchema = await loadTargetSchemaContent(config.targetSchemaRef?.schemaId);
  const result = validate(toEngineConfig(config), null, targetSchema);
  const hasErrors = result.diagnostics.some((diagnostic) => diagnostic.severity === 'error');

  return {
    status: hasErrors ? 'has-errors' : 'ready',
    coverage: result.coverage?.percentage ?? 0,
    ruleCount,
  };
}

function getCurrentRevision(metadata: MappingMetadata): number {
  return metadata.revision ?? metadata.version;
}

function toRevisionS3Key(mappingId: string, revision: number): string {
  return `mappings/${mappingId}/revisions/r${revision}.json`;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const body = parseBody(event);
  const required = requireFields(body, ['projectId', 'name', 'expectedRevision']);
  if (!required.ok) {
    const err = required.error;
    return errorResponse(err?.code ?? ERROR_CODES.VALIDATION_ERROR, err?.message ?? 'Validation failed', err?.statusCode ?? 400, err?.retryable ?? false);
  }

  const expectedRevision = body?.expectedRevision;
  if (typeof expectedRevision !== 'number') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required field: expectedRevision', 400, false);
  }

  try {
    const existing = await getItem<MappingMetadata>({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
    });

    if (!existing) {
      const err = notFound('Mapping', mappingId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const currentRevision = getCurrentRevision(existing);
    if (expectedRevision !== currentRevision) {
      const err = conflict(`Revision mismatch: expected ${currentRevision}, got ${expectedRevision}. Reload and retry.`);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const nextRevision = currentRevision + 1;
    const businessContext = normalizeOptionalBusinessContext(body?.businessContext);
    const canonicalEnrichment = normalizeCanonicalEnrichmentSources(body?.enrichmentSources);
    if (!canonicalEnrichment.ok) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, canonicalEnrichment.message, 400, false);
    }

    const inputConfig = (body?.config as MappingConfigOptions | undefined) ?? {};
    const legacyExternalAliases = normalizeLegacyExternalAliases((inputConfig as Record<string, unknown>).externalSources);
    const derivedEnrichmentSources = deriveEnrichmentSources(canonicalEnrichment.value, legacyExternalAliases);
    const enrichmentSources = canonicalEnrichment.value.length === 0
      && legacyExternalAliases.length === 0
      && Array.isArray(existing.enrichmentSources)
      ? existing.enrichmentSources
      : derivedEnrichmentSources;
    const externalSources = deriveCompatibilityExternals(enrichmentSources, legacyExternalAliases);

    const config: MappingConfig = {
      id: mappingId,
      projectId: typeof body?.projectId === 'string' ? body.projectId : existing.projectId,
      name: typeof body?.name === 'string' ? body.name : existing.name,
      ...(businessContext ? { businessContext } : {}),
      version: nextRevision,
      engineVersion: typeof body?.engineVersion === 'string' ? body.engineVersion : '1.0.0',
      sourceSchemaRef: (body?.sourceSchemaRef as SchemaRef | undefined) ?? undefined,
      targetSchemaRef: (body?.targetSchemaRef as SchemaRef | undefined) ?? undefined,
      enrichmentSources,
      config: {
        ...inputConfig,
        externalSources,
      },
      rules: Array.isArray(body?.rules) ? (body.rules as MappingRule[]) : [],
    };

    const configHash = await computeConfigHash({ ...config, version: 0 } as PersistenceMappingConfig);
    const latestRevisionEntries = await query<MappingRevisionItem>({
      TableName: getMappingRevisionsTableOrThrow(),
      KeyConditionExpression: '#mappingId = :mappingId',
      ExpressionAttributeNames: {
        '#mappingId': 'mappingId',
      },
      ExpressionAttributeValues: {
        ':mappingId': mappingId,
      },
      ScanIndexForward: false,
      Limit: 1,
    });

    const latestRevision = latestRevisionEntries[0] ?? null;
    if (latestRevision?.configHash === configHash) {
      return jsonResponse(200, {
        mappingId,
        revision: currentRevision,
        noChange: true,
      });
    }

    const derivation = await deriveStatusAndCoverage(config);
    const updatedAt = new Date().toISOString();

    const revisionConfigS3Key = toRevisionS3Key(mappingId, nextRevision);
    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: revisionConfigS3Key,
      Body: JSON.stringify(config),
      ContentType: 'application/json',
    });

    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: existing.configS3Key,
      Body: JSON.stringify(config),
      ContentType: 'application/json',
    });

    await updateItem({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
      UpdateExpression:
        'SET #projectId = :projectId, #name = :name, #businessContext = :businessContext, #revision = :revision, #version = :version, #status = :status, #sourceSchemaId = :sourceSchemaId, #targetSchemaId = :targetSchemaId, #enrichmentSources = :enrichmentSources, #ruleCount = :ruleCount, #coverage = :coverage, #updatedAt = :updatedAt, #configHash = :configHash',
      ExpressionAttributeNames: {
        '#projectId': 'projectId',
        '#name': 'name',
        '#businessContext': 'businessContext',
        '#revision': 'revision',
        '#version': 'version',
        '#status': 'status',
        '#sourceSchemaId': 'sourceSchemaId',
        '#targetSchemaId': 'targetSchemaId',
        '#enrichmentSources': 'enrichmentSources',
        '#ruleCount': 'ruleCount',
        '#coverage': 'coverage',
        '#updatedAt': 'updatedAt',
        '#configHash': 'configHash',
      },
      ExpressionAttributeValues: {
        ':projectId': config.projectId ?? existing.projectId,
        ':name': config.name,
        ':businessContext': businessContext ?? existing.businessContext ?? null,
        ':revision': nextRevision,
        ':version': nextRevision,
        ':status': derivation.status,
        ':sourceSchemaId': config.sourceSchemaRef?.schemaId ?? existing.sourceSchemaId ?? null,
        ':targetSchemaId': config.targetSchemaRef?.schemaId ?? existing.targetSchemaId ?? null,
        ':enrichmentSources': enrichmentSources,
        ':ruleCount': derivation.ruleCount,
        ':coverage': derivation.coverage,
        ':updatedAt': updatedAt,
        ':configHash': configHash,
      },
      ReturnValues: 'ALL_NEW',
    });

    await updateItem({
      TableName: getMappingRevisionsTableOrThrow(),
      Key: { mappingId, revision: nextRevision },
      UpdateExpression:
        'SET #savedAt = :savedAt, #savedBy = :savedBy, #ruleCount = :ruleCount, #configS3Key = :configS3Key, #configHash = :configHash',
      ExpressionAttributeNames: {
        '#savedAt': 'savedAt',
        '#savedBy': 'savedBy',
        '#ruleCount': 'ruleCount',
        '#configS3Key': 'configS3Key',
        '#configHash': 'configHash',
      },
      ExpressionAttributeValues: {
        ':savedAt': updatedAt,
        ':savedBy': 'system',
        ':ruleCount': derivation.ruleCount,
        ':configS3Key': revisionConfigS3Key,
        ':configHash': configHash,
      },
      ReturnValues: 'ALL_NEW',
    });

    return jsonResponse(200, {
      mappingId,
      revision: nextRevision,
      noChange: false,
      status: derivation.status,
      ruleCount: derivation.ruleCount,
      coverage: derivation.coverage,
      updatedAt,
    });
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
