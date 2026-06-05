import {
  ERROR_CODES,
  errorResponse,
  getItem,
  getObject,
  internalError,
  jsonResponse,
  notFound,
  parseBody,
  parsePathParam,
  putItem,
  putObject,
  requireFields,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

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

interface MappingConfig {
  readonly id?: string;
  readonly projectId?: string;
  readonly name: string;
  readonly version: number;
  readonly engineVersion: string;
  readonly sourceSchemaRef?: unknown;
  readonly targetSchemaRef?: unknown;
  readonly config: Record<string, unknown>;
  readonly rules: readonly unknown[];
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

function buildConfigS3Key(mappingId: string): string {
  return `mappings/${mappingId}/config.json`;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const body = parseBody(event);
  const required = requireFields(body, ['name']);
  if (!required.ok) {
    const err = required.error;
    return errorResponse(err?.code ?? ERROR_CODES.VALIDATION_ERROR, err?.message ?? 'Validation failed', err?.statusCode ?? 400, err?.retryable ?? false);
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

    const sourceConfigContent = await getObject({
      Bucket: getContentBucketOrThrow(),
      Key: existing.configS3Key,
    });
    const sourceConfig = JSON.parse(sourceConfigContent) as MappingConfig;

    const newMappingId = generateMappingId();
    const now = new Date().toISOString();
    const newConfigS3Key = buildConfigS3Key(newMappingId);

    const duplicatedConfig: MappingConfig = {
      ...sourceConfig,
      id: newMappingId,
      projectId: existing.projectId,
      name: String(body?.name ?? ''),
      version: 1,
    };

    const duplicatedMetadata: MappingMetadata = {
      ...existing,
      mappingId: newMappingId,
      name: duplicatedConfig.name,
      version: 1,
      configS3Key: newConfigS3Key,
      createdAt: now,
      updatedAt: now,
    };

    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: newConfigS3Key,
      Body: JSON.stringify(duplicatedConfig),
      ContentType: 'application/json',
    });

    await putItem({
      TableName: getMappingsTableOrThrow(),
      Item: duplicatedMetadata,
    });

    return jsonResponse(201, duplicatedMetadata);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
