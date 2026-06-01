import {
  ERROR_CODES,
  deleteItem,
  errorResponse,
  internalError,
  jsonResponse,
  parseBody,
  parsePathParam,
  putItem,
  query,
  requireFields,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

interface MappingVersionEntry {
  readonly mappingId: string;
  readonly version: number;
  readonly savedAt: string;
  readonly savedBy: string;
  readonly ruleCount: number;
  readonly config: Record<string, unknown>;
}

const MAX_VERSIONS_PER_MAPPING = 50;

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

function isConfigObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseVersion(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function parseRuleCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

async function pruneOldestVersions(mappingId: string, versions: readonly MappingVersionEntry[]): Promise<void> {
  if (versions.length <= MAX_VERSIONS_PER_MAPPING) {
    return;
  }

  const sortedAscending = [...versions].sort((a, b) => a.version - b.version);
  const pruneCount = sortedAscending.length - MAX_VERSIONS_PER_MAPPING;
  const toDelete = sortedAscending.slice(0, pruneCount);

  for (const entry of toDelete) {
    await deleteItem({
      TableName: getMappingVersionsTableOrThrow(),
      Key: { mappingId, version: entry.version },
    });
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const body = parseBody(event);
  const required = requireFields(body, ['version', 'savedAt', 'savedBy', 'ruleCount', 'config']);
  if (!required.ok) {
    const err = required.error;
    return errorResponse(err?.code ?? ERROR_CODES.VALIDATION_ERROR, err?.message ?? 'Validation failed', err?.statusCode ?? 400, err?.retryable ?? false);
  }

  const version = parseVersion(body?.version);
  if (version === null) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: version must be a non-negative integer', 400, false);
  }

  const ruleCount = parseRuleCount(body?.ruleCount);
  if (ruleCount === null) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: ruleCount must be a non-negative integer', 400, false);
  }

  if (typeof body?.savedAt !== 'string' || body.savedAt.trim() === '') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: savedAt must be a non-empty string', 400, false);
  }

  if (typeof body?.savedBy !== 'string' || body.savedBy.trim() === '') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: savedBy must be a non-empty string', 400, false);
  }

  if (!isConfigObject(body?.config)) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: config must be an object', 400, false);
  }

  try {
    const entry: MappingVersionEntry = {
      mappingId,
      version,
      savedAt: body.savedAt,
      savedBy: body.savedBy,
      ruleCount,
      config: body.config,
    };

    await putItem({
      TableName: getMappingVersionsTableOrThrow(),
      Item: entry,
    });

    const versions = await query<MappingVersionEntry>({
      TableName: getMappingVersionsTableOrThrow(),
      KeyConditionExpression: '#mappingId = :mappingId',
      ExpressionAttributeNames: {
        '#mappingId': 'mappingId',
      },
      ExpressionAttributeValues: {
        ':mappingId': mappingId,
      },
    });

    await pruneOldestVersions(mappingId, versions);

    return jsonResponse(204, null);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
