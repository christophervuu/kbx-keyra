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
  readonly enrichmentSources?: readonly MappingEnrichmentSource[];
  readonly ruleCount: number;
  readonly coverage: number;
  readonly updatedAt: string;
}

interface MappingEnrichmentSource {
  readonly alias: string;
  readonly schemaId?: string;
  readonly required?: boolean;
  readonly description?: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');
const KEYRA_DEBUG_MAPPING_STATUS = getEnvValue('KEYRA_DEBUG_MAPPING_STATUS');

function isMappingStatusDebugEnabled(): boolean {
  if (!KEYRA_DEBUG_MAPPING_STATUS) {
    return false;
  }

  const normalized = KEYRA_DEBUG_MAPPING_STATUS.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function mappingStatusDebugLog(message: string, payload?: unknown): void {
  if (!isMappingStatusDebugEnabled()) {
    return;
  }

  if (payload === undefined) {
    console.info(`[mapping-status-debug] ${message}`);
    return;
  }

  console.info(`[mapping-status-debug] ${message}`, payload);
}

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

    mappingStatusDebugLog('list-mappings response summary', {
      projectId,
      total: mappings.length,
      statusCounts: mappings.reduce(
        (counts, mapping) => {
          counts[mapping.status] += 1;
          return counts;
        },
        { draft: 0, ready: 0, 'has-errors': 0 } as Record<MappingMetadata['status'], number>,
      ),
      sample: mappings.slice(0, 5).map((mapping) => ({
        mappingId: mapping.mappingId,
        status: mapping.status,
        ruleCount: mapping.ruleCount,
        coverage: mapping.coverage,
        sourceSchemaId: mapping.sourceSchemaId ?? null,
        targetSchemaId: mapping.targetSchemaId ?? null,
      })),
    });

    return jsonResponse(200, mappings);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
