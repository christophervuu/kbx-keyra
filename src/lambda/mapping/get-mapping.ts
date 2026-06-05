import {
  contentUnavailable,
  ERROR_CODES,
  errorResponse,
  getItem,
  getObject,
  internalError,
  jsonResponse,
  notFound,
  parsePathParam,
  S3ServiceError,
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
  readonly sourceSchemaRef?: { readonly schemaId: string; readonly type: 'github' | 'local' | 'published'; readonly commitSha?: string };
  readonly targetSchemaRef?: { readonly schemaId: string; readonly type: 'github' | 'local' | 'published'; readonly commitSha?: string };
  readonly config: {
    readonly unmappedTargets?: 'omit' | 'null' | 'error';
    readonly nullSubtrees?: readonly string[];
    readonly constants?: Readonly<Record<string, unknown>>;
    readonly externalSources?: readonly string[];
  };
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

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  try {
    const metadata = await getItem<MappingMetadata>({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
    });

    if (!metadata) {
      const err = notFound('Mapping', mappingId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const content = await getObject({
      Bucket: getContentBucketOrThrow(),
      Key: metadata.configS3Key,
    });

    const parsed = JSON.parse(content) as MappingConfig;
    return jsonResponse(200, parsed);
  } catch (error) {
    if (error instanceof S3ServiceError && error.appError.code === ERROR_CODES.RESOURCE_NOT_FOUND) {
      const appError = contentUnavailable(
        `Mapping '${mappingId}' metadata exists but mapping content is unavailable in storage`,
      );
      return errorResponse(appError.code, appError.message, appError.statusCode, appError.retryable, appError.requestId);
    }

    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
