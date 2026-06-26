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
  return import('../../../src/lambda/mapping/get-revision.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('get-revision handler', () => {
  beforeEach(() => {
    vi.resetModules();
    getEnvStore().MAPPING_REVISIONS_TABLE = 'MappingRevisions';
    getEnvStore().CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockImplementation((event, name: string) => event.pathParameters?.[name] ?? null);
    sharedMocks.getItem.mockReset().mockResolvedValue({
      mappingId: 'map-1',
      revision: 2,
      savedAt: '2026-05-15T00:00:00.000Z',
      savedBy: 'user',
      ruleCount: 2,
      configS3Key: 'mappings/map-1/revisions/r2.json',
      configHash: 'x',
    });
    sharedMocks.getObject.mockReset().mockResolvedValue('{"name":"v2"}');
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Mapping revision with id 'map-1:2' not found", statusCode: 404, retryable: false });
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('returns specific revision entry with config', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1', revision: '2' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { revision: number; config: { name: string } };
    expect(parsed.revision).toBe(2);
    expect(parsed.config.name).toBe('v2');
  });

  it('returns validation error when revision path param is missing', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
  });
});
