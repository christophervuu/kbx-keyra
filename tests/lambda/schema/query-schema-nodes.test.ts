import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  getItem: vi.fn(),
  query: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  notFound: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

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
    vi.resetModules();
    const env = getEnvStore();
    env.SCHEMAS_TABLE = 'Schemas';
    env.SCHEMA_NODES_TABLE = 'SchemaNodes';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('schema-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({ query: 'address' });
    sharedMocks.getItem.mockReset().mockResolvedValue({ schemaId: 'schema-1' });
    sharedMocks.query.mockReset().mockResolvedValue([
      { schemaId: 'schema-1', path: 'Order.Address.Street', fieldName: 'Street', type: 'string', description: 'Street line 1' },
      { schemaId: 'schema-1', path: 'Order.Amount', fieldName: 'Amount', type: 'number' },
      { schemaId: 'schema-1', path: 'Order.BillingAddress.PostalCode', fieldName: 'PostalCode', type: 'string' },
    ]);
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Schema with id 'schema-1' not found", statusCode: 404, retryable: false });
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('valid query with matches returns 200 and SchemaSearchResult array (AE-08)', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as Array<{ path: string; fieldName: string; type: string; description?: string }>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      path: 'Order.Address.Street',
      fieldName: 'Street',
      type: 'string',
      description: 'Street line 1',
    });
    expect(parsed[1]).toEqual({
      path: 'Order.BillingAddress.PostalCode',
      fieldName: 'PostalCode',
      type: 'string',
    });
  });

  it('valid query with no matches returns 200 and empty array', async () => {
    sharedMocks.parseBody.mockReturnValue({ query: 'does-not-exist' });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('schema not found returns 404', async () => {
    sharedMocks.getItem.mockResolvedValueOnce(null);

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
      schemaId: 'schema-1',
      path: `Order.Address.Line${idx + 1}`,
      fieldName: `Line${idx + 1}`,
      type: 'string',
    }));
    sharedMocks.query.mockResolvedValueOnce(manyNodes);

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as Array<{ path: string }>;
    expect(parsed).toHaveLength(50);
    expect(parsed[0]?.path).toBe('Order.Address.Line1');
    expect(parsed[49]?.path).toBe('Order.Address.Line50');
  });
});
