import {
  ERROR_CODES,
  errorResponse,
  generateRequestId,
  internalError,
  jsonResponse,
  notFound,
  parseBody,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import {
  classifySchemaSizeSegment,
  emitRetrievalTelemetry,
  readCorrelationId,
} from '../../lib/ai/telemetry.js';
import {
  getParentChain,
  getSchemaMetadata,
  getSchemaRetrieverMode,
  getSchemaRetriever,
  type SchemaSearchResult,
} from '../../lib/schema/index.js';

interface SchemaMetadata {
  readonly schemaId: string;
  readonly fieldCount?: number;
}

const MAX_RESULTS = 50;
const DEFAULT_RESULTS = 50;

function normalizeQuery(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeIncludeParentChain(value: unknown): boolean {
  return value === true;
}

function normalizeIncludeContextExpansion(value: unknown): boolean {
  return value === true;
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_RESULTS;
  }

  const floored = Math.floor(value);
  if (floored <= 0) {
    return DEFAULT_RESULTS;
  }

  return Math.min(floored, MAX_RESULTS);
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();
  const correlationId = readCorrelationId(event.headers);
  const schemaId = parsePathParam(event, 'id');
  if (!schemaId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: id', 400, false, requestId);
  }

  const body = parseBody(event);
  const queryValue = normalizeQuery(body?.query);
  if (!queryValue) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required field: query', 400, false, requestId);
  }

  const startedAt = Date.now();

  try {
    const schema = await getSchemaMetadata(schemaId) as SchemaMetadata | null;

    if (!schema) {
      const err = notFound('Schema', schemaId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    const includeParentChain = normalizeIncludeParentChain(body?.includeParentChain);
    const includeContextExpansion = normalizeIncludeContextExpansion(body?.includeContextExpansion);
    const limit = normalizeLimit(body?.limit);
    const retrieverMode = getSchemaRetrieverMode();
    let shadowTopkJaccardAt10: number | undefined;
    let shadowNdcgDeltaAt10: number | undefined;
    let shadowTimingDeltaMs: number | undefined;
    let shadowSecondaryFailed: boolean | undefined;
    let shadowSecondaryError: string | undefined;
    let shadowSampled: boolean | undefined;

    const results = await getSchemaRetriever().searchSchemaNodes({
      schemaId,
      query: queryValue,
      requestId,
      correlationId,
      filters: typeof body?.filters === 'object' && body.filters !== null ? body.filters as {
        readonly type?: readonly string[];
        readonly isArray?: boolean;
        readonly depth?: number;
      } : undefined,
      limit,
      includeContextExpansion,
      onShadowTelemetry: (payload) => {
        shadowSampled = payload.sampled;
        shadowTopkJaccardAt10 = payload.jaccardAt10;
        shadowNdcgDeltaAt10 = payload.ndcgDeltaAt10;
        shadowTimingDeltaMs = payload.timingDeltaMs;
        shadowSecondaryFailed = payload.secondaryFailed;
        shadowSecondaryError = payload.secondaryError;
      },
    });

    console.info('[schema-query] retrieval completed', {
      schemaId,
      retrieverMode,
      queryLength: queryValue.length,
      includeParentChain,
      includeContextExpansion,
      requestedLimit: limit,
      resultCount: results.length,
      durationMs: Date.now() - startedAt,
    });

    emitRetrievalTelemetry('retrieval.completed', {
      handler: 'schema.query-schema-nodes',
      request_id: requestId,
      correlation_id: correlationId,
      schema_id: schemaId,
      retriever_mode: retrieverMode,
      schema_field_count: typeof schema.fieldCount === 'number' ? Math.floor(schema.fieldCount) : undefined,
      schema_size_segment: classifySchemaSizeSegment(schema.fieldCount),
      query_length: queryValue.length,
      requested_limit: limit,
      candidate_count: results.length,
      result_count: results.length,
      retrieval_ms: Date.now() - startedAt,
      include_parent_chain: includeParentChain,
      include_context_expansion: includeContextExpansion,
      sampled: shadowSampled,
      shadow_topk_jaccard_at_10: shadowTopkJaccardAt10,
      shadow_ndcg_delta_at_10: shadowNdcgDeltaAt10,
      shadow_timing_delta_ms: shadowTimingDeltaMs,
      secondary_failed: shadowSecondaryFailed,
      secondary_error: shadowSecondaryError,
    });

    if (!includeParentChain) {
      return jsonResponse(200, results.slice(0, limit) as SchemaSearchResult[]);
    }

    const enriched = await Promise.all(
      results.slice(0, limit).map(async (result) => {
        const parentChain = await getParentChain(schemaId, result.path);
        return {
          ...result,
          parentChain,
        };
      }),
    );

    return jsonResponse(200, enriched as SchemaSearchResult[]);
  } catch {
    const err = internalError('Schema query failed while retrieving schema nodes');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }
}
