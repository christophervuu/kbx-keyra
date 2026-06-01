import {
  ERROR_CODES,
  errorResponse,
  internalError,
  jsonResponse,
  parsePathParam,
  query,
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

function getMappingRevisionsTableOrThrow(): string {
  const table = MAPPING_REVISIONS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPING_REVISIONS_TABLE');
  }

  return table;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  try {
    const revisions = await query<MappingRevisionEntry>({
      TableName: getMappingRevisionsTableOrThrow(),
      KeyConditionExpression: '#mappingId = :mappingId',
      ExpressionAttributeNames: {
        '#mappingId': 'mappingId',
      },
      ExpressionAttributeValues: {
        ':mappingId': mappingId,
      },
      ScanIndexForward: false,
    });

    return jsonResponse(200, revisions);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
