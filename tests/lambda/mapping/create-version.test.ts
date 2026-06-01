import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  getItem: vi.fn(),
  query: vi.fn(),
  putItem: vi.fn(),
  putObject: vi.fn(),
  updateItem: vi.fn(),
  requireFields: vi.fn(),
  notFound: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/mapping/create-version.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('create-version handler', () => {
  beforeEach(() => {
    vi.resetModules();
    getEnvStore().MAPPINGS_TABLE = 'Mappings';
    getEnvStore().MAPPING_REVISIONS_TABLE = 'MappingRevisions';
    getEnvStore().MAPPING_VERSIONS_TABLE = 'MappingVersions';
    getEnvStore().CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('map-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({});
    sharedMocks.getItem.mockReset().mockResolvedValue({
      mappingId: 'map-1',
      projectId: 'proj-1',
      name: 'Invoice Map',
      version: 2,
      revision: 2,
      status: 'ready',
      ruleCount: 1,
      coverage: 100,
      configS3Key: 'mappings/map-1/config.json',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    sharedMocks.query.mockReset().mockResolvedValueOnce([{ mappingId: 'map-1', version: 2 }]);
    sharedMocks.putItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.updateItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.requireFields.mockReset().mockReturnValue({ ok: true });
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Mapping with id 'map-1' not found", statusCode: 404, retryable: false });
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('creates next version pointing at latest revision', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(201);
    const parsed = JSON.parse(result.body) as { version: number; revisionNumber: number };
    expect(parsed.version).toBe(3);
    expect(parsed.revisionNumber).toBe(2);
  });
});
