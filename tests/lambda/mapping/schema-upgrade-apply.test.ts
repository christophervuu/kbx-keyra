import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  getItem: vi.fn(),
  getObject: vi.fn(),
  putObject: vi.fn(),
  putItem: vi.fn(),
  updateItem: vi.fn(),
  query: vi.fn(),
  errorResponse: vi.fn(),
  jsonResponse: vi.fn(),
  generateRequestId: vi.fn(),
  conflict: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    CONFLICT: 'CONFLICT',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
  },
}));

const persistenceMocks = vi.hoisted(() => ({
  computeConfigHash: vi.fn(),
  listSchemaNodeIdentities: vi.fn(),
}));

const schemaMocks = vi.hoisted(() => ({
  computeSchemaIdentityDiff: vi.fn(),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);
vi.mock('../../../src/lib/persistence/index.js', () => ({
  computeConfigHash: persistenceMocks.computeConfigHash,
  listSchemaNodeIdentities: persistenceMocks.listSchemaNodeIdentities,
}));
vi.mock('../../../src/lib/schema/index.js', () => ({
  computeSchemaIdentityDiff: schemaMocks.computeSchemaIdentityDiff,
}));

async function importHandler() {
  return import('../../../src/lambda/mapping/schema-upgrade-apply.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }
  return processRef.env;
}

function makePreviewId(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
}

describe('schema-upgrade-apply handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.MAPPINGS_TABLE = 'Mappings';
    env.MAPPING_REVISIONS_TABLE = 'MappingRevisions';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('map-1');
    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-1');
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode) => ({ statusCode, body: JSON.stringify({ error: { code, message } }) }));
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.conflict.mockReset().mockImplementation((message) => ({ code: 'CONFLICT', message, statusCode: 409, retryable: false }));

    sharedMocks.parseBody.mockReset().mockReturnValue({
      expectedMappingRevision: 1,
      previewId: makePreviewId({
        mappingId: 'map-1',
        baseMappingRevision: 1,
        role: 'source',
        from: {
          schemaId: 'schema-source',
          schemaVersion: 1,
          schemaVersionId: 'sv-source-1',
          contentHash: 'hash-source-1',
        },
        to: {
          schemaId: 'schema-source',
          schemaVersion: 2,
          schemaVersionId: 'sv-source-2',
          contentHash: 'hash-source-2',
        },
        suggestionIds: ['map-1:rename:/Customer/Id->/Customer/Identifier'],
      }),
      acceptedSuggestions: ['map-1:rename:/Customer/Id->/Customer/Identifier'],
      confirm: true,
    });

    sharedMocks.getItem.mockReset().mockResolvedValue({
      mappingId: 'map-1',
      projectId: 'proj-1',
      revision: 1,
      version: 1,
      configS3Key: 'mappings/map-1/config.json',
      sourceSchemaId: 'schema-source',
      targetSchemaId: 'schema-target',
      status: 'ready',
      ruleCount: 1,
      coverage: 100,
      latestVersion: null,
      configHash: 'old-hash',
      name: 'Map',
      createdAt: '2026-07-06T00:00:00.000Z',
      updatedAt: '2026-07-06T00:00:00.000Z',
    });
    sharedMocks.getObject.mockReset().mockResolvedValue(JSON.stringify({
      id: 'map-1',
      projectId: 'proj-1',
      version: 1,
      name: 'Map',
      engineVersion: '1.0.0',
      sourceSchemaRef: {
        schemaId: 'schema-source',
        type: 'local',
        schemaVersion: 1,
        schemaVersionId: 'sv-source-1',
        contentHash: 'hash-source-1',
      },
      targetSchemaRef: {
        schemaId: 'schema-target',
        type: 'local',
        schemaVersion: 1,
        schemaVersionId: 'sv-target-1',
        contentHash: 'hash-target-1',
      },
      config: { externalSources: [] },
      rules: [{ target: 'Output.CustomerId', type: 'string', expression: 'source("Customer.Id")' }],
    }));

    persistenceMocks.listSchemaNodeIdentities.mockReset().mockResolvedValueOnce([{ fieldId: 'f1', schemaVersionId: 'sv-source-1', jsonPointer: '/Customer/Id' }]).mockResolvedValueOnce([{ fieldId: 'f1', schemaVersionId: 'sv-source-2', jsonPointer: '/Customer/Identifier' }]);
    schemaMocks.computeSchemaIdentityDiff.mockReset().mockReturnValue({
      added: [],
      removed: [],
      renamed: [{ fieldId: 'f1', fromJsonPointer: '/Customer/Id', toJsonPointer: '/Customer/Identifier' }],
      moved: [],
    });
    persistenceMocks.computeConfigHash.mockReset().mockResolvedValue('new-hash');
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.putItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.updateItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.query.mockReset().mockResolvedValue([]);
  });

  it('applies preview explicitly and creates a new mapping revision only', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { revision: number; noChange: boolean };
    expect(parsed.revision).toBe(2);
    expect(parsed.noChange).toBe(false);
    expect(sharedMocks.putItem).toHaveBeenCalledTimes(1);
    expect(sharedMocks.updateItem).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith(
      '[schema-upgrade-apply] apply-completed',
      expect.objectContaining({
        eventType: 'mapping-schema-upgrade-applied',
        mappingId: 'map-1',
        role: 'source',
      }),
    );
    infoSpy.mockRestore();
  });

  it('requires explicit confirm=true', async () => {
    sharedMocks.parseBody.mockReturnValue({
      expectedMappingRevision: 1,
      previewId: 'p',
      acceptedSuggestions: ['map-1:rename:/Customer/Id->/Customer/Identifier'],
      confirm: false,
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(400);
  });

  it('invalidates apply when accepted suggestions do not match preview baseline', async () => {
    sharedMocks.parseBody.mockReturnValue({
      expectedMappingRevision: 1,
      previewId: makePreviewId({
        mappingId: 'map-1',
        baseMappingRevision: 1,
        role: 'source',
        from: { schemaId: 'schema-source', schemaVersion: 1, schemaVersionId: 'sv-source-1', contentHash: 'hash-source-1' },
        to: { schemaId: 'schema-source', schemaVersion: 2, schemaVersionId: 'sv-source-2', contentHash: 'hash-source-2' },
        suggestionIds: ['map-1:rename:/Customer/Id->/Customer/Identifier'],
      }),
      acceptedSuggestions: [],
      confirm: true,
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(409);
    expect(sharedMocks.putItem).not.toHaveBeenCalled();
  });

  it('invalidates apply when mapping revision changed since preview', async () => {
    sharedMocks.getItem.mockResolvedValueOnce({
      mappingId: 'map-1',
      projectId: 'proj-1',
      revision: 2,
      version: 2,
      configS3Key: 'mappings/map-1/config.json',
      sourceSchemaId: 'schema-source',
      targetSchemaId: 'schema-target',
      status: 'ready',
      ruleCount: 1,
      coverage: 100,
      latestVersion: null,
      configHash: 'old-hash',
      name: 'Map',
      createdAt: '2026-07-06T00:00:00.000Z',
      updatedAt: '2026-07-06T00:00:00.000Z',
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(409);
    expect(sharedMocks.putItem).not.toHaveBeenCalled();
  });
});
