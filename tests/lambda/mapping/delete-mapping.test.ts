import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  getItem: vi.fn(),
  query: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  deleteObject: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  notFound: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/mapping/delete-mapping.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('delete-mapping handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.MAPPINGS_TABLE = 'Mappings';
    env.PROJECTS_TABLE = 'Projects';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('map-1');
    sharedMocks.getItem.mockReset().mockResolvedValue({ mappingId: 'map-1', projectId: 'proj-1', sourceSchemaId: 'schema-1', targetSchemaId: 'schema-2', configS3Key: 'mappings/map-1/config.json' });
    sharedMocks.query.mockReset().mockResolvedValue([]);
    sharedMocks.updateItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.deleteItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.deleteObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Mapping with id 'map-1' not found", statusCode: 404, retryable: false });
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('existing mapping deletes metadata and s3 then returns 204', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(204);
    expect(sharedMocks.deleteItem).toHaveBeenCalledTimes(1);
    expect(sharedMocks.query).toHaveBeenCalledTimes(1);
    expect(sharedMocks.updateItem).toHaveBeenCalledTimes(1);
    expect(sharedMocks.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('missing mapping returns 404', async () => {
    sharedMocks.getItem.mockResolvedValueOnce(null);

    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'missing' } });

    expect(result.statusCode).toBe(404);
  });

  it('removes now-unreferenced schemas from project links after mapping deletion', async () => {
    sharedMocks.query.mockResolvedValueOnce([
      { mappingId: 'map-2', projectId: 'proj-1', sourceSchemaId: 'schema-2', targetSchemaId: 'schema-3', configS3Key: 'mappings/map-2/config.json' },
    ]);
    sharedMocks.getItem
      .mockResolvedValueOnce({ mappingId: 'map-1', projectId: 'proj-1', sourceSchemaId: 'schema-1', targetSchemaId: 'schema-2', configS3Key: 'mappings/map-1/config.json' })
      .mockResolvedValueOnce({
        projectId: 'proj-1',
        linkedSchemaIds: ['schema-1', 'schema-2', 'schema-3'],
        schemaRefs: [{ schemaId: 'schema-1', type: 'local' }, { schemaId: 'schema-2', type: 'local' }, { schemaId: 'schema-3', type: 'local' }],
      });

    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(204);
    expect(sharedMocks.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'Projects',
        Key: { projectId: 'proj-1' },
        ExpressionAttributeValues: expect.objectContaining({
          ':linkedSchemaIds': ['schema-2', 'schema-3'],
        }),
      }),
    );
  });

  it('returns 204 when mapping config object is already missing in S3', async () => {
    sharedMocks.deleteObject.mockRejectedValueOnce({
      appError: {
        code: 'RESOURCE_NOT_FOUND',
      },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: null, pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(204);
    expect(sharedMocks.deleteItem).toHaveBeenCalledTimes(1);
    expect(sharedMocks.deleteObject).toHaveBeenCalledTimes(1);
  });
});
