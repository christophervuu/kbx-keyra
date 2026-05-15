import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  requireFields: vi.fn(),
  putItem: vi.fn(),
  query: vi.fn(),
  deleteItem: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/mapping/save-version.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('save-version handler', () => {
  beforeEach(() => {
    vi.resetModules();
    getEnvStore().MAPPING_VERSIONS_TABLE = 'MappingVersions';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('map-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({
      version: 2,
      savedAt: '2026-05-15T00:00:00.000Z',
      savedBy: 'user',
      ruleCount: 3,
      config: { name: 'Invoice Map', version: 2, engineVersion: '1.0.0', config: {}, rules: [] },
    });
    sharedMocks.requireFields.mockReset().mockReturnValue({ ok: true });
    sharedMocks.putItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.query.mockReset().mockResolvedValue([]);
    sharedMocks.deleteItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('valid entry returns 204', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(204);
    expect(sharedMocks.putItem).toHaveBeenCalledTimes(1);
  });

  it('missing required fields returns 400 validation error', async () => {
    sharedMocks.requireFields.mockReturnValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Missing required field: config', statusCode: 400, retryable: false },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(400);
  });

  it('prunes oldest entries when count exceeds 50', async () => {
    sharedMocks.query.mockResolvedValueOnce(
      Array.from({ length: 51 }, (_, index) => ({
        mappingId: 'map-1',
        version: index + 1,
        savedAt: '2026-05-15T00:00:00.000Z',
        savedBy: 'user',
        ruleCount: 1,
        config: {},
      })),
    );

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(204);
    expect(sharedMocks.deleteItem).toHaveBeenCalledTimes(1);
    expect(sharedMocks.deleteItem).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { mappingId: 'map-1', version: 1 },
      }),
    );
  });
});
