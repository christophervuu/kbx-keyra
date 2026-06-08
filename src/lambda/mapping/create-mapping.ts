import { validate } from '../../engine/index.js';
import type {
  MappingConfig as EngineMappingConfig,
  MappingRule as EngineMappingRule,
  SchemaRef as EngineSchemaRef,
} from '../../engine/types/index.js';
import {
  ERROR_CODES,
  errorResponse,
  getItem,
  getObject,
  internalError,
  jsonResponse,
  parseBody,
  putItem,
  putObject,
  requireFields,
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
  readonly config: MappingConfigOptions;
  readonly rules: readonly MappingRule[];
}

interface MappingMetadata {
  readonly mappingId: string;
  readonly projectId: string;
  readonly name: string;
  readonly businessContext?: string;
  readonly version: number;
  readonly status: 'draft' | 'ready' | 'has-errors';
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly ruleCount: number;
  readonly coverage: number;
  readonly configS3Key: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');
const SCHEMAS_TABLE = getEnvValue('SCHEMAS_TABLE');
const CONTENT_BUCKET = getEnvValue('CONTENT_BUCKET');

function getMappingsTableOrThrow(): string {
  const table = MAPPINGS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
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

function generateMappingId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
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

function buildConfigS3Key(mappingId: string): string {
  return `mappings/${mappingId}/config.json`;
}

function normalizeOptionalBusinessContext(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  const required = requireFields(body, ['projectId', 'name']);
  if (!required.ok) {
    const err = required.error;
    return errorResponse(err?.code ?? ERROR_CODES.VALIDATION_ERROR, err?.message ?? 'Validation failed', err?.statusCode ?? 400, err?.retryable ?? false);
  }

  try {
    const mappingId = generateMappingId();
    const now = new Date().toISOString();
    const businessContext = normalizeOptionalBusinessContext(body?.businessContext);
    const config: MappingConfig = {
      id: mappingId,
      projectId: String(body?.projectId ?? ''),
      name: String(body?.name ?? ''),
      ...(businessContext ? { businessContext } : {}),
      version: 1,
      engineVersion: typeof body?.engineVersion === 'string' ? body.engineVersion : '1.0.0',
      sourceSchemaRef: (body?.sourceSchemaRef as SchemaRef | undefined) ?? undefined,
      targetSchemaRef: (body?.targetSchemaRef as SchemaRef | undefined) ?? undefined,
      config: (body?.config as MappingConfigOptions | undefined) ?? {},
      rules: (Array.isArray(body?.rules) ? (body?.rules as MappingRule[]) : []),
    };

    const configS3Key = buildConfigS3Key(mappingId);
    const derivation = await deriveStatusAndCoverage(config);

    const metadata: MappingMetadata = {
      mappingId,
      projectId: config.projectId ?? '',
      name: config.name,
      ...(businessContext ? { businessContext } : {}),
      version: 1,
      status: derivation.status,
      sourceSchemaId: config.sourceSchemaRef?.schemaId,
      targetSchemaId: config.targetSchemaRef?.schemaId,
      ruleCount: derivation.ruleCount,
      coverage: derivation.coverage,
      configS3Key,
      createdAt: now,
      updatedAt: now,
    };

    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: configS3Key,
      Body: JSON.stringify(config),
      ContentType: 'application/json',
    });

    await putItem({
      TableName: getMappingsTableOrThrow(),
      Item: metadata,
    });

    return jsonResponse(201, metadata);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
