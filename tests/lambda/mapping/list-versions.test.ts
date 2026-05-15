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
  return import('../../../src/lambda/mapping/list-versions.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('list-versions handler', () => {
  beforeEach(() => {
    vi.resetModules();
    getEnvStore().MAPPING_VERSIONS_TABLE = 'MappingVersions';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('map-1');
    sharedMocks.query.mockReset().mockResolvedValue([
      { mappingId: 'map-1', version: 5, savedAt: '2026-05-15T00:00:00.000Z', savedBy: 'user', ruleCount: 5, config: {} },
      { mappingId: 'map-1', version: 3, savedAt: '2026-05-14T00:00:00.000Z', savedBy: 'user', ruleCount: 3, config: {} },
    ]);
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('returns versions sorted descending by version', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as Array<{ version: number }>;
    expect(parsed.map((entry) => entry.version)).toEqual([5, 3]);
    expect(sharedMocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        ScanIndexForward: false,
      }),
    );
  });

  it('empty mapping returns empty array', async () => {
    sharedMocks.query.mockResolvedValueOnce([]);
    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });
});
