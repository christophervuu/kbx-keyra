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

interface MappingRevisionEntry {
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

const MAPPING_REVISIONS_TABLE = getEnvValue('MAPPING_REVISIONS_TABLE');
const CONTENT_BUCKET = getEnvValue('CONTENT_BUCKET');

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

function parseRevision(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const revision = parseRevision(parsePathParam(event, 'revision'));
  if (revision === null) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing or invalid path parameter: revision', 400, false);
  }

  try {
    const entry = await getItem<MappingRevisionEntry>({
      TableName: getMappingRevisionsTableOrThrow(),
      Key: { mappingId, revision },
    });

    if (!entry) {
      const err = notFound('Mapping revision', `${mappingId}:${revision}`);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const rawConfig = await getObject({
      Bucket: getContentBucketOrThrow(),
      Key: entry.configS3Key,
    });

    return jsonResponse(200, {
      ...entry,
      config: JSON.parse(rawConfig) as Record<string, unknown>,
    });
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
