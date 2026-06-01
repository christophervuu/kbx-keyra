import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  query: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/mapping/list-revisions.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('list-revisions handler', () => {
  beforeEach(() => {
    vi.resetModules();
    getEnvStore().MAPPING_REVISIONS_TABLE = 'MappingRevisions';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('map-1');
    sharedMocks.query.mockReset().mockResolvedValue([
      { mappingId: 'map-1', revision: 5 },
      { mappingId: 'map-1', revision: 3 },
    ]);
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('returns revisions sorted descending by revision', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as Array<{ revision: number }>;
    expect(parsed.map((entry) => entry.revision)).toEqual([5, 3]);
  });
});
