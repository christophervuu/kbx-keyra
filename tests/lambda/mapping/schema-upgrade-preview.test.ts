import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  getItem: vi.fn(),
  getObject: vi.fn(),
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

const schemaMocks = vi.hoisted(() => ({
  listSchemaNodeIdentities: vi.fn(),
  computeSchemaIdentityDiff: vi.fn(),
  computeRoleImpactSummary: vi.fn(),
  impactedPointerToDotPath: vi.fn(),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);
vi.mock('../../../src/lib/persistence/index.js', () => ({
  listSchemaNodeIdentities: schemaMocks.listSchemaNodeIdentities,
}));
vi.mock('../../../src/lib/schema/index.js', () => ({
  computeSchemaIdentityDiff: schemaMocks.computeSchemaIdentityDiff,
  computeRoleImpactSummary: schemaMocks.computeRoleImpactSummary,
  impactedPointerToDotPath: schemaMocks.impactedPointerToDotPath,
}));

async function importHandler() {
  return import('../../../src/lambda/mapping/schema-upgrade-preview.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }
  return processRef.env;
}

describe('schema-upgrade-preview handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.MAPPINGS_TABLE = 'Mappings';
    env.SCHEMAS_TABLE = 'Schemas';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('map-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({
      expectedMappingRevision: 1,
      role: 'source',
      destination: {
        schemaId: 'schema-source',
        schemaVersion: 2,
        schemaVersionId: 'sv-source-2',
        contentHash: 'hash-source-2',
      },
    });
    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-1');
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode) => ({ statusCode, body: JSON.stringify({ error: { code, message } }) }));
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.conflict.mockReset().mockImplementation((message) => ({ code: 'CONFLICT', message, statusCode: 409, retryable: false }));
    sharedMocks.getItem.mockReset().mockResolvedValueOnce({ mappingId: 'map-1', revision: 1, version: 1, configS3Key: 'mappings/map-1/config.json' }).mockResolvedValue(null);
    sharedMocks.getObject.mockReset().mockResolvedValue(JSON.stringify({
      id: 'map-1',
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

    schemaMocks.listSchemaNodeIdentities.mockReset().mockResolvedValueOnce([{ fieldId: 'f1', schemaVersionId: 'sv-source-1', jsonPointer: '/Customer/Id' }]).mockResolvedValueOnce([{ fieldId: 'f2', schemaVersionId: 'sv-source-2', jsonPointer: '/Customer/Identifier' }]);
    schemaMocks.computeSchemaIdentityDiff.mockReset().mockReturnValue({
      added: ['/Customer/Identifier'],
      removed: ['/Customer/Id'],
      renamed: [{ fieldId: 'f1', fromJsonPointer: '/Customer/Id', toJsonPointer: '/Customer/Identifier' }],
      moved: [],
    });
    schemaMocks.computeRoleImpactSummary.mockReset().mockReturnValue({
      role: 'source',
      breakingCount: 1,
      nonBreakingCount: 0,
      affectedRules: [{
        ruleIndex: 0,
        target: 'Output.CustomerId',
        expression: 'source("Customer.Id")',
        severity: 'breaking',
        matchedPaths: ['Customer.Id'],
      }],
    });
    schemaMocks.impactedPointerToDotPath.mockReset().mockImplementation((pointer: string) => pointer.replace(/^\//, '').replaceAll('/', '.'));
  });

  it('returns preview with role-aware impact and suggestions', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as {
      previewId: string;
      impact: { role: string; breakingCount: number };
      suggestions: Array<{ suggestionId: string; type: string }>;
    };
    expect(parsed.previewId).toBeTruthy();
    expect(parsed.impact.role).toBe('source');
    expect(parsed.impact.breakingCount).toBe(1);
    expect(parsed.suggestions[0]?.type).toBe('rename');
    expect(infoSpy).toHaveBeenCalledWith(
      '[schema-upgrade-preview] preview-generated',
      expect.objectContaining({
        eventType: 'mapping-schema-upgrade-preview-generated',
        mappingId: 'map-1',
        role: 'source',
      }),
    );
    infoSpy.mockRestore();
  });

  it('invalidates when expected mapping revision is stale', async () => {
    sharedMocks.parseBody.mockReturnValue({
      expectedMappingRevision: 1,
      role: 'source',
      destination: {
        schemaId: 'schema-source',
        schemaVersion: 2,
        schemaVersionId: 'sv-source-2',
        contentHash: 'hash-source-2',
      },
    });
    sharedMocks.getItem.mockReset().mockResolvedValueOnce({ mappingId: 'map-1', revision: 2, version: 2, configS3Key: 'mappings/map-1/config.json' });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(409);
  });
});
