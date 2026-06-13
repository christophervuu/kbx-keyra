import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  query: vi.fn(),
  generateRequestId: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  notFound: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

const schemaLibMocks = vi.hoisted(() => ({
  getSchemaMetadata: vi.fn(),
  getParentChain: vi.fn(),
  getSchemaRetrieverMode: vi.fn(),
  getSchemaRetriever: vi.fn(),
  searchSchemaNodes: vi.fn(),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);
vi.mock('../../../src/lib/schema/index.js', () => schemaLibMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/query-schema-nodes.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('query-schema-nodes handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    const env = getEnvStore();
    env.SCHEMAS_TABLE = 'Schemas';
    env.SCHEMA_NODES_TABLE = 'SchemaNodes';
    delete env.SCHEMA_QUERY_DEGRADED_FALLBACK;

    sharedMocks.parsePathParam.mockReset().mockReturnValue('schema-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({ query: 'address' });
    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-query-1');
    schemaLibMocks.getSchemaMetadata.mockReset().mockResolvedValue({ schemaId: 'schema-1' });
    schemaLibMocks.getParentChain.mockReset().mockResolvedValue(['Order', 'Order.Address']);
    schemaLibMocks.getSchemaRetrieverMode.mockReset().mockReturnValue('dynamodb');
    sharedMocks.query.mockReset().mockResolvedValue([
      { schemaId: 'schema-1', path: 'Order.Address.Street', fieldName: 'Street', type: 'string', description: 'Street line 1' },
      { schemaId: 'schema-1', path: 'Order.Amount', fieldName: 'Amount', type: 'number' },
      { schemaId: 'schema-1', path: 'Order.BillingAddress.PostalCode', fieldName: 'PostalCode', type: 'string' },
    ]);
    schemaLibMocks.searchSchemaNodes.mockReset().mockResolvedValue([
      {
        path: 'Order.Address.Street',
        fieldName: 'Street',
        type: 'string',
        depth: 2,
        isArray: false,
        embeddingText: 'Order.Address.Street | Street (string)',
        score: 11,
      },
      {
        path: 'Order.BillingAddress.PostalCode',
        fieldName: 'PostalCode',
        type: 'string',
        depth: 2,
        isArray: false,
        embeddingText: 'Order.BillingAddress.PostalCode | PostalCode (string)',
        score: 9,
      },
    ]);
    schemaLibMocks.getSchemaRetriever.mockReset().mockReturnValue({
      searchSchemaNodes: schemaLibMocks.searchSchemaNodes,
    });
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Schema with id 'schema-1' not found", statusCode: 404, retryable: false });
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
    vi.spyOn(console, 'info').mockImplementation(() => {
      // noop
    });
  });

  it('valid query with matches returns 200 and SchemaSearchResult array (AE-08)', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as Array<{ path: string; fieldName: string; type: string; description?: string; score: number }>;
    expect(parsed).toHaveLength(2);
    expect(schemaLibMocks.searchSchemaNodes).toHaveBeenCalledWith({
      schemaId: 'schema-1',
      query: 'address',
      requestId: 'req-query-1',
      correlationId: undefined,
      filters: undefined,
      limit: 50,
      includeContextExpansion: false,
      onShadowTelemetry: expect.any(Function),
    });
    expect(parsed[0]).toEqual({
      path: 'Order.Address.Street',
      fieldName: 'Street',
      type: 'string',
      depth: 2,
      isArray: false,
      embeddingText: 'Order.Address.Street | Street (string)',
      score: 11,
    });
    expect(parsed[1]).toEqual({
      path: 'Order.BillingAddress.PostalCode',
      fieldName: 'PostalCode',
      type: 'string',
      depth: 2,
      isArray: false,
      embeddingText: 'Order.BillingAddress.PostalCode | PostalCode (string)',
      score: 9,
    });
  });

  it('valid query with no matches returns 200 and empty array', async () => {
    sharedMocks.parseBody.mockReturnValue({ query: 'does-not-exist' });
    schemaLibMocks.searchSchemaNodes.mockResolvedValueOnce([]);

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('schema not found returns 404', async () => {
    schemaLibMocks.getSchemaMetadata.mockResolvedValueOnce(null);

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'missing-schema' } });

    expect(result.statusCode).toBe(404);
  });

  it('missing query field returns 400', async () => {
    sharedMocks.parseBody.mockReturnValue({});

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(400);
  });

  it('empty query string returns 400', async () => {
    sharedMocks.parseBody.mockReturnValue({ query: '   ' });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(400);
  });

  it('results are capped at 50', async () => {
    const manyNodes = Array.from({ length: 60 }, (_, idx) => ({
      path: `Order.Address.Line${idx + 1}`,
      fieldName: `Line${idx + 1}`,
      type: 'string',
      depth: 2,
      isArray: false,
      embeddingText: `Order.Address.Line${idx + 1} | Line${idx + 1} (string)`,
      score: 100 - idx,
    }));
    schemaLibMocks.searchSchemaNodes.mockResolvedValueOnce(manyNodes);

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as Array<{ path: string }>;
    expect(parsed).toHaveLength(50);
    expect(parsed[0]?.path).toBe('Order.Address.Line1');
    expect(parsed[49]?.path).toBe('Order.Address.Line50');
  });

  it('forwards a valid request limit to retriever', async () => {
    sharedMocks.parseBody.mockReturnValue({ query: 'address', limit: 17 });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(200);
    expect(schemaLibMocks.searchSchemaNodes).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaId: 'schema-1',
        query: 'address',
        requestId: 'req-query-1',
        limit: 17,
        includeContextExpansion: false,
      }),
    );
  });

  it('returns 500 when retriever fails', async () => {
    schemaLibMocks.searchSchemaNodes.mockRejectedValueOnce(new Error('retriever down'));

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(500);
    expect(sharedMocks.query).not.toHaveBeenCalled();
  });

  it('includeParentChain enriches results via getParentChain', async () => {
    sharedMocks.parseBody.mockReturnValue({ query: 'address', includeParentChain: true });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(200);
    expect(schemaLibMocks.getParentChain).toHaveBeenCalledWith('schema-1', 'Order.Address.Street');

    const parsed = JSON.parse(result.body) as Array<{ parentChain?: string[] }>;
    expect(parsed[0]?.parentChain).toEqual(['Order', 'Order.Address']);
  });

  it('forwards context expansion flag when includeContextExpansion is requested', async () => {
    sharedMocks.parseBody.mockReturnValue({ query: 'address', includeContextExpansion: true });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(200);
    expect(schemaLibMocks.searchSchemaNodes).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaId: 'schema-1',
        query: 'address',
        includeContextExpansion: true,
      }),
    );
  });

  it('emits retrieval-stage telemetry fields for dynamodb path', async () => {
    const infoSpy = vi.spyOn(console, 'info');

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(200);
    expect(infoSpy).toHaveBeenCalledWith(
      '[schema-query] retrieval completed',
      expect.objectContaining({
        schemaId: 'schema-1',
        retrieverMode: 'dynamodb',
        queryLength: 'address'.length,
        includeParentChain: false,
        includeContextExpansion: false,
        requestedLimit: 50,
        resultCount: 2,
        durationMs: expect.any(Number),
      }),
    );
  });
});
