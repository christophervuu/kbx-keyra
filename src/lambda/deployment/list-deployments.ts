import {
  ERROR_CODES,
  errorResponse,
  getItem,
  internalError,
  jsonResponse,
  parsePathParam,
  parseQueryParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { listHistory } from '../../lib/persistence/deployments.js';

type DeploymentEnvironment = 'DEV' | 'PREPROD' | 'PROD';

interface MappingMetadata {
  readonly mappingId: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

function getMappingsTableOrThrow(): string {
  const table = getEnvValue('MAPPINGS_TABLE')?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return table;
}

function parseEnvironment(value: string | null): DeploymentEnvironment | null {
  if (value === null) {
    return null;
  }

  if (value === 'DEV' || value === 'PREPROD' || value === 'PROD') {
    return value;
  }

  // FS-081 legacy compatibility: allow QA query value and normalize to PREPROD.
  if (value === 'QA') {
    return 'PREPROD';
  }

  return null;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const rawEnvironment = parseQueryParam(event, 'environment');
  const environment = parseEnvironment(rawEnvironment);

  if (rawEnvironment !== null && !environment) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid query parameter: environment', 400, false);
  }

  try {
    const mapping = await getItem<MappingMetadata>({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
    });

    if (!mapping) {
      return errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Mapping with id '${mappingId}' not found`, 404, false);
    }

    const history = await listHistory(mappingId, environment ?? undefined);
    return jsonResponse(200, history);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
