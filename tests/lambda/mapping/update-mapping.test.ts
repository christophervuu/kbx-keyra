import { beforeEach, describe, expect, it, vi } from 'vitest';

const validateMock = vi.hoisted(() => vi.fn());

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  requireFields: vi.fn(),
  getItem: vi.fn(),
  putObject: vi.fn(),
  updateItem: vi.fn(),
  conflict: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  notFound: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/engine/index.js', () => ({
  validate: validateMock,
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/mapping/update-mapping.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('update-mapping handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.MAPPINGS_TABLE = 'Mappings';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('map-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map Updated',
      version: 1,
      engineVersion: '1.0.0',
      config: {},
      rules: [{ target: 'Invoice.Id', type: 'string', expression: 'source("id")' }],
    });
    sharedMocks.requireFields.mockReset().mockReturnValue({ ok: true });
    sharedMocks.getItem.mockReset().mockResolvedValue({
      mappingId: 'map-1',
      projectId: 'proj-1',
      name: 'Invoice Map',
      version: 1,
      status: 'draft',
      ruleCount: 0,
      coverage: 0,
      configS3Key: 'mappings/map-1/config.json',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.updateItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.conflict.mockReset().mockImplementation((message) => ({ code: 'CONFLICT', message, statusCode: 409, retryable: false }));
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Mapping with id 'map-1' not found", statusCode: 404, retryable: false });
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
    validateMock.mockReset().mockReturnValue({ diagnostics: [], coverage: { percentage: 50 } });
  });

  it('matching version returns 200 with incremented version and recomputed status', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { version: number; ruleCount: number; status: string; coverage: number };
    expect(parsed.version).toBe(2);
    expect(parsed.ruleCount).toBe(1);
    expect(parsed.status).toBe('ready');
    expect(parsed.coverage).toBe(50);
  });

  it('missing mapping returns 404', async () => {
    sharedMocks.getItem.mockResolvedValueOnce(null);

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(404);
  });

  it('stale version returns 409 conflict', async () => {
    sharedMocks.parseBody.mockReturnValue({ projectId: 'proj-1', name: 'Invoice Map Updated', version: 0, rules: [] });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(409);
    const parsed = JSON.parse(result.body) as { error: { message: string } };
    expect(parsed.error.message).toContain('Version mismatch: expected 1, got 0. Reload and retry.');
  });
});
