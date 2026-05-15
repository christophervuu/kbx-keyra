import {
  ERROR_CODES,
  conflict,
  deleteItem,
  errorResponse,
  internalError,
  jsonResponse,
  parsePathParam,
  query,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const PROJECTS_TABLE = getEnvValue('PROJECTS_TABLE');
const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');

function getProjectsTableOrThrow(): string {
  const table = PROJECTS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: PROJECTS_TABLE');
  }

  return table;
}

function getMappingsTableOrThrow(): string {
  const table = MAPPINGS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return table;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const projectId = parsePathParam(event, 'id');
  if (!projectId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: id', 400, false);
  }

  try {
    const mappings = await query<unknown>({
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

    if (mappings.length > 0) {
      const err = conflict('Cannot delete project with existing mappings. Delete mappings first.');
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    await deleteItem({
      TableName: getProjectsTableOrThrow(),
      Key: { projectId },
    });

    return jsonResponse(204, {});
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
