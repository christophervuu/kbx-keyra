import {
  ERROR_CODES,
  errorResponse,
  getItem,
  getObject,
  internalError,
  jsonResponse,
  notFound,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import type { SchemaDataFormat, SchemaSamplePayloadMetadata } from '../../lib/persistence/types.js';

interface SchemaMetadataRecord {
  readonly schemaId: string;
  readonly samplePayloads?: readonly SchemaSamplePayloadMetadata[];
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

function parseSampleRaw(raw: string, dataFormat: SchemaDataFormat): unknown | null {
  if (dataFormat === 'xml') {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
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

    const sample = (metadata.samplePayloads ?? []).find((entry) => entry.sampleId === sampleId);
    if (!sample) {
      const err = notFound('Schema sample', `${schemaId}:${sampleId}`);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const raw = await getObject({
      Bucket: getContentBucketOrThrow(),
      Key: sample.contentRef,
    });

    return jsonResponse(200, {
      schemaId,
      sampleId,
      dataFormat: sample.dataFormat,
      raw,
      parsed: parseSampleRaw(raw, sample.dataFormat),
    });
  } catch {
    const err = internalError('Failed to load schema sample payload');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
