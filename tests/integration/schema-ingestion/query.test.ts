import { beforeEach, describe, expect, it, vi } from 'vitest';

const schemaLibMocks = vi.hoisted(() => ({
  getSchemaMetadata: vi.fn(),
  getSchemaRetrieverMode: vi.fn(),
  getSchemaRetriever: vi.fn(),
  searchSchemaNodes: vi.fn(),
  getParentChain: vi.fn(),
}));

vi.mock('../../../src/lib/schema/index.js', () => schemaLibMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/query-schema-nodes.js');
}

function createEvent(body: unknown, schemaId = 'schema-1') {
  return {
    body: JSON.stringify(body),
    httpMethod: 'POST',
    headers: {},
    pathParameters: {
      id: schemaId,
    },
  };
}

describe('schema ingestion integration - query endpoint', () => {
  beforeEach(() => {
    vi.resetModules();
    schemaLibMocks.getSchemaMetadata.mockReset().mockResolvedValue({ schemaId: 'schema-1' });
    schemaLibMocks.getSchemaRetrieverMode.mockReset().mockReturnValue('dynamodb');
    schemaLibMocks.searchSchemaNodes.mockReset().mockResolvedValue([
      {
        path: 'Order.Billing.Address.PostalCode',
        fieldName: 'PostalCode',
        type: 'string',
        depth: 3,
        isArray: false,
        embeddingText: 'Order.Billing.Address.PostalCode | PostalCode (string)',
        score: 12.5,
      },
      {
        path: 'Order.ZipCode',
        fieldName: 'ZipCode',
        type: 'string',
        depth: 1,
        isArray: false,
        embeddingText: 'Order.ZipCode | ZipCode (string)',
        score: 9.5,
      },
    ]);
    schemaLibMocks.getSchemaRetriever.mockReset().mockReturnValue({
      searchSchemaNodes: schemaLibMocks.searchSchemaNodes,
    });
    schemaLibMocks.getParentChain.mockReset().mockResolvedValue(['Order', 'Order.Billing', 'Order.Billing.Address']);
  });

  it('keyword match returns relevant result structure and scores (AE-06)', async () => {
    const { handler } = await importHandler();
    const response = await handler(createEvent({ query: 'postal code' }));

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body) as Array<{ fieldName: string; score: number; parentChain?: string[] }>;
    expect(parsed).toHaveLength(2);
    expect(parsed.some((item) => item.fieldName === 'PostalCode')).toBe(true);
    expect(parsed.every((item) => typeof item.score === 'number')).toBe(true);
    expect(parsed.every((item) => item.parentChain === undefined)).toBe(true);
  });

  it('type filter narrows query arguments passed to search', async () => {
    const { handler } = await importHandler();
    await handler(createEvent({ query: 'amount', filters: { type: ['number'] } }));

    expect(schemaLibMocks.searchSchemaNodes).toHaveBeenCalledWith(
      {
        schemaId: 'schema-1',
        query: 'amount',
        filters: { type: ['number'] },
        limit: 50,
        includeContextExpansion: false,
      },
    );
  });

  it('forwards limit to retriever request', async () => {
    const { handler } = await importHandler();
    await handler(createEvent({ query: 'amount', limit: 17 }));

    expect(schemaLibMocks.searchSchemaNodes).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaId: 'schema-1',
        query: 'amount',
        limit: 17,
        includeContextExpansion: false,
      }),
    );
  });

  it('forwards includeContextExpansion to retriever request when enabled', async () => {
    const { handler } = await importHandler();
    await handler(createEvent({ query: 'postal code', includeContextExpansion: true }));

    expect(schemaLibMocks.searchSchemaNodes).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaId: 'schema-1',
        query: 'postal code',
        includeContextExpansion: true,
      }),
    );
  });

  it('includeParentChain enriches query results with parent chain (AE-07)', async () => {
    const { handler } = await importHandler();
    const response = await handler(createEvent({ query: 'PostalCode', includeParentChain: true }));

    expect(response.statusCode).toBe(200);
    expect(schemaLibMocks.getParentChain).toHaveBeenCalled();

    const parsed = JSON.parse(response.body) as Array<{ parentChain?: string[] }>;
    expect(parsed[0]?.parentChain).toEqual(['Order', 'Order.Billing', 'Order.Billing.Address']);
  });
});
