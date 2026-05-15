import { validate } from '../../engine/index.js';
import type {
  MappingConfig as EngineMappingConfig,
  MappingRule as EngineMappingRule,
  SchemaRef as EngineSchemaRef,
} from '../../engine/types/index.js';
import {
  ERROR_CODES,
  conflict,
  errorResponse,
  getItem,
  internalError,
  jsonResponse,
  notFound,
  parseBody,
  parsePathParam,
  putObject,
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
}

interface MappingConfig {
  readonly id?: string;
  readonly projectId?: string;
  readonly name: string;
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

function deriveStatusAndCoverage(config: MappingConfig): { status: MappingMetadata['status']; coverage: number; ruleCount: number } {
  const ruleCount = config.rules.length;
  if (ruleCount === 0) {
    return { status: 'draft', coverage: 0, ruleCount };
  }

  const result = validate(toEngineConfig(config), null, null);
  const hasErrors = result.diagnostics.some((diagnostic) => diagnostic.severity === 'error');

  return {
    status: hasErrors ? 'has-errors' : 'ready',
    coverage: result.coverage?.percentage ?? 0,
    ruleCount,
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: id', 400, false);
  }

  const body = parseBody(event);
  const required = requireFields(body, ['projectId', 'name', 'version']);
  if (!required.ok) {
    const err = required.error;
    return errorResponse(err?.code ?? ERROR_CODES.VALIDATION_ERROR, err?.message ?? 'Validation failed', err?.statusCode ?? 400, err?.retryable ?? false);
  }

  const requestVersion = body?.version;
  if (typeof requestVersion !== 'number') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required field: version', 400, false);
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

    if (requestVersion !== existing.version) {
      const err = conflict(`Version mismatch: expected ${existing.version}, got ${requestVersion}. Reload and retry.`);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const nextVersion = existing.version + 1;
    const config: MappingConfig = {
      id: mappingId,
      projectId: typeof body?.projectId === 'string' ? body.projectId : existing.projectId,
      name: typeof body?.name === 'string' ? body.name : existing.name,
      version: nextVersion,
      engineVersion: typeof body?.engineVersion === 'string' ? body.engineVersion : '1.0.0',
      sourceSchemaRef: (body?.sourceSchemaRef as SchemaRef | undefined) ?? undefined,
      targetSchemaRef: (body?.targetSchemaRef as SchemaRef | undefined) ?? undefined,
      config: (body?.config as MappingConfigOptions | undefined) ?? {},
      rules: Array.isArray(body?.rules) ? (body.rules as MappingRule[]) : [],
    };

    const derivation = deriveStatusAndCoverage(config);
    const updatedAt = new Date().toISOString();

    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: existing.configS3Key,
      Body: JSON.stringify(config),
      ContentType: 'application/json',
    });

    const updatedMetadata: MappingMetadata = {
      ...existing,
      projectId: config.projectId ?? existing.projectId,
      name: config.name,
      version: nextVersion,
      status: derivation.status,
      sourceSchemaId: config.sourceSchemaRef?.schemaId,
      targetSchemaId: config.targetSchemaRef?.schemaId,
      ruleCount: derivation.ruleCount,
      coverage: derivation.coverage,
      updatedAt,
    };

    await updateItem({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
      UpdateExpression:
        'SET #projectId = :projectId, #name = :name, #version = :version, #status = :status, #sourceSchemaId = :sourceSchemaId, #targetSchemaId = :targetSchemaId, #ruleCount = :ruleCount, #coverage = :coverage, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#projectId': 'projectId',
        '#name': 'name',
        '#version': 'version',
        '#status': 'status',
        '#sourceSchemaId': 'sourceSchemaId',
        '#targetSchemaId': 'targetSchemaId',
        '#ruleCount': 'ruleCount',
        '#coverage': 'coverage',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':projectId': updatedMetadata.projectId,
        ':name': updatedMetadata.name,
        ':version': updatedMetadata.version,
        ':status': updatedMetadata.status,
        ':sourceSchemaId': updatedMetadata.sourceSchemaId,
        ':targetSchemaId': updatedMetadata.targetSchemaId,
        ':ruleCount': updatedMetadata.ruleCount,
        ':coverage': updatedMetadata.coverage,
        ':updatedAt': updatedMetadata.updatedAt,
      },
      ReturnValues: 'ALL_NEW',
    });

    return jsonResponse(200, updatedMetadata);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
