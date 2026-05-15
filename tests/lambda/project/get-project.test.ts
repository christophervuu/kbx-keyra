import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  getItem: vi.fn(),
  query: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  notFound: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/project/get-project.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('get-project handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.PROJECTS_TABLE = 'Projects';
    env.MAPPINGS_TABLE = 'Mappings';
    env.SCHEMAS_TABLE = 'Schemas';
    sharedMocks.parsePathParam.mockReset().mockReturnValue('proj-1');
    sharedMocks.getItem.mockReset();
    sharedMocks.query.mockReset();
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Project with id 'proj-1' not found", statusCode: 404, retryable: false });
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('existing project returns 200 with mappings and schemas arrays', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        projectId: 'proj-1',
        name: 'Project 1',
        description: 'Desc',
        slug: 'project-1',
        schemaRefs: [{ schemaId: 'schema-1', type: 'local' }, { schemaId: 'schema-2', type: 'local' }],
        tags: [],
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      })
      .mockResolvedValueOnce({ schemaId: 'schema-1', name: 'S1' })
      .mockResolvedValueOnce({ schemaId: 'schema-2', name: 'S2' });
    sharedMocks.query.mockResolvedValueOnce([{ mappingId: 'map-1', projectId: 'proj-1', name: 'Map1' }]);

    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'proj-1' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { mappings: unknown[]; schemas: unknown[] };
    expect(Array.isArray(parsed.mappings)).toBe(true);
    expect(Array.isArray(parsed.schemas)).toBe(true);
  });

  it('not found returns 404 standard envelope', async () => {
    sharedMocks.getItem.mockResolvedValueOnce(null);

    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'missing' } });

    expect(result.statusCode).toBe(404);
  });

  it('omits missing schema refs gracefully', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        projectId: 'proj-1',
        name: 'Project 1',
        description: 'Desc',
        slug: 'project-1',
        schemaRefs: [{ schemaId: 'schema-1', type: 'local' }, { schemaId: 'schema-missing', type: 'local' }],
        tags: [],
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      })
      .mockResolvedValueOnce({ schemaId: 'schema-1', name: 'S1' })
      .mockResolvedValueOnce(null);
    sharedMocks.query.mockResolvedValueOnce([]);

    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'proj-1' } });
    const parsed = JSON.parse(result.body) as { schemas: unknown[] };

    expect(result.statusCode).toBe(200);
    expect(parsed.schemas).toHaveLength(1);
  });
});
