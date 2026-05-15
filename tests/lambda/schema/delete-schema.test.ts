import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  getItem: vi.fn(),
  scan: vi.fn(),
  query: vi.fn(),
  deleteItem: vi.fn(),
  deleteObject: vi.fn(),
  conflict: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  notFound: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/delete-schema.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('delete-schema handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.SCHEMAS_TABLE = 'Schemas';
    env.SCHEMA_NODES_TABLE = 'SchemaNodes';
    env.PROJECTS_TABLE = 'Projects';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('schema-1');
    sharedMocks.getItem.mockReset().mockResolvedValue({ schemaId: 'schema-1', format: 'json-schema' });
    sharedMocks.scan.mockReset().mockResolvedValue([]);
    sharedMocks.query.mockReset().mockResolvedValue([{ schemaId: 'schema-1', path: 'Invoice.Id' }]);
    sharedMocks.deleteItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.deleteObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.conflict.mockReset().mockImplementation((message: string) => ({ code: 'CONFLICT', message, statusCode: 409, retryable: false }));
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Schema with id 'schema-1' not found", statusCode: 404, retryable: false });
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('unreferenced schema deletes metadata/content/nodes and returns 204', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(204);
    expect(sharedMocks.deleteObject).toHaveBeenCalledTimes(1);
    expect(sharedMocks.deleteItem).toHaveBeenCalledTimes(2); // one node + schema metadata
  });

  it('referenced schema returns 409 conflict with project ids', async () => {
    sharedMocks.scan.mockResolvedValueOnce([
      { projectId: 'proj-1', schemaRefs: [{ schemaId: 'schema-1' }] },
      { projectId: 'proj-2', schemaRefs: [] },
    ]);

    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'schema-1' } });

    expect(result.statusCode).toBe(409);
    const parsed = JSON.parse(result.body) as { error: { message: string } };
    expect(parsed.error.message).toContain('proj-1');
  });

  it('missing schema returns 404', async () => {
    sharedMocks.getItem.mockResolvedValueOnce(null);

    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'missing' } });

    expect(result.statusCode).toBe(404);
  });
});
