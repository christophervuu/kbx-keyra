import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  scan: vi.fn(),
  query: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/project/list-projects.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('list-projects handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.PROJECTS_TABLE = 'Projects';
    env.MAPPINGS_TABLE = 'Mappings';
    sharedMocks.scan.mockReset();
    sharedMocks.query.mockReset();
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('multiple projects returns array with mapping and schema counts', async () => {
    sharedMocks.scan.mockResolvedValue([
      { projectId: 'p1', name: 'P1', description: '', slug: 'p1', schemaRefs: [{ schemaId: 's1', type: 'local' }], tags: [], createdAt: '', updatedAt: 'u1' },
      { projectId: 'p2', name: 'P2', description: '', slug: 'p2', schemaRefs: [], tags: [], createdAt: '', updatedAt: 'u2' },
    ]);
    sharedMocks.query.mockResolvedValueOnce([{}, {}]).mockResolvedValueOnce([{}]);

    const { handler } = await importHandler();
    const result = await handler({ body: null });
    const parsed = JSON.parse(result.body) as Array<{ mappingCount: number; schemaCount: number }>;

    expect(result.statusCode).toBe(200);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.mappingCount).toBe(2);
    expect(parsed[0]?.schemaCount).toBe(1);
    expect(parsed[1]?.mappingCount).toBe(1);
    expect(parsed[1]?.schemaCount).toBe(0);
  });

  it('empty projects returns empty array', async () => {
    sharedMocks.scan.mockResolvedValue([]);

    const { handler } = await importHandler();
    const result = await handler({ body: null });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });
});
