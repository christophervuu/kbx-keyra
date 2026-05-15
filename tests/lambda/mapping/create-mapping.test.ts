import { beforeEach, describe, expect, it, vi } from 'vitest';

const validateMock = vi.hoisted(() => vi.fn());

const sharedMocks = vi.hoisted(() => ({
  parseBody: vi.fn(),
  requireFields: vi.fn(),
  putItem: vi.fn(),
  putObject: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/engine/index.js', () => ({
  validate: validateMock,
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/mapping/create-mapping.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('create-mapping handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.MAPPINGS_TABLE = 'Mappings';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parseBody.mockReset().mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map',
      engineVersion: '1.0.0',
      rules: [],
    });
    sharedMocks.requireFields.mockReset().mockReturnValue({ ok: true });
    sharedMocks.putItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
    validateMock.mockReset().mockReturnValue({ diagnostics: [], coverage: { percentage: 0 } });
  });

  it('valid input returns 201 metadata with version 1', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(201);
    const parsed = JSON.parse(result.body) as { version: number; ruleCount: number; status: string; mappingId: string };
    expect(parsed.version).toBe(1);
    expect(parsed.ruleCount).toBe(0);
    expect(parsed.status).toBe('draft');
    expect(parsed.mappingId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(sharedMocks.putObject).toHaveBeenCalledTimes(1);
    expect(sharedMocks.putItem).toHaveBeenCalledTimes(1);
  });

  it('missing projectId returns 400', async () => {
    sharedMocks.requireFields.mockReturnValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Missing required field: projectId', statusCode: 400, retryable: false },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(400);
  });

  it('missing name returns 400', async () => {
    sharedMocks.requireFields.mockReturnValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Missing required field: name', statusCode: 400, retryable: false },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(400);
  });
});
