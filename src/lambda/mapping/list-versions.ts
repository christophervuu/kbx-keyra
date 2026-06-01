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

interface MappingVersionEntry {
  readonly mappingId: string;
  readonly version: number;
  readonly revisionNumber: number;
  readonly createdAt: string;
  readonly createdBy: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const MAPPING_VERSIONS_TABLE = getEnvValue('MAPPING_VERSIONS_TABLE');

function getMappingVersionsTableOrThrow(): string {
  const table = MAPPING_VERSIONS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPING_VERSIONS_TABLE');
  }

  return table;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  try {
    const versions = await query<MappingVersionEntry>({
      TableName: getMappingVersionsTableOrThrow(),
      KeyConditionExpression: '#mappingId = :mappingId',
      ExpressionAttributeNames: {
        '#mappingId': 'mappingId',
      },
      ExpressionAttributeValues: {
        ':mappingId': mappingId,
      },
      ScanIndexForward: false,
    });

    return jsonResponse(200, versions);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
