import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  query: vi.fn(),
  deleteItem: vi.fn(),
  conflict: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/project/delete-project.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('delete-project handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.PROJECTS_TABLE = 'Projects';
    env.MAPPINGS_TABLE = 'Mappings';
    sharedMocks.parsePathParam.mockReset().mockReturnValue('proj-1');
    sharedMocks.query.mockReset().mockResolvedValue([]);
    sharedMocks.deleteItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.conflict.mockReset().mockReturnValue({
      code: 'CONFLICT',
      message: 'Cannot delete project with existing mappings. Delete mappings first.',
      statusCode: 409,
      retryable: false,
    });
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('no mappings returns 204', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'proj-1' } });

    expect(result.statusCode).toBe(204);
    expect(sharedMocks.deleteItem).toHaveBeenCalledTimes(1);
  });

  it('has mappings returns 409 conflict', async () => {
    sharedMocks.query.mockResolvedValueOnce([{}]);

    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'proj-1' } });

    expect(result.statusCode).toBe(409);
    expect(sharedMocks.deleteItem).not.toHaveBeenCalled();
  });
});
