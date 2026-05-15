import {
  ERROR_CODES,
  errorResponse,
  getItem,
  internalError,
  jsonResponse,
  notFound,
  parseBody,
  parsePathParam,
  query,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

interface SchemaMetadata {
  readonly schemaId: string;
}

interface SchemaNodeRecord {
  readonly schemaId: string;
  readonly path: string;
  readonly fieldName: string;
  readonly type: string;
  readonly description?: string;
}

interface SchemaSearchResult {
  readonly path: string;
  readonly fieldName: string;
  readonly type: string;
  readonly description?: string;
}

const MAX_RESULTS = 50;

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const SCHEMAS_TABLE = getEnvValue('SCHEMAS_TABLE');
const SCHEMA_NODES_TABLE = getEnvValue('SCHEMA_NODES_TABLE');

function getSchemasTableOrThrow(): string {
  const table = SCHEMAS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: SCHEMAS_TABLE');
  }

  return table;
}

function getSchemaNodesTableOrThrow(): string {
  const table = SCHEMA_NODES_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: SCHEMA_NODES_TABLE');
  }

  return table;
}

function normalizeQuery(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.toLowerCase();
}

function matchesQuery(node: SchemaNodeRecord, normalizedQuery: string): boolean {
  return node.path.toLowerCase().includes(normalizedQuery) || node.fieldName.toLowerCase().includes(normalizedQuery);
}

function toSearchResult(node: SchemaNodeRecord): SchemaSearchResult {
  return {
    path: node.path,
    fieldName: node.fieldName,
    type: node.type,
    ...(typeof node.description === 'string' ? { description: node.description } : {}),
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const schemaId = parsePathParam(event, 'id');
  if (!schemaId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: id', 400, false);
  }

  const body = parseBody(event);
  const normalizedQuery = normalizeQuery(body?.query);
  if (!normalizedQuery) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required field: query', 400, false);
  }

  try {
    const schema = await getItem<SchemaMetadata>({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId },
    });

    if (!schema) {
      const err = notFound('Schema', schemaId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const nodes = await query<SchemaNodeRecord>({
      TableName: getSchemaNodesTableOrThrow(),
      KeyConditionExpression: '#schemaId = :schemaId',
      ExpressionAttributeNames: {
        '#schemaId': 'schemaId',
      },
      ExpressionAttributeValues: {
        ':schemaId': schemaId,
      },
    });

    const results = nodes.filter((node) => matchesQuery(node, normalizedQuery)).slice(0, MAX_RESULTS).map(toSearchResult);
    return jsonResponse(200, results);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
