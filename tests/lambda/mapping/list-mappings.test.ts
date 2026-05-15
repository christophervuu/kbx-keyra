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
  return import('../../../src/lambda/mapping/list-mappings.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('list-mappings handler', () => {
  beforeEach(() => {
    vi.resetModules();
    getEnvStore().MAPPINGS_TABLE = 'Mappings';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('proj-1');
    sharedMocks.query.mockReset().mockResolvedValue([
      { mappingId: 'map-1', projectId: 'proj-1', name: 'M1', version: 1, status: 'draft', ruleCount: 0, coverage: 0, updatedAt: '2026-05-15T00:00:00.000Z' },
      { mappingId: 'map-2', projectId: 'proj-1', name: 'M2', version: 2, status: 'ready', ruleCount: 2, coverage: 50, updatedAt: '2026-05-15T00:00:00.000Z' },
    ]);
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('returns project-scoped mappings array', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { projectId: 'proj-1' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as Array<{ projectId: string }>;
    expect(parsed).toHaveLength(2);
    expect(parsed.every((item) => item.projectId === 'proj-1')).toBe(true);
  });
});
