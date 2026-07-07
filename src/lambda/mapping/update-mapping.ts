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
  readonly schemaVersion?: number;
  readonly schemaVersionId?: string;
  readonly contentHash?: string;
}

interface MappingRule {
  readonly target: string;
  readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'any';
  readonly expression: string;
  readonly description?: string;
  readonly valueTableRef?: MappingRuleValueTableRef;
  readonly noMatchBehavior?: MappingRuleNoMatchBehavior;
}

type ValueTablePrimitiveValue = string | number | boolean;

interface MappingRuleResolvedEntry {
  readonly in: ValueTablePrimitiveValue;
  readonly out: ValueTablePrimitiveValue;
  readonly rowId: string;
}

interface MappingRuleProjectValueTableRef {
  readonly scope: 'project';
  readonly valueTableId: string;
  readonly tableKey: string;
  readonly revision: number;
  readonly inputSideKey: string;
  readonly outputSideKey: string;
  readonly inputType: 'string' | 'number' | 'boolean';
  readonly outputType: 'string' | 'number' | 'boolean';
  readonly resolvedEntries: readonly MappingRuleResolvedEntry[];
}

interface MappingRuleInlineValueTableRef {
  readonly scope: 'inline';
}

type MappingRuleValueTableRef = MappingRuleProjectValueTableRef | MappingRuleInlineValueTableRef;

interface MappingRuleNoMatchBehavior {
  readonly mode: 'return_null' | 'return_input' | 'fallback_value';
  readonly fallbackValue?: ValueTablePrimitiveValue;
}

type MappingRuleType = MappingRule['type'];

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
  readonly schemaVersion?: number;
  readonly schemaVersionId?: string;
  readonly contentHash?: string;
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

    const schemaVersion = typeof candidate.schemaVersion === 'number' && Number.isInteger(candidate.schemaVersion)
      ? candidate.schemaVersion
      : undefined;
    const schemaVersionId = typeof candidate.schemaVersionId === 'string' ? candidate.schemaVersionId.trim() : '';
    const contentHash = typeof candidate.contentHash === 'string' ? candidate.contentHash.trim() : '';

    if (!schemaVersion || !schemaVersionId || !contentHash) {
      return {
        ok: false,
        message: `Invalid enrichmentSources: immutable schema pin required for alias '${alias}' (schemaVersion, schemaVersionId, contentHash)`,
      };
    }

    const required = typeof candidate.required === 'boolean' ? candidate.required : true;
    const description = typeof candidate.description === 'string' ? candidate.description.trim() : '';
    normalized.push({
      alias,
      schemaId,
      schemaVersion,
      schemaVersionId,
      contentHash,
      required,
      ...(description ? { description } : {}),
    });
  }

  return { ok: true, value: normalized };
}

function normalizeSchemaRef(
  value: unknown,
  label: 'sourceSchemaRef' | 'targetSchemaRef',
): { ok: true; value: SchemaRef | undefined } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (!value || typeof value !== 'object') {
    return { ok: false, message: `Invalid ${label}: expected object` };
  }

  const candidate = value as Record<string, unknown>;
  const schemaId = typeof candidate.schemaId === 'string' ? candidate.schemaId.trim() : '';
  const schemaVersion =
    typeof candidate.schemaVersion === 'number' && Number.isInteger(candidate.schemaVersion)
      ? candidate.schemaVersion
      : undefined;
  const schemaVersionId = typeof candidate.schemaVersionId === 'string' ? candidate.schemaVersionId.trim() : '';
  const contentHash = typeof candidate.contentHash === 'string' ? candidate.contentHash.trim() : '';

  if (!schemaId || !schemaVersion || !schemaVersionId || !contentHash) {
    return {
      ok: false,
      message: `Invalid ${label}: immutable schema pin required (schemaId, schemaVersion, schemaVersionId, contentHash)`,
    };
  }

  const typeValue = candidate.type;
  const type: SchemaRef['type'] =
    typeValue === 'github' || typeValue === 'published' || typeValue === 'local'
      ? typeValue
      : 'local';

  return {
    ok: true,
    value: {
      schemaId,
      type,
      ...(typeof candidate.commitSha === 'string' && candidate.commitSha.trim()
        ? { commitSha: candidate.commitSha.trim() }
        : {}),
      schemaVersion,
      schemaVersionId,
      contentHash,
    },
  };
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
const KEYRA_DEBUG_MAPPING_STATUS = getEnvValue('KEYRA_DEBUG_MAPPING_STATUS');

