import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  getItem: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  notFound: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/mapping/get-version.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('get-version handler', () => {
  beforeEach(() => {
    vi.resetModules();
    getEnvStore().MAPPING_VERSIONS_TABLE = 'MappingVersions';

    sharedMocks.parsePathParam.mockReset().mockImplementation((event, name: string) => event.pathParameters?.[name] ?? null);
    sharedMocks.getItem.mockReset().mockResolvedValue({
      mappingId: 'map-1',
      version: 2,
      revisionNumber: 5,
      createdAt: '2026-05-15T00:00:00.000Z',
      createdBy: 'user',
    });
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Mapping version with id 'map-1:2' not found", statusCode: 404, retryable: false });
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('returns specific version entry', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1', version: '2' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { version: number; revisionNumber: number };
    expect(parsed.version).toBe(2);
    expect(parsed.revisionNumber).toBe(5);
  });

  it('not found returns 404 standard envelope', async () => {
    sharedMocks.getItem.mockResolvedValueOnce(null);

    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1', version: '2' } });

    expect(result.statusCode).toBe(404);
  });
});
