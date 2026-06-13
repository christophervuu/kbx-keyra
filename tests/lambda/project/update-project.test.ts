import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  getItem: vi.fn(),
  query: vi.fn(),
  updateItem: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  notFound: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR', CONFLICT: 'CONFLICT' },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/project/update-project.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('update-project handler', () => {
  beforeEach(() => {
    vi.resetModules();
    getEnvStore().PROJECTS_TABLE = 'Projects';
    getEnvStore().MAPPINGS_TABLE = 'Mappings';
    sharedMocks.parsePathParam.mockReset().mockReturnValue('proj-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({ name: 'New Name' });
    sharedMocks.getItem.mockReset().mockResolvedValue({
      projectId: 'proj-1',
      name: 'Old Name',
      description: 'Old Desc',
      slug: 'old-slug',
      linkedSchemaIds: [],
      schemaRefs: [],
      tags: ['tag1'],
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    sharedMocks.updateItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.query.mockReset().mockResolvedValue([]);
    sharedMocks.errorResponse
      .mockReset()
      .mockImplementation((code, message, statusCode, retryable, requestId, details) => ({
        statusCode,
        body: JSON.stringify({ error: { code, message, statusCode, retryable, requestId, ...(details !== undefined ? { details } : {}) } }),
      }));
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Project with id 'proj-1' not found", statusCode: 404, retryable: false });
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('valid update returns 200', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'proj-1' } });

    expect(result.statusCode).toBe(200);
    expect(sharedMocks.updateItem).toHaveBeenCalledTimes(1);
  });

  it('not found returns 404', async () => {
    sharedMocks.getItem.mockResolvedValueOnce(null);
    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'proj-1' } });

    expect(result.statusCode).toBe(404);
  });

  it('partial update preserves unchanged fields', async () => {
    sharedMocks.parseBody.mockReturnValue({ description: 'Updated Desc' });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'proj-1' } });
    const parsed = JSON.parse(result.body) as { name: string; description: string; slug: string };

    expect(parsed.name).toBe('Old Name');
    expect(parsed.description).toBe('Updated Desc');
    expect(parsed.slug).toBe('old-slug');
  });

  it('blocks unlink when project mappings still reference removed schema', async () => {
    sharedMocks.parseBody.mockReturnValue({
      linkedSchemaIds: [],
      schemaRefs: [],
    });
    sharedMocks.getItem.mockResolvedValueOnce({
      projectId: 'proj-1',
      name: 'Old Name',
      description: 'Old Desc',
      slug: 'old-slug',
      linkedSchemaIds: ['schema-1'],
      schemaRefs: [{ schemaId: 'schema-1', type: 'local' }],
      tags: ['tag1'],
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    sharedMocks.query.mockReset().mockResolvedValueOnce([
      { mappingId: 'map-1', sourceSchemaId: 'schema-1' },
    ]);

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'proj-1' } });
    const parsed = JSON.parse(result.body) as { error: { code: string; details?: { dependentMappings?: unknown[] } } };

    expect(result.statusCode).toBe(409);
    expect(parsed.error.code).toBe('CONFLICT');
    expect(parsed.error.details?.dependentMappings).toHaveLength(1);
    expect(sharedMocks.updateItem).not.toHaveBeenCalled();
  });
});