function isMappingStatusDebugEnabled(): boolean {
  if (!KEYRA_DEBUG_MAPPING_STATUS) {
    return false;
  }

  const normalized = KEYRA_DEBUG_MAPPING_STATUS.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function mappingStatusDebugLog(message: string, payload?: unknown): void {
  if (!isMappingStatusDebugEnabled()) {
    return;
  }

  if (payload === undefined) {
    console.info(`[mapping-status-debug] ${message}`);
    return;
  }

  console.info(`[mapping-status-debug] ${message}`, payload);
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeSchemaType(type: unknown): MappingRuleType | null {
  if (type === 'integer' || type === 'number') return 'number';
  if (type === 'string' || type === 'boolean' || type === 'object' || type === 'array' || type === 'null' || type === 'any') {
    return type;
  }
  return null;
}

function collectTargetTypesFromJsonSchema(
  schema: unknown,
  pathPrefix: string,
  output: Map<string, MappingRuleType>,
): void {
  if (!isRecord(schema)) return;
  const properties = schema.properties;
  if (!isRecord(properties)) return;

  for (const [field, child] of Object.entries(properties)) {
    const path = pathPrefix ? `${pathPrefix}.${field}` : field;
    if (!isRecord(child)) continue;

    const normalized = normalizeSchemaType(child.type);
    if (normalized) {
      output.set(path, normalized);
    }

    collectTargetTypesFromJsonSchema(child, path, output);
  }
}

function inferTypeFromSampleValue(value: unknown): MappingRuleType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object') return 'object';
  return 'any';
}

function collectTargetTypesFromSamplePayload(
  value: unknown,
  pathPrefix: string,
  output: Map<string, MappingRuleType>,
): void {
  if (!isRecord(value)) return;

  for (const [field, child] of Object.entries(value)) {
    const path = pathPrefix ? `${pathPrefix}.${field}` : field;
    output.set(path, inferTypeFromSampleValue(child));
    collectTargetTypesFromSamplePayload(child, path, output);
  }
}

function buildTargetTypeByPath(targetSchema: unknown): ReadonlyMap<string, MappingRuleType> {
  const map = new Map<string, MappingRuleType>();
  if (!isRecord(targetSchema)) return map;

  const hasJsonSchemaShape = typeof targetSchema.type === 'string' && isRecord(targetSchema.properties);
  if (hasJsonSchemaShape) {
    collectTargetTypesFromJsonSchema(targetSchema, '', map);
    return map;
  }

  collectTargetTypesFromSamplePayload(targetSchema, '', map);
  return map;
}

function toJsonSchemaFromSamplePayload(value: unknown): unknown {
  if (value === null) {
    return { type: 'null' };
  }

  if (Array.isArray(value)) {
    const first = value.length > 0 ? value[0] : null;
    return {
      type: 'array',
      items: toJsonSchemaFromSamplePayload(first),
    };
  }

  if (!isRecord(value)) {
    if (typeof value === 'string') return { type: 'string' };
    if (typeof value === 'number') return { type: 'number' };
    if (typeof value === 'boolean') return { type: 'boolean' };
    return { type: 'any' };
  }

  const properties: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    properties[key] = toJsonSchemaFromSamplePayload(child);
  }

  return {
    type: 'object',
    properties,
  };
}

function normalizeSchemaForValidation(schema: unknown): unknown {
  if (!isRecord(schema)) {
    return schema;
  }

  if (typeof schema.type === 'string') {
    return schema;
  }

  if (isRecord(schema.properties)) {
    return schema;
  }

  return toJsonSchemaFromSamplePayload(schema);
}

function canonicalizeTargetPath(path: string): string {
  return path
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.toLowerCase())
    .join('.');
}

function buildCanonicalTargetTypeByPath(
  targetTypeByPath: ReadonlyMap<string, MappingRuleType>,
): ReadonlyMap<string, MappingRuleType> {
  const map = new Map<string, MappingRuleType>();

  for (const [path, type] of targetTypeByPath.entries()) {
    const canonicalPath = canonicalizeTargetPath(path);
    if (!canonicalPath || map.has(canonicalPath)) {
      continue;
    }

    map.set(canonicalPath, type);
  }

  return map;
}

