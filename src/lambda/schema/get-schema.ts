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
import { normalizeSchemaSyncStatus } from '../../lib/persistence/types.js';

type SchemaFormat = 'json-schema' | 'xsd';

interface SchemaMetadata {
  readonly schemaId: string;
  readonly syncStatus: 'synced' | 'update-available' | 'sync-failed' | 'not-synced' | 'local-changes';
  readonly format: SchemaFormat;
}

interface SchemaDetail {
  readonly metadata: SchemaMetadata;
  readonly content: Record<string, unknown> | string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const SCHEMAS_TABLE = getEnvValue('SCHEMAS_TABLE');
const CONTENT_BUCKET = getEnvValue('CONTENT_BUCKET');

function getSchemasTableOrThrow(): string {
  const table = SCHEMAS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: SCHEMAS_TABLE');
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

function contentKey(schemaId: string, format: SchemaFormat): string {
  return `schemas/${schemaId}/content.${format === 'xsd' ? 'xsd' : 'json'}`;
}

function parseContent(raw: string, format: SchemaFormat): Record<string, unknown> | string {
  if (format === 'xsd') {
    return raw;
  }

  return JSON.parse(raw) as Record<string, unknown>;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const schemaId = parsePathParam(event, 'id');
  if (!schemaId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: id', 400, false);
  }

  try {
    const metadata = await getItem<SchemaMetadata>({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId },
    });

    if (!metadata) {
      const err = notFound('Schema', schemaId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const raw = await getObject({
      Bucket: getContentBucketOrThrow(),
      Key: contentKey(schemaId, metadata.format),
    });

    const detail: SchemaDetail = {
      metadata: {
        ...metadata,
        syncStatus: normalizeSchemaSyncStatus(metadata.syncStatus),
      },
      content: parseContent(raw, metadata.format),
    };

    return jsonResponse(200, detail);
  } catch (error) {
    if (error instanceof S3ServiceError && error.appError.code === ERROR_CODES.RESOURCE_NOT_FOUND) {
      const appError = contentUnavailable(
        `Schema '${schemaId}' metadata exists but schema content is unavailable in storage`,
      );
      return errorResponse(appError.code, appError.message, appError.statusCode, appError.retryable, appError.requestId);
    }

    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
