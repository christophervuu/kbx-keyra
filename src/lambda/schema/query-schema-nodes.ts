import {
  getParentChain,
  getSchemaMetadata,
  searchSchemaNodes,
  type QuerySchemaNodesRequest,
  type SchemaQueryFilters,
  type SchemaSearchResult,
} from '../../lib/schema/index.js';

export interface APIGatewayProxyEvent {
  readonly body: string | null;
  readonly httpMethod?: string;
  readonly headers?: Record<string, string | undefined>;
  readonly pathParameters?: Record<string, string | undefined>;
}

export interface APIGatewayProxyResult {
  readonly statusCode: number;
  readonly headers?: Record<string, string>;
  readonly body: string;
}

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const DEFAULT_QUERY_LIMIT = 20;
const MAX_QUERY_LIMIT = 100;

function jsonResponse(statusCode: number, payload: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function parseRequestBody(body: string | null): Record<string, unknown> | null {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_QUERY_LIMIT;
  }

  const floored = Math.floor(value);
  if (floored <= 0) {
    return DEFAULT_QUERY_LIMIT;
  }

  return Math.min(floored, MAX_QUERY_LIMIT);
}

function parseFilters(value: unknown): SchemaQueryFilters | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const parsed: {
    type?: string[];
    isArray?: boolean;
    depth?: number;
  } = {};

  if (Array.isArray(record.type)) {
    const filtered = record.type.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
    if (filtered.length > 0) {
      parsed.type = filtered;
    }
  }

  if (typeof record.isArray === 'boolean') {
    parsed.isArray = record.isArray;
  }

  if (typeof record.depth === 'number' && Number.isFinite(record.depth)) {
    parsed.depth = Math.floor(record.depth);
  }

  if (parsed.type === undefined && parsed.isArray === undefined && parsed.depth === undefined) {
    return undefined;
  }

  return parsed;
}

function parseQueryRequest(body: Record<string, unknown>): QuerySchemaNodesRequest | null {
  const query = body.query;
  if (typeof query !== 'string' || query.trim() === '') {
    return null;
  }

  const includeParentChain = typeof body.includeParentChain === 'boolean' ? body.includeParentChain : undefined;

  return {
    query,
    filters: parseFilters(body.filters),
    includeParentChain,
    limit: normalizeLimit(body.limit),
  };
}

function getSchemaId(event: APIGatewayProxyEvent): string | null {
  const schemaId = event.pathParameters?.id?.trim();
  return schemaId ? schemaId : null;
}

async function enrichWithParentChain(
  schemaId: string,
  results: readonly SchemaSearchResult[],
): Promise<SchemaSearchResult[]> {
  const enriched = await Promise.all(
    results.map(async (result) => ({
      ...result,
      parentChain: await getParentChain(schemaId, result.path),
    })),
  );

  return enriched;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(200, { ok: true });
  }

  const schemaId = getSchemaId(event);
  if (!schemaId) {
    return jsonResponse(400, { error: 'Missing required path parameter: id' });
  }

  const body = parseRequestBody(event.body);
  if (!body) {
    return jsonResponse(400, { error: 'Invalid request body' });
  }

  const request = parseQueryRequest(body);
  if (!request) {
    return jsonResponse(400, { error: 'Missing required field: query' });
  }

  try {
    const metadata = await getSchemaMetadata(schemaId);
    if (!metadata) {
      return jsonResponse(404, { error: `Schema not found: ${schemaId}` });
    }

    const rawResults = await searchSchemaNodes(schemaId, request.query, request.filters, request.limit);

    const baseResults: SchemaSearchResult[] = rawResults.map((hit) => ({
      path: hit.path,
      fieldName: hit.fieldName,
      type: hit.type,
      depth: hit.depth,
      isArray: hit.isArray,
      score: hit.score,
      embeddingText: hit.embeddingText,
    }));

    const results = request.includeParentChain ? await enrichWithParentChain(schemaId, baseResults) : baseResults;

    return jsonResponse(200, results);
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unexpected query failure',
    });
  }
}