function normalizeRulesByTargetSchema(
  rules: readonly MappingRule[],
  targetSchema: unknown | null,
): readonly MappingRule[] {
  if (!targetSchema) return rules;

  const targetTypeByPath = buildTargetTypeByPath(targetSchema);
  const canonicalTargetTypeByPath = buildCanonicalTargetTypeByPath(targetTypeByPath);
  let changed = false;

  const normalized = rules.map((rule) => {
    const exactTargetType = targetTypeByPath.get(rule.target);
    const canonicalTargetType = canonicalTargetTypeByPath.get(canonicalizeTargetPath(rule.target));
    const targetType = exactTargetType ?? canonicalTargetType;

    if (rule.target === 'financial.totalAmount' || rule.target === 'financial.TotalAmount') {
      console.info('update-mapping type-normalization trace', {
        target: rule.target,
        incomingType: rule.type,
        exactTargetType: exactTargetType ?? null,
        canonicalTargetType: canonicalTargetType ?? null,
        resolvedTargetType: targetType ?? null,
      });
    }

    if (!targetType || rule.type === targetType) {
      return rule;
    }

    changed = true;
    return {
      ...rule,
      type: targetType,
    };
  });

  return changed ? normalized : rules;
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
  } catch (error) {
    const details = error as { message?: unknown; name?: unknown; code?: unknown };
    mappingStatusDebugLog('failed to load target schema content', {
      schemaId,
      schemasTable,
      errorName: typeof details.name === 'string' ? details.name : null,
      errorCode: typeof details.code === 'string' ? details.code : null,
      errorMessage: typeof details.message === 'string' ? details.message : 'unknown error',
    });
    return null;
  }
}

