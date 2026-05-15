import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  getItem: vi.fn(),
  deleteItem: vi.fn(),
  deleteObject: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  notFound: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/mapping/delete-mapping.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('delete-mapping handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.MAPPINGS_TABLE = 'Mappings';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('map-1');
    sharedMocks.getItem.mockReset().mockResolvedValue({ mappingId: 'map-1', configS3Key: 'mappings/map-1/config.json' });
    sharedMocks.deleteItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.deleteObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Mapping with id 'map-1' not found", statusCode: 404, retryable: false });
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('existing mapping deletes metadata and s3 then returns 204', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(204);
    expect(sharedMocks.deleteItem).toHaveBeenCalledTimes(1);
    expect(sharedMocks.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('missing mapping returns 404', async () => {
    sharedMocks.getItem.mockResolvedValueOnce(null);

    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'missing' } });

    expect(result.statusCode).toBe(404);
  });
});
