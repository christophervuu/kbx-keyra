import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  scan: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/list-schemas.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('list-schemas handler', () => {
  beforeEach(() => {
    vi.resetModules();
    getEnvStore().SCHEMAS_TABLE = 'Schemas';

    sharedMocks.scan.mockReset().mockResolvedValue([
      { schemaId: 's1', name: 'Schema 1' },
      { schemaId: 's2', name: 'Schema 2' },
    ]);
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('returns array for multiple schemas', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: null });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as Array<{ schemaId: string }>;
    expect(parsed).toHaveLength(2);
  });

  it('returns empty array when no schemas', async () => {
    sharedMocks.scan.mockResolvedValueOnce([]);

    const { handler } = await importHandler();
    const result = await handler({ body: null });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });
});
