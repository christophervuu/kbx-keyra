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

interface MappingMetadata {
  readonly mappingId: string;
  readonly projectId: string;
  readonly name: string;
  readonly businessContext?: string;
  readonly version: number;
  readonly status: 'draft' | 'ready' | 'has-errors';
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly ruleCount: number;
  readonly coverage: number;
  readonly updatedAt: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');

function getMappingsTableOrThrow(): string {
  const table = MAPPINGS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return table;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const projectId = parsePathParam(event, 'projectId') ?? parsePathParam(event, 'id');
  if (!projectId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: projectId', 400, false);
  }

  try {
    const mappings = await query<MappingMetadata>({
      TableName: getMappingsTableOrThrow(),
      IndexName: 'projectId-index',
      KeyConditionExpression: '#projectId = :projectId',
      ExpressionAttributeNames: {
        '#projectId': 'projectId',
      },
      ExpressionAttributeValues: {
        ':projectId': projectId,
      },
    });

    return jsonResponse(200, mappings);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
