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

interface MappingVersionEntry {
  readonly mappingId: string;
  readonly version: number;
  readonly savedAt: string;
  readonly savedBy: string;
  readonly ruleCount: number;
  readonly config?: Record<string, unknown>;
  readonly configS3Key?: string;
}

interface MappingVersionResponse {
  readonly mappingId: string;
  readonly version: number;
  readonly savedAt: string;
  readonly savedBy: string;
  readonly ruleCount: number;
  readonly config: Record<string, unknown>;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const MAPPING_VERSIONS_TABLE = getEnvValue('MAPPING_VERSIONS_TABLE');
const CONTENT_BUCKET = getEnvValue('CONTENT_BUCKET');

function getMappingVersionsTableOrThrow(): string {
  const table = MAPPING_VERSIONS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPING_VERSIONS_TABLE');
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

function parseVersion(versionParam: string | null): number | null {
  if (!versionParam) {
    return null;
  }

  const value = Number(versionParam);
  if (!Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function isConfigObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const version = parseVersion(parsePathParam(event, 'version'));
  if (version === null) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing or invalid path parameter: version', 400, false);
  }

  try {
    const entry = await getItem<MappingVersionEntry>({
      TableName: getMappingVersionsTableOrThrow(),
      Key: { mappingId, version },
    });

    if (!entry) {
      const err = notFound('Mapping version', `${mappingId}:${version}`);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    let config: Record<string, unknown>;

    if (isConfigObject(entry.config)) {
      config = entry.config;
    } else if (typeof entry.configS3Key === 'string' && entry.configS3Key.trim() !== '') {
      const rawConfig = await getObject({
        Bucket: getContentBucketOrThrow(),
        Key: entry.configS3Key,
      });
      config = JSON.parse(rawConfig) as Record<string, unknown>;
    } else {
      const appError = contentUnavailable(
        `Mapping version '${mappingId}:${version}' metadata exists but version content is unavailable in storage`,
      );
      return errorResponse(appError.code, appError.message, appError.statusCode, appError.retryable, appError.requestId);
    }

    const response: MappingVersionResponse = {
      mappingId: entry.mappingId,
      version: entry.version,
      savedAt: entry.savedAt,
      savedBy: entry.savedBy,
      ruleCount: entry.ruleCount,
      config,
    };

    return jsonResponse(200, response);
  } catch (error) {
    if (error instanceof S3ServiceError && error.appError.code === ERROR_CODES.RESOURCE_NOT_FOUND) {
      const appError = contentUnavailable(
        `Mapping version '${mappingId}:${version}' metadata exists but version content is unavailable in storage`,
      );
      return errorResponse(appError.code, appError.message, appError.statusCode, appError.retryable, appError.requestId);
    }

    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
