import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  requireFields: vi.fn(),
  getItem: vi.fn(),
  putObject: vi.fn(),
  putItem: vi.fn(),
  query: vi.fn(),
  updateItem: vi.fn(),
  notFound: vi.fn(),
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
    getEnvStore().MAPPING_REVISIONS_TABLE = 'MappingRevisions';
    getEnvStore().MAPPINGS_TABLE = 'Mappings';
    getEnvStore().CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('map-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({});
    sharedMocks.requireFields.mockReset().mockReturnValue({ ok: true });
    sharedMocks.getItem.mockReset().mockResolvedValue({
      mappingId: 'map-1',
      projectId: 'proj-1',
      name: 'Invoice Map',
      version: 3,
      revision: 3,
      status: 'ready',
      ruleCount: 3,
      coverage: 75,
      configS3Key: 'mappings/map-1/config.json',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.putItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.query.mockReset().mockResolvedValue([]);
    sharedMocks.updateItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Mapping with id 'map-1' not found", statusCode: 404, retryable: false });
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('creates version from latest revision and returns 201', async () => {
    sharedMocks.query.mockResolvedValueOnce([{ mappingId: 'map-1', version: 2 }]);

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(201);
    expect(sharedMocks.putItem).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(result.body) as { version: number; revisionNumber: number };
    expect(parsed.version).toBe(3);
    expect(parsed.revisionNumber).toBe(3);
  });

  it('implicitSave path saves revision before creating version', async () => {
    sharedMocks.parseBody.mockReturnValue({
      implicitSave: true,
      projectId: 'proj-1',
      name: 'Invoice Map',
      config: {},
      rules: [],
    });
    sharedMocks.query.mockResolvedValueOnce([]);

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(201);
    expect(sharedMocks.putObject).toHaveBeenCalledTimes(1);
    expect(sharedMocks.updateItem).toHaveBeenCalledTimes(1);
  });

  it('missing required implicitSave payload fields returns 400 validation error', async () => {
    sharedMocks.parseBody.mockReturnValue({
      implicitSave: true,
      projectId: 'proj-1',
    });
    sharedMocks.requireFields.mockReturnValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Missing required field: config', statusCode: 400, retryable: false },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(400);
  });
});
