import {
  ERROR_CODES,
  errorResponse,
  getItem,
  internalError,
  jsonResponse,
  notFound,
  parsePathParam,
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

    return jsonResponse(200, entry);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
