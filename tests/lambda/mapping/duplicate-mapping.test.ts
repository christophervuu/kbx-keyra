import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  requireFields: vi.fn(),
  getItem: vi.fn(),
  getObject: vi.fn(),
  putObject: vi.fn(),
  putItem: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  notFound: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/mapping/duplicate-mapping.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('duplicate-mapping handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.MAPPINGS_TABLE = 'Mappings';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('map-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({ name: 'Invoice Map (Copy)' });
    sharedMocks.requireFields.mockReset().mockReturnValue({ ok: true });
    sharedMocks.getItem.mockReset().mockResolvedValue({
      mappingId: 'map-1',
      projectId: 'proj-1',
      name: 'Invoice Map',
      version: 5,
      status: 'ready',
      sourceSchemaId: 'schema-a',
      targetSchemaId: 'schema-b',
      enrichmentSources: [{ alias: 'customerProfile', schemaId: 'schema-customer', schemaVersion: 1, schemaVersionId: 'sv-customer-1', contentHash: 'hash-customer-1', required: true }],
      ruleCount: 10,
      coverage: 90,
      configS3Key: 'mappings/map-1/config.json',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    sharedMocks.getObject.mockReset().mockResolvedValue(
      JSON.stringify({
        id: 'map-1',
        projectId: 'proj-1',
        name: 'Invoice Map',
        version: 5,
        engineVersion: '1.0.0',
        sourceSchemaRef: { schemaId: 'schema-a', type: 'local', schemaVersion: 1, schemaVersionId: 'sv-a-1', contentHash: 'hash-a-1' },
        targetSchemaRef: { schemaId: 'schema-b', type: 'local', schemaVersion: 1, schemaVersionId: 'sv-b-1', contentHash: 'hash-b-1' },
        enrichmentSources: [{ alias: 'customerProfile', schemaId: 'schema-customer', schemaVersion: 1, schemaVersionId: 'sv-customer-1', contentHash: 'hash-customer-1', required: true }],
        config: {},
        rules: [{ target: 'Invoice.Id', type: 'string', expression: 'source("id")' }],
      }),
    );
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.putItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Mapping with id 'map-1' not found", statusCode: 404, retryable: false });
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('duplicates mapping with new id, reset version, and requested name', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(201);
    const parsed = JSON.parse(result.body) as {
      mappingId: string;
      name: string;
      version: number;
      ruleCount: number;
      enrichmentSources?: Array<{ alias: string; schemaId?: string; schemaVersion?: number; schemaVersionId?: string; contentHash?: string; required?: boolean }>;
    };
    expect(parsed.mappingId).not.toBe('map-1');
    expect(parsed.name).toBe('Invoice Map (Copy)');
    expect(parsed.version).toBe(1);
    expect(parsed.ruleCount).toBe(10);
    expect(parsed.enrichmentSources).toEqual([{ alias: 'customerProfile', schemaId: 'schema-customer', schemaVersion: 1, schemaVersionId: 'sv-customer-1', contentHash: 'hash-customer-1', required: true }]);
  });

  it('missing source mapping returns 404', async () => {
    sharedMocks.getItem.mockResolvedValueOnce(null);

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'missing' } });

    expect(result.statusCode).toBe(404);
  });
});
