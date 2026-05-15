import {
  errorResponse,
  internalError,
  jsonResponse,
  scan,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

interface SchemaMetadata {
  readonly schemaId: string;
  readonly name: string;
  readonly format: 'json-schema' | 'xsd';
  readonly fieldCount: number;
  readonly origin: 'cdm' | 'published' | 'local';
  readonly status: 'ingesting' | 'ready' | 'error';
  readonly scope: 'global' | 'project';
  readonly description?: string;
  readonly updatedBy?: string;
  readonly inferred?: boolean;
  readonly syncStatus: 'synced' | 'not-synced' | 'local-changes';
  readonly source: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const SCHEMAS_TABLE = getEnvValue('SCHEMAS_TABLE');

function getSchemasTableOrThrow(): string {
  const table = SCHEMAS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: SCHEMAS_TABLE');
  }

  return table;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  void event;

  try {
    const schemas = await scan<SchemaMetadata>({
      TableName: getSchemasTableOrThrow(),
    });

    return jsonResponse(200, schemas);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
