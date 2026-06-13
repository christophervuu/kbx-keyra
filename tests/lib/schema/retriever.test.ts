import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryContainsMock = vi.hoisted(() => vi.fn());
const listBySchemaMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/persistence/schema-nodes.js', () => ({
  schemaNodes: {
    queryContains: queryContainsMock,
    listBySchema: listBySchemaMock,
  },
}));

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('schema retriever runtime routing', () => {
  beforeEach(() => {
    vi.resetModules();
    queryContainsMock.mockReset();
    listBySchemaMock.mockReset();
    delete getEnvStore().RAG_RETRIEVER;
    delete getEnvStore().STAGE;
    delete getEnvStore().RAG_LEXICAL_CAP;
    delete getEnvStore().RAG_RERANK_CAP;
    delete getEnvStore().RAG_TOPK;
    delete getEnvStore().RAG_CONTEXT_EXPANSION_CAP;
    delete getEnvStore().RAG_ENABLE_EMBEDDING_RERANK;
    delete getEnvStore().RAG_RERANK_LEXICAL_WEIGHT;
    delete getEnvStore().RAG_RERANK_VECTOR_WEIGHT;
    delete getEnvStore().RAG_RERANK_BOOST_WEIGHT;
  });

  it('defaults to dynamodb mode when env is unset', async () => {
    const mod = await import('../../../src/lib/schema/retriever.js');
    expect(mod.getSchemaRetrieverMode()).toBe('dynamodb');
  });

  it('fails closed for invalid retriever mode', async () => {
    const mod = await import('../../../src/lib/schema/retriever.js');
    expect(() => mod.parseSchemaRetrieverMode('invalid')).toThrow(/Invalid RAG_RETRIEVER value/);
  });

  it('fails closed for removed opensearch and shadow modes', async () => {
    const mod = await import('../../../src/lib/schema/retriever.js');
    expect(() => mod.parseSchemaRetrieverMode('opensearch')).toThrow(/Expected one of: dynamodb/);
    expect(() => mod.parseSchemaRetrieverMode('shadow')).toThrow(/Expected one of: dynamodb/);
  });

  it('routes to dynamodb retriever in dynamodb mode', async () => {
    getEnvStore().RAG_RETRIEVER = 'dynamodb';
    queryContainsMock.mockResolvedValueOnce([
      {
        schemaId: 'schema-1',
        path: 'Order.Address.Street',
        fieldName: 'Street',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'Order.Address.Street | Street (string)',
      },
    ]);

    const mod = await import('../../../src/lib/schema/retriever.js');
    const results = await mod.getSchemaRetriever().searchSchemaNodes({
      schemaId: 'schema-1',
      query: 'street',
      limit: 10,
    });

    expect(queryContainsMock).toHaveBeenCalledWith('schema-1', 'street', 360);
    expect(results[0]).toMatchObject({
      path: 'Order.Address.Street',
      score: expect.any(Number),
    });
  });

  it('applies deterministic lexical ranking and lexicalCap enforcement', async () => {
    getEnvStore().RAG_RETRIEVER = 'dynamodb';
    getEnvStore().STAGE = 'DEV';
    getEnvStore().RAG_LEXICAL_CAP = '2';

    queryContainsMock.mockResolvedValueOnce([
      {
        schemaId: 'schema-1',
        path: 'Order.Address.PostalCode',
        fieldName: 'PostalCode',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'Postal code field',
      },
      {
        schemaId: 'schema-1',
        path: 'Order.Address.ZipCode',
        fieldName: 'ZipCode',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'zip code field',
      },
      {
        schemaId: 'schema-1',
        path: 'Order.Memo',
        fieldName: 'Memo',
        type: 'string',
        depth: 1,
        isArray: false,
        isRequired: false,
        parentPath: 'Order',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'memo',
      },
    ]);

    const mod = await import('../../../src/lib/schema/retriever.js');
    const results = await mod.getSchemaRetriever().searchSchemaNodes({
      schemaId: 'schema-1',
      query: 'code',
      limit: 10,
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.path).toBe('Order.Address.PostalCode');
    expect(results[1]?.path).toBe('Order.Address.ZipCode');
  });

  it('honors type/isArray/depth filters in dynamodb lexical retrieval', async () => {
    getEnvStore().RAG_RETRIEVER = 'dynamodb';

    queryContainsMock.mockResolvedValueOnce([
      {
        schemaId: 'schema-1',
        path: 'Order.LineItems',
        fieldName: 'LineItems',
        type: 'array',
        depth: 1,
        isArray: true,
        isRequired: false,
        parentPath: 'Order',
        childCount: 1,
        subtreeFieldCount: 3,
        embeddingText: 'line items',
      },
      {
        schemaId: 'schema-1',
        path: 'Order.LineItems.Description',
        fieldName: 'Description',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.LineItems',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'line item description',
      },
    ]);

    const mod = await import('../../../src/lib/schema/retriever.js');
    const results = await mod.getSchemaRetriever().searchSchemaNodes({
      schemaId: 'schema-1',
      query: 'line',
      filters: {
        type: ['array'],
        isArray: true,
        depth: 1,
      },
      limit: 10,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe('Order.LineItems');
  });

  it('applies deterministic rerank ordering with stable tie-breaks', async () => {
    getEnvStore().RAG_RETRIEVER = 'dynamodb';
    getEnvStore().STAGE = 'DEV';
    getEnvStore().RAG_LEXICAL_CAP = '5';
    getEnvStore().RAG_RERANK_CAP = '5';
    getEnvStore().RAG_TOPK = '5';
    getEnvStore().RAG_ENABLE_EMBEDDING_RERANK = 'true';
    getEnvStore().RAG_RERANK_LEXICAL_WEIGHT = '0';
    getEnvStore().RAG_RERANK_VECTOR_WEIGHT = '1';
    getEnvStore().RAG_RERANK_BOOST_WEIGHT = '0';

    queryContainsMock.mockResolvedValue([
      {
        schemaId: 'schema-1',
        path: 'Order.Address.City',
        fieldName: 'City',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'city',
        embedding: [1, 0, 0],
      },
      {
        schemaId: 'schema-1',
        path: 'Order.Address.PostalCode',
        fieldName: 'PostalCode',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'postal',
        embedding: [0.9, 0.1, 0],
      },
      {
        schemaId: 'schema-1',
        path: 'Order.Address.State',
        fieldName: 'State',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'state',
        embedding: [0.5, 0.5, 0],
      },
      {
        schemaId: 'schema-1',
        path: 'Order.Address.ZipCode',
        fieldName: 'ZipCode',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'zip',
        embedding: [0.9, 0.1, 0],
      },
    ]);

    const mod = await import('../../../src/lib/schema/retriever.js');
    const first = await mod.getSchemaRetriever().searchSchemaNodes({
      schemaId: 'schema-1',
      query: 'postal code',
      limit: 5,
      enableRerank: true,
    });
    const second = await mod.getSchemaRetriever().searchSchemaNodes({
      schemaId: 'schema-1',
      query: 'postal code',
      limit: 5,
      enableRerank: true,
    });

    expect(first.map((item) => item.path)).toEqual(second.map((item) => item.path));
    // Tie-break between similarly embedded candidates is path asc.
    const tiePair = first.filter((item) => item.path.includes('Code')).map((item) => item.path);
    expect(tiePair).toEqual(['Order.Address.PostalCode', 'Order.Address.ZipCode']);
  });

  it('falls back to lexical ranking when embeddings are missing', async () => {
    getEnvStore().RAG_RETRIEVER = 'dynamodb';
    getEnvStore().STAGE = 'DEV';
    getEnvStore().RAG_ENABLE_EMBEDDING_RERANK = 'true';

    queryContainsMock.mockResolvedValueOnce([
      {
        schemaId: 'schema-1',
        path: 'Order.Address.PostalCode',
        fieldName: 'PostalCode',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'postal code field',
      },
      {
        schemaId: 'schema-1',
        path: 'Order.Address.ZipCode',
        fieldName: 'ZipCode',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'zip code field',
      },
    ]);

    const mod = await import('../../../src/lib/schema/retriever.js');
    const results = await mod.getSchemaRetriever().searchSchemaNodes({
      schemaId: 'schema-1',
      query: 'code',
      limit: 5,
      enableRerank: true,
    });

    expect(results.map((item) => item.path)).toEqual([
      'Order.Address.PostalCode',
      'Order.Address.ZipCode',
    ]);
  });

  it('enforces context expansion cap when includeContextExpansion is enabled', async () => {
    getEnvStore().RAG_RETRIEVER = 'dynamodb';
    getEnvStore().STAGE = 'DEV';
    getEnvStore().RAG_LEXICAL_CAP = '20';
    getEnvStore().RAG_RERANK_CAP = '10';
    getEnvStore().RAG_TOPK = '2';
    getEnvStore().RAG_CONTEXT_EXPANSION_CAP = '3';

    queryContainsMock.mockResolvedValueOnce([
      {
        schemaId: 'schema-1',
        path: 'Order.Address.City',
        fieldName: 'City',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'city',
      },
      {
        schemaId: 'schema-1',
        path: 'Order.Address.PostalCode',
        fieldName: 'PostalCode',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'postal code',
      },
    ]);

    listBySchemaMock.mockResolvedValueOnce([
      {
        schemaId: 'schema-1',
        path: 'Order',
        fieldName: 'Order',
        type: 'object',
        depth: 0,
        isArray: false,
        isRequired: true,
        childCount: 1,
        subtreeFieldCount: 6,
        embeddingText: 'order root',
      },
      {
        schemaId: 'schema-1',
        path: 'Order.Address',
        fieldName: 'Address',
        type: 'object',
        depth: 1,
        isArray: false,
        isRequired: false,
        parentPath: 'Order',
        childCount: 4,
        subtreeFieldCount: 4,
        embeddingText: 'address object',
      },
      {
        schemaId: 'schema-1',
        path: 'Order.Address.City',
        fieldName: 'City',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'city',
      },
      {
        schemaId: 'schema-1',
        path: 'Order.Address.PostalCode',
        fieldName: 'PostalCode',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'postal code',
      },
      {
        schemaId: 'schema-1',
        path: 'Order.Address.State',
        fieldName: 'State',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'state',
      },
      {
        schemaId: 'schema-1',
        path: 'Order.Address.Country',
        fieldName: 'Country',
        type: 'string',
        depth: 2,
        isArray: false,
        isRequired: false,
        parentPath: 'Order.Address',
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: 'country',
      },
    ]);

    const mod = await import('../../../src/lib/schema/retriever.js');
    const results = await mod.getSchemaRetriever().searchSchemaNodes({
      schemaId: 'schema-1',
      query: 'address',
      limit: 10,
      includeContextExpansion: true,
    });

    // topK (2) + contextExpansionCap (3) max
    expect(results.length).toBeLessThanOrEqual(5);
    expect(listBySchemaMock).toHaveBeenCalledWith('schema-1');
  });

  it('keeps rerank stage latency bounded for capped candidate sets', async () => {
    getEnvStore().RAG_RETRIEVER = 'dynamodb';
    getEnvStore().STAGE = 'DEV';
    getEnvStore().RAG_LEXICAL_CAP = '120';
    getEnvStore().RAG_RERANK_CAP = '80';
    getEnvStore().RAG_TOPK = '12';
    getEnvStore().RAG_ENABLE_EMBEDDING_RERANK = 'true';

    const candidates = Array.from({ length: 120 }, (_, index) => ({
      schemaId: 'schema-1',
      path: `Order.LineItems.Field${index + 1}`,
      fieldName: `Field${index + 1}`,
      type: 'string',
      depth: 2,
      isArray: false,
      isRequired: false,
      parentPath: 'Order.LineItems',
      childCount: 0,
      subtreeFieldCount: 1,
      embeddingText: `line items field ${index + 1}`,
      embedding: [1, index % 3, (index % 5) / 2],
    }));

    queryContainsMock.mockResolvedValueOnce(candidates);

    const mod = await import('../../../src/lib/schema/retriever.js');
    const start = Date.now();
    const results = await mod.getSchemaRetriever().searchSchemaNodes({
      schemaId: 'schema-1',
      query: 'line items field',
      limit: 20,
      enableRerank: true,
    });
    const elapsedMs = Date.now() - start;

    expect(results.length).toBeGreaterThan(0);
    // In-memory rerank over capped candidates should stay well-bounded.
    expect(elapsedMs).toBeLessThan(150);
  });

});
