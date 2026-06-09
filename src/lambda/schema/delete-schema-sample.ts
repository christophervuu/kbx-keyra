import {
  ERROR_CODES,
  deleteObject,
  errorResponse,
  getItem,
  internalError,
  notFound,
  parsePathParam,
  updateItem,
  jsonResponse,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import type { SchemaSamplePayloadMetadata } from '../../lib/persistence/types.js';

interface SchemaMetadataRecord {
  readonly schemaId: string;
  readonly samplePayloads?: readonly SchemaSamplePayloadMetadata[];
  readonly samplePayloadCount?: number;
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

function nowIso(): string {
  return new Date().toISOString();
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const schemaId = parsePathParam(event, 'id');
  if (!schemaId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: id', 400, false);
  }

  const sampleId = parsePathParam(event, 'sampleId');
  if (!sampleId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: sampleId', 400, false);
  }

  try {
    const metadata = await getItem<SchemaMetadataRecord>({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId },
    });

    if (!metadata) {
      const err = notFound('Schema', schemaId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const existingSamples = metadata.samplePayloads ?? [];
    const sampleToDelete = existingSamples.find((sample) => sample.sampleId === sampleId);

    if (!sampleToDelete) {
      const err = notFound('Schema sample', `${schemaId}:${sampleId}`);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const nextSamples = existingSamples.filter((sample) => sample.sampleId !== sampleId);
    const updatedAt = nowIso();

    const updated = await updateItem<SchemaMetadataRecord>({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId },
      UpdateExpression: [
        'SET #samplePayloads = :samplePayloads',
        '#samplePayloadCount = :samplePayloadCount',
        '#updatedAt = :updatedAt',
      ].join(', '),
      ExpressionAttributeNames: {
        '#samplePayloads': 'samplePayloads',
        '#samplePayloadCount': 'samplePayloadCount',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':samplePayloads': nextSamples,
        ':samplePayloadCount': nextSamples.length,
        ':updatedAt': updatedAt,
      },
      ReturnValues: 'ALL_NEW',
    });

    await deleteObject({
      Bucket: getContentBucketOrThrow(),
      Key: sampleToDelete.contentRef,
    });

    return jsonResponse(200, {
      metadata: updated,
    });
  } catch {
    const err = internalError('Failed to delete schema sample payload');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