function toEngineConfig(config: MappingConfig): EngineMappingConfig {
  const sourceSchemaRef: EngineSchemaRef = {
    schemaId: config.sourceSchemaRef?.schemaId ?? '',
    type: config.sourceSchemaRef?.type === 'github' ? 'github' : 'local',
    ...(config.sourceSchemaRef?.commitSha ? { commitSha: config.sourceSchemaRef.commitSha } : {}),
    ...(typeof config.sourceSchemaRef?.schemaVersion === 'number' ? { schemaVersion: config.sourceSchemaRef.schemaVersion } : {}),
    ...(config.sourceSchemaRef?.schemaVersionId ? { schemaVersionId: config.sourceSchemaRef.schemaVersionId } : {}),
    ...(config.sourceSchemaRef?.contentHash ? { contentHash: config.sourceSchemaRef.contentHash } : {}),
  };

  const targetSchemaRef: EngineSchemaRef = {
    schemaId: config.targetSchemaRef?.schemaId ?? '',
    type: config.targetSchemaRef?.type === 'github' ? 'github' : 'local',
    ...(config.targetSchemaRef?.commitSha ? { commitSha: config.targetSchemaRef.commitSha } : {}),
    ...(typeof config.targetSchemaRef?.schemaVersion === 'number' ? { schemaVersion: config.targetSchemaRef.schemaVersion } : {}),
    ...(config.targetSchemaRef?.schemaVersionId ? { schemaVersionId: config.targetSchemaRef.schemaVersionId } : {}),
    ...(config.targetSchemaRef?.contentHash ? { contentHash: config.targetSchemaRef.contentHash } : {}),
  };

  const rules: EngineMappingRule[] = (config.rules ?? []).map((rule) => ({
    target: rule.target,
    type: (rule.type === 'null' || rule.type === 'any' ? 'string' : rule.type) as EngineMappingRule['type'],
    expression: rule.expression,
    ...(rule.description ? { description: rule.description } : {}),
    ...(rule.valueTableRef ? { valueTableRef: rule.valueTableRef } : {}),
    ...(rule.noMatchBehavior ? { noMatchBehavior: rule.noMatchBehavior } : {}),
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
    mappingStatusDebugLog('status derivation: zero rules -> draft', {
      mappingId: config.id ?? null,
      targetSchemaId: config.targetSchemaRef?.schemaId ?? null,
    });
    return { status: 'draft', coverage: 0, ruleCount };
  }

  const targetSchema = await loadTargetSchemaContent(config.targetSchemaRef?.schemaId);
  const normalizedTargetSchema = normalizeSchemaForValidation(targetSchema);
  const result = validate(toEngineConfig(config), null, normalizedTargetSchema);
  const hasErrors = result.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  const errorCount = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warningCount = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
  const firstError = result.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
  mappingStatusDebugLog('status derivation summary', {
    mappingId: config.id ?? null,
    targetSchemaId: config.targetSchemaRef?.schemaId ?? null,
    targetSchemaLoaded: targetSchema !== null,
    ruleCount,
    diagnostics: {
      total: result.diagnostics.length,
      errors: errorCount,
      warnings: warningCount,
    },
    derivedStatus: hasErrors ? 'has-errors' : 'ready',
    coverage: result.coverage?.percentage ?? 0,
  });
  if (firstError) {
    mappingStatusDebugLog('status derivation first error', {
      mappingId: config.id ?? null,
      code: firstError.code,
      message: firstError.message,
      targetPath: firstError.targetPath ?? null,
      ruleIndex: firstError.ruleIndex ?? null,
      expression: firstError.expression ?? null,
    });
  }

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
    mappingStatusDebugLog('update request received', {
      mappingId,
      expectedRevision,
      currentRevision,
      existingStatus: existing.status,
      existingRuleCount: existing.ruleCount,
      existingCoverage: existing.coverage,
      existingConfigHash: existing.configHash ?? null,
      existingSourceSchemaId: existing.sourceSchemaId ?? null,
      existingTargetSchemaId: existing.targetSchemaId ?? null,
    });
    if (expectedRevision !== currentRevision) {
      const err = conflict(`Revision mismatch: expected ${currentRevision}, got ${expectedRevision}. Reload and retry.`);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const nextRevision = currentRevision + 1;
    const businessContext = normalizeOptionalBusinessContext(body?.businessContext);
    const sourceSchemaRefResult = normalizeSchemaRef(body?.sourceSchemaRef, 'sourceSchemaRef');
    if (!sourceSchemaRefResult.ok) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, sourceSchemaRefResult.message, 400, false);
    }

    const targetSchemaRefResult = normalizeSchemaRef(body?.targetSchemaRef, 'targetSchemaRef');
    if (!targetSchemaRefResult.ok) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, targetSchemaRefResult.message, 400, false);
    }

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

    const targetSchema = await loadTargetSchemaContent(targetSchemaRefResult.value?.schemaId ?? existing.targetSchemaId);
    const incomingRules = Array.isArray(body?.rules) ? (body.rules as MappingRule[]) : [];
    const normalizedRules = normalizeRulesByTargetSchema(incomingRules, targetSchema);

    const config: MappingConfig = {
      id: mappingId,
      projectId: typeof body?.projectId === 'string' ? body.projectId : existing.projectId,
      name: typeof body?.name === 'string' ? body.name : existing.name,
      ...(businessContext ? { businessContext } : {}),
      version: nextRevision,
      engineVersion: typeof body?.engineVersion === 'string' ? body.engineVersion : '1.0.0',
      sourceSchemaRef: sourceSchemaRefResult.value,
      targetSchemaRef: targetSchemaRefResult.value,
      enrichmentSources,
      config: {
        ...inputConfig,
        externalSources,
      },
      rules: normalizedRules,
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
    mappingStatusDebugLog('computed update hash', {
      mappingId,
      configHash,
      latestRevisionHash: latestRevision?.configHash ?? null,
      latestRevisionNumber: latestRevision?.revision ?? null,
      normalizedRuleCount: normalizedRules.length,
      sourceSchemaId: config.sourceSchemaRef?.schemaId ?? existing.sourceSchemaId ?? null,
      targetSchemaId: config.targetSchemaRef?.schemaId ?? existing.targetSchemaId ?? null,
    });
    if (latestRevision?.configHash === configHash) {
      const derivation = await deriveStatusAndCoverage(config);

      const shouldRefreshDerivedMetadata =
        existing.status !== derivation.status
        || existing.ruleCount !== derivation.ruleCount
        || existing.coverage !== derivation.coverage
        || existing.configHash !== configHash;

      if (shouldRefreshDerivedMetadata) {
        mappingStatusDebugLog('no-change save refreshing derived metadata', {
          mappingId,
          previousStatus: existing.status,
          nextStatus: derivation.status,
          previousRuleCount: existing.ruleCount,
          nextRuleCount: derivation.ruleCount,
          previousCoverage: existing.coverage,
          nextCoverage: derivation.coverage,
        });
        await updateItem({
          TableName: getMappingsTableOrThrow(),
          Key: { mappingId },
          UpdateExpression:
            'SET #status = :status, #ruleCount = :ruleCount, #coverage = :coverage, #configHash = :configHash',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#ruleCount': 'ruleCount',
            '#coverage': 'coverage',
            '#configHash': 'configHash',
          },
          ExpressionAttributeValues: {
            ':status': derivation.status,
            ':ruleCount': derivation.ruleCount,
            ':coverage': derivation.coverage,
            ':configHash': configHash,
          },
          ReturnValues: 'ALL_NEW',
        });
      }

      if (!shouldRefreshDerivedMetadata) {
        mappingStatusDebugLog('no-change save kept existing derived metadata', {
          mappingId,
          status: existing.status,
          ruleCount: existing.ruleCount,
          coverage: existing.coverage,
        });
      }

      return jsonResponse(200, {
        mappingId,
        revision: currentRevision,
        noChange: true,
      });
    }

    const derivation = await deriveStatusAndCoverage(config);
    mappingStatusDebugLog('persisting changed mapping', {
      mappingId,
      nextRevision,
      derivedStatus: derivation.status,
      derivedRuleCount: derivation.ruleCount,
      derivedCoverage: derivation.coverage,
      sourceSchemaId: config.sourceSchemaRef?.schemaId ?? existing.sourceSchemaId ?? null,
      targetSchemaId: config.targetSchemaRef?.schemaId ?? existing.targetSchemaId ?? null,
    });
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
