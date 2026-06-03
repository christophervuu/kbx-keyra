import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  parseQueryParam: vi.fn(),
  generateRequestId: vi.fn(),
  getItem: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
    DEPLOY_BLOCKED_CDM_SCHEMA_STATE: 'DEPLOY_BLOCKED_CDM_SCHEMA_STATE',
    REVISION_NOT_DEPLOYABLE_TO_ENV: 'REVISION_NOT_DEPLOYABLE_TO_ENV',
    PROMOTION_REQUIRES_VERSION: 'PROMOTION_REQUIRES_VERSION',
    SNAPSHOT_INTEGRITY_ERROR: 'SNAPSHOT_INTEGRITY_ERROR',
  },
}));

const deploymentPersistenceMocks = vi.hoisted(() => ({
  create: vi.fn(),
  getCurrent: vi.fn(),
  getCurrentAll: vi.fn(),
  listHistory: vi.fn(),
}));

const revisionMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
}));

const versionMocks = vi.hoisted(() => ({
  get: vi.fn(),
  getConfig: vi.fn(),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);
vi.mock('../../../src/lib/persistence/deployments.js', () => deploymentPersistenceMocks);
vi.mock('../../../src/lib/persistence/mapping-revisions.js', () => revisionMocks);
vi.mock('../../../src/lib/persistence/mapping-versions.js', () => versionMocks);

async function importDeployHandler() {
  return import('../../../src/lambda/deployment/deploy-mapping.js');
}

async function importPromoteHandler() {
  return import('../../../src/lambda/deployment/promote-deployment.js');
}

async function importRollbackHandler() {
  return import('../../../src/lambda/deployment/rollback-deployment.js');
}

async function importListHandler() {
  return import('../../../src/lambda/deployment/list-deployments.js');
}

async function importCurrentHandler() {
  return import('../../../src/lambda/deployment/get-current-deployments.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('deployment handlers', () => {
  beforeEach(() => {
    vi.resetModules();

    getEnvStore().MAPPINGS_TABLE = 'Mappings';
    getEnvStore().SCHEMAS_TABLE = 'Schemas';

    sharedMocks.parsePathParam.mockReset().mockImplementation((event, name: string) => event.pathParameters?.[name] ?? null);
    sharedMocks.parseBody.mockReset().mockReturnValue({});
    sharedMocks.parseQueryParam.mockReset().mockImplementation((event, name: string) => event.queryStringParameters?.[name] ?? null);
    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-123');
    sharedMocks.getItem.mockReset().mockResolvedValue({ mappingId: 'map-1' });

    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({
      statusCode,
      body: JSON.stringify({ error: { code, message, statusCode, retryable } }),
    }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });

    deploymentPersistenceMocks.create.mockReset().mockResolvedValue({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 });
    deploymentPersistenceMocks.getCurrent.mockReset().mockResolvedValue({ sourceType: 'version', sourceNumber: 3 });
    deploymentPersistenceMocks.getCurrentAll.mockReset().mockResolvedValue({ DEV: null, QA: null, PROD: null });
    deploymentPersistenceMocks.listHistory.mockReset().mockResolvedValue([]);

    revisionMocks.getConfig.mockReset().mockResolvedValue({ id: 'config' });
    versionMocks.get.mockReset().mockResolvedValue({ version: 3 });
    versionMocks.getConfig.mockReset().mockResolvedValue({ id: 'config' });
  });

  it('deploy handler allows revision deploy to DEV', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 });
    const { handler } = await importDeployHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(201);
    expect(deploymentPersistenceMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 }),
    );
  });

  it('deploy handler rejects revision deploy to QA', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'QA', sourceType: 'revision', sourceNumber: 2 });
    const { handler } = await importDeployHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('REVISION_NOT_DEPLOYABLE_TO_ENV');
  });

  it('deploy handler allows version deploy to PROD', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'PROD', sourceType: 'version', sourceNumber: 3 });
    const { handler } = await importDeployHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(201);
    expect(deploymentPersistenceMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'PROD', sourceType: 'version', sourceNumber: 3 }),
    );
  });

  it('deploy handler blocks when referenced CDM source schema is unsynced', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 });
    sharedMocks.getItem
      .mockResolvedValueOnce({ mappingId: 'map-1', sourceSchemaId: 'schema-source' })
      .mockResolvedValueOnce({
        schemaId: 'schema-source',
        name: 'Order Source',
        origin: 'cdm',
        status: 'ready',
        syncStatus: 'not-synced',
        source: {
          type: 'github',
          repo: 'KBXT/KBX-Canonicals',
          path: 'JSONSchemas/CommonDataModels/Order.json',
          commitSha: 'abc123',
        },
      });

    const { handler } = await importDeployHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('DEPLOY_BLOCKED_CDM_SCHEMA_STATE');
    expect(body.error.details.issues).toEqual([
      {
        schemaId: 'schema-source',
        schemaName: 'Order Source',
        referenceRole: 'source',
        reason: 'unsynced',
        remediationKey: 're-sync-schema',
      },
    ]);
    expect(revisionMocks.getConfig).not.toHaveBeenCalled();
    expect(deploymentPersistenceMocks.create).not.toHaveBeenCalled();
  });

  it('promote handler requires version-backed source', async () => {
    sharedMocks.parseBody.mockReturnValue({ fromEnvironment: 'DEV', toEnvironment: 'QA' });
    deploymentPersistenceMocks.getCurrent.mockResolvedValueOnce({ sourceType: 'revision', sourceNumber: 2 });
    const { handler } = await importPromoteHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('PROMOTION_REQUIRES_VERSION');
  });

  it('promote handler creates deployment when source is version-backed', async () => {
    sharedMocks.parseBody.mockReturnValue({ fromEnvironment: 'DEV', toEnvironment: 'QA' });
    deploymentPersistenceMocks.getCurrent.mockResolvedValueOnce({ sourceType: 'version', sourceNumber: 3 });
    const { handler } = await importPromoteHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(201);
    expect(deploymentPersistenceMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'QA',
        sourceType: 'version',
        sourceNumber: 3,
        promotedFrom: 'DEV',
      }),
    );
  });

  it('promote handler includes cdmSchemaTraceability when referenced CDM schemas are deployable', async () => {
    sharedMocks.parseBody.mockReturnValue({ fromEnvironment: 'DEV', toEnvironment: 'QA' });
    deploymentPersistenceMocks.getCurrent.mockResolvedValueOnce({ sourceType: 'version', sourceNumber: 3 });
    sharedMocks.getItem
      .mockResolvedValueOnce({ mappingId: 'map-1', sourceSchemaId: 'schema-source' })
      .mockResolvedValueOnce({
        schemaId: 'schema-source',
        name: 'Order Source',
        origin: 'cdm',
        status: 'ready',
        syncStatus: 'synced',
        source: {
          type: 'github',
          repo: 'KBXT/KBX-Canonicals',
          path: 'JSONSchemas/CommonDataModels/OrderSource.json',
          commitSha: 'sha-source',
        },
      });

    const { handler } = await importPromoteHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(201);
    expect(deploymentPersistenceMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cdmSchemaTraceability: [
          {
            schemaId: 'schema-source',
            schemaName: 'Order Source',
            referenceRole: 'source',
            repo: 'KBXT/KBX-Canonicals',
            path: 'JSONSchemas/CommonDataModels/OrderSource.json',
            commitSha: 'sha-source',
          },
        ],
      }),
    );
  });

  it('promote handler blocks when referenced CDM target schema is missing', async () => {
    sharedMocks.parseBody.mockReturnValue({ fromEnvironment: 'DEV', toEnvironment: 'QA' });
    sharedMocks.getItem
      .mockResolvedValueOnce({ mappingId: 'map-1', targetSchemaId: 'schema-target' })
      .mockResolvedValueOnce(null);

    const { handler } = await importPromoteHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('DEPLOY_BLOCKED_CDM_SCHEMA_STATE');
    expect(body.error.details.issues).toEqual([
      {
        schemaId: 'schema-target',
        referenceRole: 'target',
        reason: 'schema-missing',
        remediationKey: 'relink-cdm-schema',
      },
    ]);
    expect(deploymentPersistenceMocks.getCurrent).not.toHaveBeenCalled();
    expect(deploymentPersistenceMocks.create).not.toHaveBeenCalled();
  });

  it('deploy handler does not false-block fully deployable referenced CDM schemas', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 });
    sharedMocks.getItem
      .mockResolvedValueOnce({ mappingId: 'map-1', sourceSchemaId: 'schema-source', targetSchemaId: 'schema-target' })
      .mockResolvedValueOnce({
        schemaId: 'schema-source',
        name: 'Order Source',
        origin: 'cdm',
        status: 'ready',
        syncStatus: 'synced',
        source: {
          type: 'github',
          repo: 'KBXT/KBX-Canonicals',
          path: 'JSONSchemas/CommonDataModels/OrderSource.json',
          commitSha: 'sha-source',
        },
      })
      .mockResolvedValueOnce({
        schemaId: 'schema-target',
        name: 'Order Target',
        origin: 'cdm',
        status: 'ready',
        syncStatus: 'synced',
        source: {
          type: 'github',
          repo: 'KBXT/KBX-Canonicals',
          path: 'JSONSchemas/CommonDataModels/OrderTarget.json',
          commitSha: 'sha-target',
        },
      });

    const { handler } = await importDeployHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(201);
    expect(deploymentPersistenceMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cdmSchemaTraceability: [
          {
            schemaId: 'schema-source',
            schemaName: 'Order Source',
            referenceRole: 'source',
            repo: 'KBXT/KBX-Canonicals',
            path: 'JSONSchemas/CommonDataModels/OrderSource.json',
            commitSha: 'sha-source',
          },
          {
            schemaId: 'schema-target',
            schemaName: 'Order Target',
            referenceRole: 'target',
            repo: 'KBXT/KBX-Canonicals',
            path: 'JSONSchemas/CommonDataModels/OrderTarget.json',
            commitSha: 'sha-target',
          },
        ],
      }),
    );
  });

  it('rollback handler creates deployment with rollbackOf', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'PROD', deploymentSK: 'PROD#2026-06-01T00:00:00.000Z' });
    deploymentPersistenceMocks.listHistory.mockResolvedValueOnce([
      {
        environmentDeployedAt: 'PROD#2026-06-01T00:00:00.000Z',
        sourceType: 'version',
        sourceNumber: 2,
      },
    ]);
    const { handler } = await importRollbackHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(201);
    expect(deploymentPersistenceMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'PROD',
        sourceType: 'version',
        sourceNumber: 2,
        rollbackOf: 'PROD#2026-06-01T00:00:00.000Z',
      }),
    );
  });

  it('list handler returns filtered history', async () => {
    sharedMocks.parseQueryParam.mockReturnValueOnce('DEV');
    deploymentPersistenceMocks.listHistory.mockResolvedValueOnce([{ environment: 'DEV' }]);
    const { handler } = await importListHandler();

    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1' }, queryStringParameters: { environment: 'DEV' } });

    expect(result.statusCode).toBe(200);
    expect(deploymentPersistenceMocks.listHistory).toHaveBeenCalledWith('map-1', 'DEV');
  });

  it('current handler returns per-environment map', async () => {
    deploymentPersistenceMocks.getCurrentAll.mockResolvedValueOnce({ DEV: { sourceType: 'version' }, QA: null, PROD: null });
    const { handler } = await importCurrentHandler();

    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ DEV: { sourceType: 'version' }, QA: null, PROD: null });
  });
});
