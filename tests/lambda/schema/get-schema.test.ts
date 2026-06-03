import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  getItem: vi.fn(),
  getObject: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  notFound: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/get-schema.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('get-schema handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.SCHEMAS_TABLE = 'Schemas';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('schema-1');
    sharedMocks.getItem.mockReset().mockResolvedValue({ schemaId: 'schema-1', format: 'json-schema', syncStatus: 'local-changes' });
    sharedMocks.getObject.mockReset().mockResolvedValue(JSON.stringify({ type: 'object', properties: {} }));
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Schema with id 'schema-1' not found", statusCode: 404, retryable: false });
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('found schema returns 200 with metadata and content', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { metadata: { schemaId: string }; content: Record<string, unknown> };
    expect(parsed.metadata.schemaId).toBe('schema-1');
    expect((parsed.metadata as { syncStatus?: string }).syncStatus).toBe('sync-failed');
    expect(typeof parsed.content).toBe('object');
  });

  it('not found returns 404', async () => {
    sharedMocks.getItem.mockResolvedValueOnce(null);

    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'missing' } });

    expect(result.statusCode).toBe(404);
  });
});
