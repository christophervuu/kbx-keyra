import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent } from '../../../src/lambda/schema/query-schema-nodes.js';

const schemaLibMocks = vi.hoisted(() => ({
  getSchemaMetadata: vi.fn(),
  searchSchemaNodes: vi.fn(),
  getParentChain: vi.fn(),
}));

vi.mock('../../../src/lib/schema/index.js', () => schemaLibMocks);

function createEvent(body: unknown, schemaId = 'schema-1'): APIGatewayProxyEvent {
  return {
    body: body === null ? null : JSON.stringify(body),
    httpMethod: 'POST',
    headers: {},
    pathParameters: {
      id: schemaId,
    },
  };
}

async function importHandler() {
  return import('../../../src/lambda/schema/query-schema-nodes.js');
}

describe('query-schema-nodes handler', () => {
  beforeEach(() => {
    vi.resetModules();

    schemaLibMocks.getSchemaMetadata.mockReset().mockResolvedValue({
      schemaId: 'schema-1',
      name: 'Order Schema',
      format: 'json-schema',
      fieldCount: 500,
      origin: 'local',
      status: 'ready',
      source: { type: 'upload' },
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });

    schemaLibMocks.searchSchemaNodes.mockReset().mockResolvedValue([
      {
        path: 'Order.Address.PostalCode',
        fieldName: 'PostalCode',
        type: 'string',
        depth: 2,
        isArray: false,
        parentPath: 'Order.Address',
        embeddingText: 'Order.Address.PostalCode | PostalCode (string)',
        score: 4.2,
      },
    ]);

    schemaLibMocks.getParentChain.mockReset().mockResolvedValue(['Order', 'Order.Address']);
  });

  it('valid query returns 200 with results (AE-06)', async () => {
    const { handler } = await importHandler();
    const response = await handler(createEvent({ query: 'postal code' }));

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body) as Array<{ path: string; score: number; parentChain?: string[] }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.path).toBe('Order.Address.PostalCode');
    expect(parsed[0]?.score).toBe(4.2);
    expect(parsed[0]?.parentChain).toBeUndefined();
  });

  it('query with type filter returns filtered results (AE-08)', async () => {
    const { handler } = await importHandler();
    await handler(createEvent({ query: 'amount', filters: { type: ['number'] } }));

    expect(schemaLibMocks.searchSchemaNodes).toHaveBeenCalledWith(
      'schema-1',
      'amount',
      { type: ['number'] },
      20,
    );
  });

  it('returns 400 when query field is missing', async () => {
    const { handler } = await importHandler();
    const response = await handler(createEvent({ filters: { type: ['string'] } }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: 'Missing required field: query' });
  });

  it('returns 404 when schema does not exist', async () => {
    schemaLibMocks.getSchemaMetadata.mockResolvedValueOnce(null);

    const { handler } = await importHandler();
    const response = await handler(createEvent({ query: 'postal code' }, 'missing-schema'));

    expect(response.statusCode).toBe(404);
  });

  it('includeParentChain true enriches results with parent chain (AE-07)', async () => {
    const { handler } = await importHandler();
    const response = await handler(createEvent({ query: 'PostalCode', includeParentChain: true }));

    expect(response.statusCode).toBe(200);
    expect(schemaLibMocks.getParentChain).toHaveBeenCalledTimes(1);

    const parsed = JSON.parse(response.body) as Array<{ parentChain?: string[] }>;
    expect(parsed[0]?.parentChain).toEqual(['Order', 'Order.Address']);
  });

  it('includeParentChain absent skips enrichment field (AE-06)', async () => {
    const { handler } = await importHandler();
    const response = await handler(createEvent({ query: 'PostalCode' }));

    expect(response.statusCode).toBe(200);
    expect(schemaLibMocks.getParentChain).not.toHaveBeenCalled();

    const parsed = JSON.parse(response.body) as Array<{ parentChain?: string[] }>;
    expect(parsed[0]?.parentChain).toBeUndefined();
  });
});
