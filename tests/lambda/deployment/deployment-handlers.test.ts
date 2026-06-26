import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fs100Ae12RuntimeLifecycleFixture } from './fixtures/fs100-ae12-runtime-lifecycle.js';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  parseQueryParam: vi.fn(),
  generateRequestId: vi.fn(),
  getItem: vi.fn(),
  getObject: vi.fn(),
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
    PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
    DEPLOY_ARTIFACT_TOO_LARGE: 'DEPLOY_ARTIFACT_TOO_LARGE',
    ARTIFACT_NOT_PRESENT: 'ARTIFACT_NOT_PRESENT',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    CONFLICT: 'CONFLICT',
  },
}));

const deploymentPersistenceMocks = vi.hoisted(() => ({
  create: vi.fn(),
  createRollback: vi.fn(),
  getCurrent: vi.fn(),
  getCurrentAll: vi.fn(),
  listHistory: vi.fn(),
  getActiveSnapshot: vi.fn(),
  upsertActiveSnapshot: vi.fn(),
  appendDeploymentHistory: vi.fn(),
  listDeploymentHistory: vi.fn(),
  ActiveSnapshotConflictError: class ActiveSnapshotConflictError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ActiveSnapshotConflictError';
    }
  },
}));

const orchestrationPersistenceMocks = vi.hoisted(() => ({
  create: vi.fn(),
  updateStatus: vi.fn(),
  get: vi.fn(),
}));

const revisionMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
}));

const versionMocks = vi.hoisted(() => ({
  get: vi.fn(),
  getConfig: vi.fn(),
}));

const runtimeRelayMocks = vi.hoisted(() => ({
  buildRuntimeDeployArtifact: vi.fn(),
  assertArtifactPayloadWithinLimit: vi.fn(),
  getRuntimeRelayClient: vi.fn(),
  relayClient: {
    pushArtifact: vi.fn(),
  },
}));

const runtimeApiClientMocks = vi.hoisted(() => ({
  getRuntimeApiClient: vi.fn(),
  client: {
    rollback: vi.fn(),
    preview: vi.fn(),
    status: vi.fn(),
    deploy: vi.fn(),
  },
}));

const retryMocks = vi.hoisted(() => ({
  executeRuntimeOperationWithRetry: vi.fn(),
}));

const engineMocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);
vi.mock('../../../src/lib/persistence/deployments.js', () => deploymentPersistenceMocks);
vi.mock('../../../src/lib/persistence/deployment-orchestrations.js', () => orchestrationPersistenceMocks);
vi.mock('../../../src/lib/persistence/mapping-revisions.js', () => revisionMocks);
vi.mock('../../../src/lib/persistence/mapping-versions.js', () => versionMocks);
vi.mock('../../../src/lambda/deployment/runtime-relay.js', () => ({
  buildRuntimeDeployArtifact: runtimeRelayMocks.buildRuntimeDeployArtifact,
  assertArtifactPayloadWithinLimit: runtimeRelayMocks.assertArtifactPayloadWithinLimit,
  getRuntimeRelayClient: runtimeRelayMocks.getRuntimeRelayClient,
}));
vi.mock('../../../src/lambda/deployment/runtime-api-client.js', () => ({
  getRuntimeApiClient: runtimeApiClientMocks.getRuntimeApiClient,
}));
vi.mock('../../../src/lambda/deployment/orchestration-retry.js', () => ({
  executeRuntimeOperationWithRetry: retryMocks.executeRuntimeOperationWithRetry,
}));
vi.mock('../../../src/engine/index.js', () => engineMocks);

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

async function importDeploymentContextHandler() {
  return import('../../../src/lambda/deployment/get-deployment-context.js');
}

async function importRuntimeDeployHandler() {
  return import('../../../src/lambda/deployment/runtime-deploy.js');
}

async function importRuntimeRollbackHandler() {
  return import('../../../src/lambda/deployment/runtime-rollback.js');
}

async function importRuntimeExecuteHandler() {
  return import('../../../src/lambda/runtime/execute.js');
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
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    getEnvStore().MAPPINGS_TABLE = 'Mappings';
    getEnvStore().PROJECTS_TABLE = 'Projects';
    getEnvStore().SCHEMAS_TABLE = 'Schemas';

    sharedMocks.parsePathParam.mockReset().mockImplementation((event, name: string) => event.pathParameters?.[name] ?? null);
    sharedMocks.parseBody.mockReset().mockReturnValue({});
    sharedMocks.parseQueryParam.mockReset().mockImplementation((event, name: string) => event.queryStringParameters?.[name] ?? null);
    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-123');
    sharedMocks.getItem.mockReset().mockResolvedValue({ mappingId: 'map-1' });
    sharedMocks.getObject.mockReset().mockResolvedValue(
      JSON.stringify({
        mappingConfig: {
          name: 'Map',
          version: 1,
          engineVersion: '1.0.0',
          config: {},
          rules: [],
        },
      }),
    );

    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body, requestId) => ({
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
      body: JSON.stringify(body),
    }));
    sharedMocks.errorResponse
      .mockReset()
      .mockImplementation((code, message, statusCode, retryable, requestId, details) => ({
        statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          ...(requestId ? { 'x-request-id': requestId } : {}),
        },
        body: JSON.stringify({
          error: {
            code,
            message,
            statusCode,
            retryable,
            ...(requestId ? { requestId } : {}),
            ...(details !== undefined ? { details } : {}),
          },
        }),
      }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });

    deploymentPersistenceMocks.create.mockReset().mockResolvedValue({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 });
    deploymentPersistenceMocks.createRollback.mockReset().mockResolvedValue({
      environment: 'PROD',
      sourceType: 'version',
      sourceNumber: 2,
      rollbackOf: 'PROD#2026-06-01T00:00:00.000Z',
    });
    deploymentPersistenceMocks.getCurrent.mockReset().mockResolvedValue({ sourceType: 'version', sourceNumber: 3 });
    deploymentPersistenceMocks.getCurrentAll.mockReset().mockResolvedValue({ DEV: null, PREPROD: null, PROD: null });
    deploymentPersistenceMocks.listHistory.mockReset().mockResolvedValue([]);
    deploymentPersistenceMocks.getActiveSnapshot.mockReset().mockResolvedValue(null);
    deploymentPersistenceMocks.upsertActiveSnapshot.mockReset().mockResolvedValue({
      mappingId: 'map-1',
      activeSnapshotId: 'snapshot-1',
      snapshotHash: 'abc',
      activatedAt: '2026-06-04T00:00:00.000Z',
      activatedBy: 'control-plane',
      sourceType: 'version',
      sourceNumber: 3,
    });
    deploymentPersistenceMocks.appendDeploymentHistory.mockReset().mockResolvedValue({
      mappingId: 'map-1',
      eventAt: '2026-06-04T00:00:00.000Z',
      eventType: 'deploy',
      snapshotId: 'snapshot-1',
      snapshotHash: 'abc',
      requestedBy: 'control-plane',
      sourceType: 'version',
      sourceNumber: 3,
      requestId: 'req-123',
    });
    deploymentPersistenceMocks.listDeploymentHistory.mockReset().mockResolvedValue([]);

    orchestrationPersistenceMocks.create.mockReset().mockResolvedValue({
      orchestrationId: 'orc-1',
    });
    orchestrationPersistenceMocks.updateStatus.mockReset().mockResolvedValue(undefined);
    orchestrationPersistenceMocks.get.mockReset().mockResolvedValue(null);

    runtimeRelayMocks.buildRuntimeDeployArtifact.mockReset().mockResolvedValue({
      artifactId: 'artifact-1',
      snapshotId: 'artifact-1',
      artifactHash: 'abc',
      mappingId: 'map-1',
      sourceType: 'version',
      sourceNumber: 3,
      sourceConfigHash: 'abc',
      engineVersion: '1.0.0',
      mappingConfig: { id: 'config' },
    });
    runtimeRelayMocks.assertArtifactPayloadWithinLimit.mockReset().mockReturnValue({
      ok: true,
      payloadBytes: 128,
      limitBytes: 1024,
    });
    runtimeRelayMocks.relayClient.pushArtifact.mockReset().mockResolvedValue({
      ok: true,
      statusCode: 201,
      requestId: 'runtime-req-1',
    });
    runtimeRelayMocks.getRuntimeRelayClient.mockReset().mockReturnValue(runtimeRelayMocks.relayClient);

    runtimeApiClientMocks.getRuntimeApiClient.mockReset().mockReturnValue(runtimeApiClientMocks.client);
    runtimeApiClientMocks.client.rollback.mockReset().mockResolvedValue({
      ok: true,
      statusCode: 201,
      requestId: 'runtime-rollback-req-1',
      data: {
        mappingId: 'map-1',
        environment: 'PROD',
        artifactId: 'artifact-2',
      },
    });

    retryMocks.executeRuntimeOperationWithRetry.mockReset().mockImplementation(async (input) => {
      const attempt = await input.executeAttempt(1);
      if (attempt.ok) {
        return {
          ok: true,
          requestId: attempt.requestId,
          attemptCount: 1,
          reconciled: false,
          data: attempt.data,
        };
      }

      return {
        ok: false,
        requestId: attempt.requestId,
        attemptCount: 1,
        errorCode: attempt.errorCode,
        message: attempt.message,
        statusCode: attempt.statusCode,
        retryable: attempt.retryable,
        finalStatus: 'failed',
      };
    });

    revisionMocks.getConfig.mockReset().mockResolvedValue({ id: 'config' });
    versionMocks.get.mockReset().mockResolvedValue({ version: 3 });
    versionMocks.getConfig.mockReset().mockResolvedValue({ id: 'config' });

    engineMocks.execute.mockReset().mockReturnValue({
      output: { Amount: 1 },
      diagnostics: [],
      stats: { rulesEvaluated: 1, rulesSucceeded: 1, rulesFailed: 0, durationMs: 1 },
    });
  });

  it('deploy handler allows revision deploy to DEV', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 });
    const { handler } = await importDeployHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(201);
    expect(orchestrationPersistenceMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingId: 'map-1',
        operationType: 'deploy',
        targetEnvironment: 'DEV',
        artifactId: 'artifact-1',
      }),
    );
    expect(orchestrationPersistenceMocks.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ orchestrationId: 'orc-1', status: 'succeeded', attemptCount: 1 }),
    );
    expect(deploymentPersistenceMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 }),
    );
  });

  it('deploy handler rejects revision deploy to PREPROD', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'PREPROD', sourceType: 'revision', sourceNumber: 2 });
    const { handler } = await importDeployHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('REVISION_NOT_DEPLOYABLE_TO_ENV');
  });

  it('deploy handler rejects legacy QA as mutation environment input', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'QA', sourceType: 'version', sourceNumber: 2 });
    const { handler } = await importDeployHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('deploy handler allows version deploy to PROD', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'PROD', sourceType: 'version', sourceNumber: 3 });
    const { handler } = await importDeployHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(201);
    expect(deploymentPersistenceMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'PROD', sourceType: 'version', sourceNumber: 3 }),
    );
    expect(runtimeRelayMocks.relayClient.pushArtifact).toHaveBeenCalledWith(
      'PROD',
      expect.objectContaining({ artifactId: 'artifact-1', snapshotId: 'artifact-1' }),
      expect.objectContaining({ operation: 'deploy', orchestrationId: 'orc-1', requestId: 'req-123' }),
    );
    expect(retryMocks.executeRuntimeOperationWithRetry).toHaveBeenCalled();
  });

  it('deploy handler replays idempotent request when prior orchestration already succeeded', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 });

    orchestrationPersistenceMocks.create.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });
    orchestrationPersistenceMocks.get.mockResolvedValueOnce({
      orchestrationId: 'deploy:map-1:DEV:revision:2:dup-key',
      mappingId: 'map-1',
      operationType: 'deploy',
      targetEnvironment: 'DEV',
      artifactId: 'artifact-1',
      status: 'succeeded',
      attemptCount: 1,
      requestId: 'req-existing',
      requestedBy: 'system',
      requestedAt: '2026-06-25T00:00:00.000Z',
      completedAt: '2026-06-25T00:00:01.000Z',
    });
    deploymentPersistenceMocks.listHistory.mockResolvedValueOnce([
      {
        mappingId: 'map-1',
        environment: 'DEV',
        environmentDeployedAt: 'DEV#2026-06-25T00:00:01.000Z',
        sourceType: 'revision',
        sourceNumber: 2,
        artifactId: 'artifact-1',
        artifactHash: 'abc',
        configS3Key: 'deployments/map-1/DEV/2026-06-25T00:00:01.000Z.json',
        configHash: 'abc',
        deployedAt: '2026-06-25T00:00:01.000Z',
        deployedBy: 'system',
      },
    ]);

    const { handler } = await importDeployHandler();
    const result = await handler({
      body: '{}',
      pathParameters: { mappingId: 'map-1' },
      headers: { 'x-idempotency-key': 'dup-key' },
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.replayed).toBe(true);
    expect(body.orchestrationId).toBe('deploy:map-1:DEV:revision:2:dup-key');
    expect(runtimeRelayMocks.relayClient.pushArtifact).not.toHaveBeenCalled();
    expect(deploymentPersistenceMocks.create).not.toHaveBeenCalled();
  });

  it('deploy handler replays idempotent request while prior orchestration is in progress', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 });

    orchestrationPersistenceMocks.create.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });
    orchestrationPersistenceMocks.get.mockResolvedValueOnce({
      orchestrationId: 'deploy:map-1:DEV:revision:2:dup-key',
      mappingId: 'map-1',
      operationType: 'deploy',
      targetEnvironment: 'DEV',
      artifactId: 'artifact-1',
      status: 'in_progress',
      attemptCount: 1,
      requestId: 'req-existing',
      requestedBy: 'system',
      requestedAt: '2026-06-25T00:00:00.000Z',
    });

    const { handler } = await importDeployHandler();
    const result = await handler({
      body: '{}',
      pathParameters: { mappingId: 'map-1' },
      headers: { 'x-idempotency-key': 'dup-key' },
    });

    expect(result.statusCode).toBe(202);
    const body = JSON.parse(result.body);
    expect(body).toEqual({
      orchestrationId: 'deploy:map-1:DEV:revision:2:dup-key',
      status: 'in_progress',
      replayed: true,
    });
    expect(runtimeRelayMocks.relayClient.pushArtifact).not.toHaveBeenCalled();
    expect(deploymentPersistenceMocks.create).not.toHaveBeenCalled();
  });

  it('deploy handler builds deterministic artifact independent of invocation time', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 });
    const { handler } = await importDeployHandler();

    await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });
    const firstArtifact = runtimeRelayMocks.relayClient.pushArtifact.mock.calls[0]?.[1];

    runtimeRelayMocks.relayClient.pushArtifact.mockClear();
    await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });
    const secondArtifact = runtimeRelayMocks.relayClient.pushArtifact.mock.calls[0]?.[1];

    expect(firstArtifact).toEqual(secondArtifact);
  });

  it('deploy handler rejects oversize runtime artifact payload', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 });
    runtimeRelayMocks.assertArtifactPayloadWithinLimit.mockReturnValueOnce({
      ok: false,
      payloadBytes: 4096,
      limitBytes: 1024,
    });

    const { handler } = await importDeployHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(413);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(body.error.message).toContain('5MB MVP limit');
    expect(body.error.details).toEqual({
      orchestrationId: 'orc-1',
      artifactId: 'artifact-1',
      snapshotId: 'artifact-1',
      payloadBytes: 4096,
      limitBytes: 1024,
    });
    expect(orchestrationPersistenceMocks.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        orchestrationId: 'orc-1',
        status: 'failed',
        lastErrorCode: 'PAYLOAD_TOO_LARGE',
      }),
    );
    expect(deploymentPersistenceMocks.create).not.toHaveBeenCalled();
  });

  it('deploy handler surfaces runtime relay failure without creating deployment', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 });
    retryMocks.executeRuntimeOperationWithRetry.mockResolvedValueOnce({
      ok: false,
      requestId: 'runtime-req-fail',
      attemptCount: 3,
      errorCode: 'SERVICE_UNAVAILABLE',
      message: 'Runtime endpoint unavailable',
      statusCode: 503,
      retryable: true,
      finalStatus: 'failed',
    });

    const { handler } = await importDeployHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(503);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.error.retryable).toBe(true);
    expect(body.error.details).toEqual({
      orchestrationId: 'orc-1',
      environment: 'DEV',
      artifactId: 'artifact-1',
      snapshotId: 'artifact-1',
      attemptCount: 3,
      finalStatus: 'failed',
    });
    expect(deploymentPersistenceMocks.create).not.toHaveBeenCalled();
  });

  it('deploy handler surfaces timeout reconciliation terminal status metadata', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 });
    retryMocks.executeRuntimeOperationWithRetry.mockResolvedValueOnce({
      ok: false,
      requestId: 'runtime-timeout-req-1',
      attemptCount: 3,
      errorCode: 'TIMEOUT',
      message: 'Runtime operation timed out after max attempts.',
      statusCode: 504,
      retryable: true,
      finalStatus: 'timed_out',
    });

    const { handler } = await importDeployHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(504);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('TIMEOUT');
    expect(body.error.details).toEqual({
      orchestrationId: 'orc-1',
      environment: 'DEV',
      artifactId: 'artifact-1',
      snapshotId: 'artifact-1',
      attemptCount: 3,
      finalStatus: 'timed_out',
    });
    expect(deploymentPersistenceMocks.create).not.toHaveBeenCalled();
  });

  it('deploy handler returns snapshot integrity error when persistence detects artifact hash mismatch', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 });
    deploymentPersistenceMocks.create.mockRejectedValueOnce(
      Object.assign(new Error('hash mismatch'), { name: 'DeploymentArtifactIntegrityError' }),
    );

    const { handler } = await importDeployHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('SNAPSHOT_INTEGRITY_ERROR');
    expect(body.error.retryable).toBe(false);
  });

  it('deploy handler does not treat legacy uploaded aliases as CDM schemas', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 });
    sharedMocks.getItem
      .mockResolvedValueOnce({ mappingId: 'map-1', sourceSchemaId: 'schema-source' })
      .mockResolvedValueOnce({
        schemaId: 'schema-source',
        name: 'Legacy Uploaded Alias',
        origin: 'local',
        status: 'ready',
        syncStatus: 'synced',
        source: {
          type: 'upload',
        },
      });

    const { handler } = await importDeployHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(201);
    expect(deploymentPersistenceMocks.create).toHaveBeenCalled();
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
    sharedMocks.parseBody.mockReturnValue({ fromEnvironment: 'DEV', toEnvironment: 'PREPROD' });
    deploymentPersistenceMocks.getCurrent.mockResolvedValueOnce({ sourceType: 'revision', sourceNumber: 2 });
    const { handler } = await importPromoteHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('PROMOTION_REQUIRES_VERSION');
  });

  it('promote handler rejects legacy QA as mutation environment input', async () => {
    sharedMocks.parseBody.mockReturnValue({ fromEnvironment: 'DEV', toEnvironment: 'QA' });
    const { handler } = await importPromoteHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('promote handler rejects non-sequential promotion paths', async () => {
    sharedMocks.parseBody.mockReturnValue({ fromEnvironment: 'DEV', toEnvironment: 'PROD' });
    const { handler } = await importPromoteHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('promote handler creates deployment when source is version-backed', async () => {
    sharedMocks.parseBody.mockReturnValue({ fromEnvironment: 'DEV', toEnvironment: 'PREPROD' });
    deploymentPersistenceMocks.getCurrent.mockResolvedValueOnce({
      sourceType: 'version',
      sourceNumber: 3,
      artifactId: 'artifact-source',
      artifactHash: 'hash-source',
    });
    const { handler } = await importPromoteHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(201);
    expect(deploymentPersistenceMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'PREPROD',
        sourceType: 'version',
        sourceNumber: 3,
        artifactId: 'artifact-source',
        artifactHash: 'hash-source',
        promotedFrom: 'DEV',
      }),
    );
    expect(runtimeRelayMocks.relayClient.pushArtifact).toHaveBeenCalledWith(
      'PREPROD',
      expect.objectContaining({ artifactId: 'artifact-source', snapshotId: 'artifact-source', artifactHash: 'hash-source' }),
      expect.objectContaining({
        operation: 'promote',
        promotedFrom: 'DEV',
        orchestrationId: 'orc-1',
      }),
    );
    expect(retryMocks.executeRuntimeOperationWithRetry).toHaveBeenCalled();
  });

  it('promote handler replays idempotent request when prior orchestration already succeeded', async () => {
    sharedMocks.parseBody.mockReturnValue({ fromEnvironment: 'DEV', toEnvironment: 'PREPROD' });
    deploymentPersistenceMocks.getCurrent.mockResolvedValueOnce({
      sourceType: 'version',
      sourceNumber: 3,
      artifactId: 'artifact-source',
      artifactHash: 'hash-source',
    });
    orchestrationPersistenceMocks.create.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });
    orchestrationPersistenceMocks.get.mockResolvedValueOnce({
      orchestrationId: 'promote:map-1:DEV:PREPROD:dup-promote',
      mappingId: 'map-1',
      operationType: 'promote',
      targetEnvironment: 'PREPROD',
      sourceEnvironment: 'DEV',
      artifactId: 'artifact-source',
      status: 'succeeded',
      attemptCount: 1,
      requestId: 'req-existing-promote',
      requestedBy: 'system',
      requestedAt: '2026-06-25T00:00:00.000Z',
      completedAt: '2026-06-25T00:00:01.000Z',
    });
    deploymentPersistenceMocks.listHistory.mockResolvedValueOnce([
      {
        mappingId: 'map-1',
        environment: 'PREPROD',
        environmentDeployedAt: 'PREPROD#2026-06-25T00:00:01.000Z',
        sourceType: 'version',
        sourceNumber: 3,
        artifactId: 'artifact-source',
        artifactHash: 'hash-source',
        configS3Key: 'deployments/map-1/PREPROD/2026-06-25T00:00:01.000Z.json',
        configHash: 'hash-source',
        deployedAt: '2026-06-25T00:00:01.000Z',
        deployedBy: 'system',
        promotedFrom: 'DEV',
      },
    ]);

    const { handler } = await importPromoteHandler();
    const result = await handler({
      body: '{}',
      pathParameters: { mappingId: 'map-1' },
      headers: { 'x-idempotency-key': 'dup-promote' },
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.replayed).toBe(true);
    expect(body.orchestrationId).toBe('promote:map-1:DEV:PREPROD:dup-promote');
    expect(runtimeRelayMocks.relayClient.pushArtifact).not.toHaveBeenCalled();
    expect(deploymentPersistenceMocks.create).not.toHaveBeenCalled();
  });

  it('promote handler rejects oversize runtime artifact payload', async () => {
    sharedMocks.parseBody.mockReturnValue({ fromEnvironment: 'DEV', toEnvironment: 'PREPROD' });
    deploymentPersistenceMocks.getCurrent.mockResolvedValueOnce({
      sourceType: 'version',
      sourceNumber: 3,
      artifactId: 'artifact-source',
      artifactHash: 'hash-source',
    });
    runtimeRelayMocks.assertArtifactPayloadWithinLimit.mockReturnValueOnce({
      ok: false,
      payloadBytes: 8192,
      limitBytes: 1024,
    });

    const { handler } = await importPromoteHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(413);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(body.error.details).toEqual({
      orchestrationId: 'orc-1',
      artifactId: 'artifact-source',
      snapshotId: 'artifact-source',
      payloadBytes: 8192,
      limitBytes: 1024,
    });
    expect(runtimeRelayMocks.relayClient.pushArtifact).not.toHaveBeenCalled();
    expect(deploymentPersistenceMocks.create).not.toHaveBeenCalled();
  });

  it('promote handler surfaces runtime relay failure without creating deployment', async () => {
    sharedMocks.parseBody.mockReturnValue({ fromEnvironment: 'DEV', toEnvironment: 'PREPROD' });
    deploymentPersistenceMocks.getCurrent.mockResolvedValueOnce({
      sourceType: 'version',
      sourceNumber: 3,
      artifactId: 'artifact-source',
      artifactHash: 'hash-source',
    });
    retryMocks.executeRuntimeOperationWithRetry.mockResolvedValueOnce({
      ok: false,
      requestId: 'runtime-req-fail-promote',
      attemptCount: 2,
      errorCode: 'SERVICE_UNAVAILABLE',
      message: 'Runtime endpoint unavailable',
      statusCode: 503,
      retryable: true,
      finalStatus: 'failed',
    });

    const { handler } = await importPromoteHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(503);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.error.details).toEqual({
      orchestrationId: 'orc-1',
      environment: 'PREPROD',
      artifactId: 'artifact-source',
      snapshotId: 'artifact-source',
      promotedFrom: 'DEV',
      attemptCount: 2,
      finalStatus: 'failed',
    });
    expect(deploymentPersistenceMocks.create).not.toHaveBeenCalled();
  });

  it('promote handler returns snapshot integrity error when persistence detects artifact hash mismatch', async () => {
    sharedMocks.parseBody.mockReturnValue({ fromEnvironment: 'DEV', toEnvironment: 'PREPROD' });
    deploymentPersistenceMocks.getCurrent.mockResolvedValueOnce({ sourceType: 'version', sourceNumber: 3 });
    deploymentPersistenceMocks.create.mockRejectedValueOnce(
      Object.assign(new Error('hash mismatch'), { name: 'DeploymentArtifactIntegrityError' }),
    );

    const { handler } = await importPromoteHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('SNAPSHOT_INTEGRITY_ERROR');
    expect(body.error.retryable).toBe(false);
  });

  it('promote handler includes cdmSchemaTraceability when referenced CDM schemas are deployable', async () => {
    sharedMocks.parseBody.mockReturnValue({ fromEnvironment: 'DEV', toEnvironment: 'PREPROD' });
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
    sharedMocks.parseBody.mockReturnValue({ fromEnvironment: 'DEV', toEnvironment: 'PREPROD' });
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
        artifactId: 'artifact-2',
        artifactHash: 'hash-2',
        configHash: 'cfg-2',
        configS3Key: 'deployments/map-1/PROD/artifact-2.json',
      },
    ]);
    const { handler } = await importRollbackHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(201);
    expect(orchestrationPersistenceMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingId: 'map-1',
        operationType: 'rollback',
        targetEnvironment: 'PROD',
        artifactId: 'artifact-2',
      }),
    );
    expect(runtimeApiClientMocks.client.rollback).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingId: 'map-1',
        environment: 'PROD',
        targetArtifactId: 'artifact-2',
        orchestrationId: 'orc-1',
        requestId: 'req-123',
      }),
    );
    expect(orchestrationPersistenceMocks.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ orchestrationId: 'orc-1', status: 'succeeded', attemptCount: 1 }),
    );
    expect(deploymentPersistenceMocks.createRollback).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'PROD',
        sourceType: 'version',
        sourceNumber: 2,
        artifactId: 'artifact-2',
        artifactHash: 'hash-2',
        configHash: 'cfg-2',
        configS3Key: 'deployments/map-1/PROD/artifact-2.json',
        rollbackOf: 'PROD#2026-06-01T00:00:00.000Z',
      }),
    );
  });

  it('rollback handler rejects legacy QA as mutation environment input', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'QA', deploymentSK: 'QA#2026-06-01T00:00:00.000Z' });

    const { handler } = await importRollbackHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('rollback handler replays idempotent request when prior orchestration already succeeded', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'PROD', deploymentSK: 'PROD#2026-06-01T00:00:00.000Z' });
    deploymentPersistenceMocks.listHistory.mockResolvedValueOnce([
      {
        environmentDeployedAt: 'PROD#2026-06-01T00:00:00.000Z',
        sourceType: 'version',
        sourceNumber: 2,
        artifactId: 'artifact-2',
        artifactHash: 'hash-2',
        configHash: 'cfg-2',
        configS3Key: 'deployments/map-1/PROD/artifact-2.json',
      },
    ]);
    orchestrationPersistenceMocks.create.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });
    orchestrationPersistenceMocks.get.mockResolvedValueOnce({
      orchestrationId: 'rollback:map-1:PROD:PROD#2026-06-01T00:00:00.000Z:dup-rollback',
      mappingId: 'map-1',
      operationType: 'rollback',
      targetEnvironment: 'PROD',
      artifactId: 'artifact-2',
      status: 'succeeded',
      attemptCount: 1,
      requestId: 'req-existing-rollback',
      requestedBy: 'system',
      requestedAt: '2026-06-25T00:00:00.000Z',
      completedAt: '2026-06-25T00:00:01.000Z',
    });
    deploymentPersistenceMocks.listHistory.mockResolvedValueOnce([
      {
        mappingId: 'map-1',
        environment: 'PROD',
        environmentDeployedAt: 'PROD#2026-06-25T00:00:01.000Z',
        sourceType: 'version',
        sourceNumber: 2,
        artifactId: 'artifact-2',
        artifactHash: 'hash-2',
        configS3Key: 'deployments/map-1/PROD/artifact-2.json',
        configHash: 'cfg-2',
        deployedAt: '2026-06-25T00:00:01.000Z',
        deployedBy: 'system',
        rollbackOf: 'PROD#2026-06-01T00:00:00.000Z',
      },
    ]);

    const { handler } = await importRollbackHandler();
    const result = await handler({
      body: '{}',
      pathParameters: { mappingId: 'map-1' },
      headers: { 'x-idempotency-key': 'dup-rollback' },
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.replayed).toBe(true);
    expect(body.orchestrationId).toBe('rollback:map-1:PROD:PROD#2026-06-01T00:00:00.000Z:dup-rollback');
    expect(runtimeApiClientMocks.client.rollback).not.toHaveBeenCalled();
    expect(deploymentPersistenceMocks.createRollback).not.toHaveBeenCalled();
  });

  it('rollback handler returns ARTIFACT_NOT_PRESENT when artifact metadata is missing', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'PROD', deploymentSK: 'PROD#2026-06-01T00:00:00.000Z' });
    deploymentPersistenceMocks.listHistory.mockResolvedValueOnce([
      {
        environmentDeployedAt: 'PROD#2026-06-01T00:00:00.000Z',
        sourceType: 'version',
        sourceNumber: 2,
        configHash: 'cfg-2',
        configS3Key: 'deployments/map-1/PROD/artifact-2.json',
      },
    ]);

    const { handler } = await importRollbackHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('ARTIFACT_NOT_PRESENT');
    expect(body.error.message).toContain('ARTIFACT_NOT_PRESENT');
    expect(body.error.details).toEqual({
      reason: 'ARTIFACT_NOT_PRESENT',
      environment: 'PROD',
      deploymentSK: 'PROD#2026-06-01T00:00:00.000Z',
      remediation: 'deploy-or-promote-artifact-then-retry-rollback',
    });
    expect(deploymentPersistenceMocks.createRollback).not.toHaveBeenCalled();
    expect(runtimeApiClientMocks.client.rollback).not.toHaveBeenCalled();
  });

  it('rollback handler surfaces runtime rollback failure and preserves current state', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'PROD', deploymentSK: 'PROD#2026-06-01T00:00:00.000Z' });
    deploymentPersistenceMocks.listHistory.mockResolvedValueOnce([
      {
        environmentDeployedAt: 'PROD#2026-06-01T00:00:00.000Z',
        sourceType: 'version',
        sourceNumber: 2,
        artifactId: 'artifact-2',
        artifactHash: 'hash-2',
        configHash: 'cfg-2',
        configS3Key: 'deployments/map-1/PROD/artifact-2.json',
      },
    ]);
    retryMocks.executeRuntimeOperationWithRetry.mockResolvedValueOnce({
      ok: false,
      requestId: 'runtime-rollback-fail-1',
      attemptCount: 1,
      errorCode: 'ARTIFACT_NOT_PRESENT',
      message: 'Rollback target artifact missing in runtime local storage',
      statusCode: 409,
      retryable: false,
      finalStatus: 'failed',
    });

    const { handler } = await importRollbackHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('ARTIFACT_NOT_PRESENT');
    expect(body.error.details).toEqual({
      orchestrationId: 'orc-1',
      environment: 'PROD',
      targetArtifactId: 'artifact-2',
      deploymentSK: 'PROD#2026-06-01T00:00:00.000Z',
      attemptCount: 1,
      finalStatus: 'failed',
    });
    expect(deploymentPersistenceMocks.createRollback).not.toHaveBeenCalled();
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
    deploymentPersistenceMocks.getCurrentAll.mockResolvedValueOnce({ DEV: { sourceType: 'version' }, PREPROD: null, PROD: null });
    const { handler } = await importCurrentHandler();

    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ DEV: { sourceType: 'version' }, PREPROD: null, PROD: null });
  });

  it('deployment-context handler returns aggregate payload with stale/deployed/not-deployed status', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        mappingId: 'map-1',
        projectId: 'proj-1',
        name: 'Orders Mapping',
        version: 5,
      })
      .mockResolvedValueOnce({
        projectId: 'proj-1',
        name: 'Orders Project',
      });

    deploymentPersistenceMocks.getCurrentAll.mockResolvedValueOnce({
      DEV: {
        sourceType: 'version',
        sourceNumber: 3,
        deployedAt: '2026-06-01T00:00:00.000Z',
      },
      PREPROD: {
        sourceType: 'revision',
        sourceNumber: 12,
        deployedAt: '2026-06-02T00:00:00.000Z',
      },
      PROD: null,
    });

    const { handler } = await importDeploymentContextHandler();
    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      mappingId: 'map-1',
      mappingName: 'Orders Mapping',
      projectId: 'proj-1',
      projectName: 'Orders Project',
      environments: [
        {
          environment: 'DEV',
          status: 'stale',
          deployedVersion: 3,
          deployedAt: '2026-06-01T00:00:00.000Z',
        },
        {
          environment: 'PREPROD',
          status: 'deployed',
          deployedAt: '2026-06-02T00:00:00.000Z',
        },
        {
          environment: 'PROD',
          status: 'not-deployed',
        },
      ],
    });
  });

  it('deployment-context handler falls back to projectId when project lookup misses', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        mappingId: 'map-1',
        projectId: 'proj-1',
        name: 'Orders Mapping',
        version: 2,
      })
      .mockResolvedValueOnce(null);

    deploymentPersistenceMocks.getCurrentAll.mockResolvedValueOnce({ DEV: null, PREPROD: null, PROD: null });

    const { handler } = await importDeploymentContextHandler();
    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).projectName).toBe('proj-1');
  });

  it('deployment-context handler returns 404 when mapping is missing', async () => {
    sharedMocks.getItem.mockResolvedValueOnce(null);

    const { handler } = await importDeploymentContextHandler();
    const result = await handler({ body: null, pathParameters: { mappingId: 'map-missing' } });

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error.message).toContain("map-missing");
    expect(result.headers).toMatchObject({
      'Access-Control-Allow-Origin': '*',
    });
    expect(JSON.parse(result.body).error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('deployment-context handler returns CORS + normalized error envelope on internal failure', async () => {
    sharedMocks.getItem.mockRejectedValueOnce(new Error('dynamo exploded'));

    const { handler } = await importDeploymentContextHandler();
    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(500);
    expect(result.headers).toMatchObject({
      'Access-Control-Allow-Origin': '*',
    });
    const parsed = JSON.parse(result.body);
    expect(parsed.error.code).toBe('INTERNAL_ERROR');
    expect(parsed.error.statusCode).toBe(500);
  });

  it('list handler normalizes legacy QA query to PREPROD', async () => {
    sharedMocks.parseQueryParam.mockReturnValueOnce('QA');
    deploymentPersistenceMocks.listHistory.mockResolvedValueOnce([{ environment: 'PREPROD' }]);
    const { handler } = await importListHandler();

    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1' }, queryStringParameters: { environment: 'QA' } });

    expect(result.statusCode).toBe(200);
    expect(deploymentPersistenceMocks.listHistory).toHaveBeenCalledWith('map-1', 'PREPROD');
  });

  it('list handler rejects SANDBOX query as non-runtime environment', async () => {
    sharedMocks.parseQueryParam.mockReturnValueOnce('SANDBOX');
    const { handler } = await importListHandler();

    const result = await handler({ body: null, pathParameters: { mappingId: 'map-1' }, queryStringParameters: { environment: 'SANDBOX' } });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('runtime deploy handler writes snapshot, pointer, and history', async () => {
    sharedMocks.parseBody.mockReturnValue({
      mappingId: 'map-1',
      snapshotId: 'snapshot-1',
      snapshotHash: 'abc',
      sourceType: 'version',
      sourceNumber: 3,
      snapshotPayload: { config: { id: 'config' } },
    });

    const s3Module = await import('../../../src/lib/persistence/s3/deployment-snapshot.js');
    const putRuntimeSnapshotSpy = vi.spyOn(s3Module, 'putRuntimeSnapshot').mockResolvedValueOnce({
      key: 'runtime/snapshots/map-1/snapshot-1.json',
      status: 'created',
    });
    const verifyRuntimeSnapshotReadHashSpy = vi.spyOn(s3Module, 'verifyRuntimeSnapshotReadHash').mockResolvedValueOnce({
      key: 'runtime/snapshots/map-1/snapshot-1.json',
      body: '{}',
      payload: { mappingConfig: { id: 'config' } },
    });

    const { handler } = await importRuntimeDeployHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(201);
    expect(putRuntimeSnapshotSpy).toHaveBeenCalledWith(
      expect.objectContaining({ mappingId: 'map-1', snapshotId: 'snapshot-1', contentHash: 'abc' }),
    );
    expect(deploymentPersistenceMocks.upsertActiveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ mappingId: 'map-1', activeSnapshotId: 'snapshot-1', snapshotHash: 'abc' }),
    );
    expect(deploymentPersistenceMocks.appendDeploymentHistory).toHaveBeenCalledWith(
      expect.objectContaining({ mappingId: 'map-1', eventType: 'deploy', snapshotId: 'snapshot-1' }),
    );

    expect(verifyRuntimeSnapshotReadHashSpy).toHaveBeenCalledWith(
      expect.objectContaining({ mappingId: 'map-1', snapshotId: 'snapshot-1', expectedContentHash: 'abc' }),
    );

    const appendOrder = deploymentPersistenceMocks.appendDeploymentHistory.mock.invocationCallOrder[0];
    const pointerOrder = deploymentPersistenceMocks.upsertActiveSnapshot.mock.invocationCallOrder[0];
    expect(appendOrder).toBeDefined();
    expect(pointerOrder).toBeDefined();
    expect(appendOrder ?? 0).toBeLessThan(pointerOrder ?? 0);

    putRuntimeSnapshotSpy.mockRestore();
    verifyRuntimeSnapshotReadHashSpy.mockRestore();
  });

  it('runtime deploy handler accepts wrapped artifact payload from control-plane relay', async () => {
    sharedMocks.parseBody.mockReturnValue({
      mappingId: 'map-1',
      environment: 'DEV',
      operation: 'deploy',
      artifact: {
        mappingId: 'map-1',
        artifactId: 'snapshot-1',
        artifactHash: 'abc',
        sourceType: 'version',
        sourceNumber: 3,
        mappingConfig: { id: 'config' },
      },
      controlPlaneMetadata: {
        triggeredBy: 'system',
      },
    });

    const s3Module = await import('../../../src/lib/persistence/s3/deployment-snapshot.js');
    const putRuntimeSnapshotSpy = vi.spyOn(s3Module, 'putRuntimeSnapshot').mockResolvedValueOnce({
      key: 'runtime/snapshots/map-1/snapshot-1.json',
      status: 'created',
    });
    const verifyRuntimeSnapshotReadHashSpy = vi.spyOn(s3Module, 'verifyRuntimeSnapshotReadHash').mockResolvedValueOnce({
      key: 'runtime/snapshots/map-1/snapshot-1.json',
      body: '{}',
      payload: { mappingConfig: { id: 'config' } },
    });

    const { handler } = await importRuntimeDeployHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(201);
    expect(putRuntimeSnapshotSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingId: 'map-1',
        snapshotId: 'snapshot-1',
        contentHash: 'abc',
      }),
    );
    expect(deploymentPersistenceMocks.upsertActiveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingId: 'map-1',
        activeSnapshotId: 'snapshot-1',
        snapshotHash: 'abc',
        activatedBy: 'system',
      }),
    );

    putRuntimeSnapshotSpy.mockRestore();
    verifyRuntimeSnapshotReadHashSpy.mockRestore();
  });

  it('runtime deploy handler rejects snapshot hash mismatch', async () => {
    sharedMocks.parseBody.mockReturnValue({
      mappingId: 'map-1',
      snapshotId: 'snapshot-1',
      snapshotHash: 'abc',
      sourceType: 'version',
      sourceNumber: 3,
    });

    const s3Module = await import('../../../src/lib/persistence/s3/deployment-snapshot.js');
    const mismatchError = new s3Module.RuntimeSnapshotHashMismatchError('hash mismatch');
    const putRuntimeSnapshotSpy = vi.spyOn(s3Module, 'putRuntimeSnapshot').mockRejectedValueOnce(mismatchError);

    const { handler } = await importRuntimeDeployHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).error.code).toBe('SNAPSHOT_INTEGRITY_ERROR');
    expect(deploymentPersistenceMocks.upsertActiveSnapshot).not.toHaveBeenCalled();
    expect(deploymentPersistenceMocks.appendDeploymentHistory).not.toHaveBeenCalled();

    putRuntimeSnapshotSpy.mockRestore();
  });

  it('runtime deploy handler never activates pointer when snapshot read verification fails', async () => {
    sharedMocks.parseBody.mockReturnValue({
      mappingId: 'map-1',
      snapshotId: 'snapshot-1',
      snapshotHash: 'abc',
      sourceType: 'version',
      sourceNumber: 3,
    });

    const s3Module = await import('../../../src/lib/persistence/s3/deployment-snapshot.js');
    const putRuntimeSnapshotSpy = vi.spyOn(s3Module, 'putRuntimeSnapshot').mockResolvedValueOnce({
      key: 'runtime/snapshots/map-1/snapshot-1.json',
      status: 'created',
    });
    const verifyRuntimeSnapshotReadHashSpy = vi
      .spyOn(s3Module, 'verifyRuntimeSnapshotReadHash')
      .mockRejectedValueOnce(new s3Module.RuntimeSnapshotUnreadableError('snapshot unreadable'));

    const { handler } = await importRuntimeDeployHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error.code).toBe('SNAPSHOT_INTEGRITY_ERROR');
    expect(deploymentPersistenceMocks.appendDeploymentHistory).not.toHaveBeenCalled();
    expect(deploymentPersistenceMocks.upsertActiveSnapshot).not.toHaveBeenCalled();

    putRuntimeSnapshotSpy.mockRestore();
    verifyRuntimeSnapshotReadHashSpy.mockRestore();
  });

  it('runtime deploy handler returns conflict when active pointer conditional update fails', async () => {
    sharedMocks.parseBody.mockReturnValue({
      mappingId: 'map-1',
      snapshotId: 'snapshot-1',
      snapshotHash: 'abc',
      sourceType: 'version',
      sourceNumber: 3,
    });

    const s3Module = await import('../../../src/lib/persistence/s3/deployment-snapshot.js');
    const putRuntimeSnapshotSpy = vi.spyOn(s3Module, 'putRuntimeSnapshot').mockResolvedValueOnce({
      key: 'runtime/snapshots/map-1/snapshot-1.json',
      status: 'created',
    });
    const verifyRuntimeSnapshotReadHashSpy = vi.spyOn(s3Module, 'verifyRuntimeSnapshotReadHash').mockResolvedValueOnce({
      key: 'runtime/snapshots/map-1/snapshot-1.json',
      body: '{}',
      payload: { mappingConfig: { id: 'config' } },
    });

    deploymentPersistenceMocks.upsertActiveSnapshot.mockRejectedValueOnce(
      new deploymentPersistenceMocks.ActiveSnapshotConflictError('active snapshot changed'),
    );

    const { handler } = await importRuntimeDeployHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).error.code).toBe('CONFLICT');

    putRuntimeSnapshotSpy.mockRestore();
    verifyRuntimeSnapshotReadHashSpy.mockRestore();
  });

  it('runtime deploy handler logs structured error details on unexpected failure', async () => {
    sharedMocks.parseBody.mockReturnValue({
      mappingId: 'map-1',
      snapshotId: 'snapshot-1',
      snapshotHash: 'abc',
      sourceType: 'version',
      sourceNumber: 3,
    });

    const s3Module = await import('../../../src/lib/persistence/s3/deployment-snapshot.js');
    const putRuntimeSnapshotSpy = vi.spyOn(s3Module, 'putRuntimeSnapshot').mockResolvedValueOnce({
      key: 'runtime/snapshots/map-1/snapshot-1.json',
      status: 'created',
    });
    const verifyRuntimeSnapshotReadHashSpy = vi.spyOn(s3Module, 'verifyRuntimeSnapshotReadHash').mockResolvedValueOnce({
      key: 'runtime/snapshots/map-1/snapshot-1.json',
      body: '{}',
      payload: { mappingConfig: { id: 'config' } },
    });
    deploymentPersistenceMocks.appendDeploymentHistory.mockRejectedValueOnce(new Error('history write failed'));

    const consoleErrorSpy = vi.spyOn(console, 'error');
    const { handler } = await importRuntimeDeployHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error.code).toBe('INTERNAL_ERROR');
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('"eventType":"deploy-error"'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('"phase":"handle-deploy"'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('"message":"history write failed"'));

    putRuntimeSnapshotSpy.mockRestore();
    verifyRuntimeSnapshotReadHashSpy.mockRestore();
  });

  it('runtime rollback handler repoints pointer and appends rollback event', async () => {
    sharedMocks.parseBody.mockReturnValue({
      mappingId: 'map-1',
      snapshotId: 'snapshot-1',
    });

    deploymentPersistenceMocks.listDeploymentHistory.mockResolvedValueOnce([
      {
        mappingId: 'map-1',
        eventAt: '2026-06-04T00:00:00.000Z',
        eventType: 'deploy',
        snapshotId: 'snapshot-1',
        snapshotHash: 'abc',
        requestedBy: 'control-plane',
        sourceType: 'version',
        sourceNumber: 3,
        requestId: 'req-x',
      },
    ]);

    const { handler } = await importRuntimeRollbackHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(201);
    expect(deploymentPersistenceMocks.upsertActiveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ mappingId: 'map-1', activeSnapshotId: 'snapshot-1' }),
    );
    expect(deploymentPersistenceMocks.appendDeploymentHistory).toHaveBeenCalledWith(
      expect.objectContaining({ mappingId: 'map-1', eventType: 'rollback', rollbackOf: '2026-06-04T00:00:00.000Z' }),
    );
  });

  it('runtime rollback handler returns deterministic not found when snapshot absent', async () => {
    sharedMocks.parseBody.mockReturnValue({
      mappingId: 'map-1',
      snapshotId: 'snapshot-missing',
    });

    deploymentPersistenceMocks.listDeploymentHistory.mockResolvedValueOnce([]);

    const { handler } = await importRuntimeRollbackHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('SOURCE_NOT_FOUND');
    expect(deploymentPersistenceMocks.upsertActiveSnapshot).not.toHaveBeenCalled();
    expect(deploymentPersistenceMocks.appendDeploymentHistory).not.toHaveBeenCalled();
  });

  it('FS-100 AE-12: deterministic fixture deploy->execute->redeploy->rollback->promote flow preserves snapshot/output parity', async () => {
    const fixture = fs100Ae12RuntimeLifecycleFixture;

    let requestSeq = 0;
    let deploymentSeq = 0;
    const deploymentHistory: Array<Record<string, unknown>> = [];
    const deploymentCurrent: Record<'DEV' | 'PREPROD' | 'PROD', Record<string, unknown> | null> = {
      DEV: null,
      PREPROD: null,
      PROD: null,
    };
    const runtimeSnapshots = new Map<string, Record<string, unknown>>();
    const runtimeSnapshotMeta = new Map<string, { hash: string; sourceType: 'revision' | 'version'; sourceNumber: number }>();
    let runtimeActiveSnapshotId: string | null = null;

    sharedMocks.parseBody.mockImplementation((event: { body?: string | null }) => {
      if (!event?.body) {
        return null;
      }

      return JSON.parse(event.body);
    });
    sharedMocks.generateRequestId.mockImplementation(() => `req-${++requestSeq}`);
    sharedMocks.parsePathParam.mockImplementation((event, name: string) => event.pathParameters?.[name] ?? null);
    sharedMocks.getItem.mockImplementation(async (input: { Key?: Record<string, unknown> }) => {
      if (typeof input?.Key?.mappingId === 'string') {
        return {
          mappingId: fixture.mappingId,
          projectId: 'proj-fixture',
          name: 'Migrated Fixture Mapping',
          version: 2,
        };
      }

      if (typeof input?.Key?.projectId === 'string') {
        return {
          projectId: 'proj-fixture',
          name: 'FS-100 Fixture Project',
        };
      }

      return null;
    });
    sharedMocks.getObject.mockImplementation(async (input: { Key?: string }) => {
      const key = input.Key ?? '';
      const match = key.match(/^runtime\/snapshots\/[^/]+\/(.+)\.json$/);
      const snapshotId = match?.[1];
      if (!snapshotId) {
        throw new Error(`Unexpected snapshot key lookup: ${key}`);
      }

      const config = runtimeSnapshots.get(snapshotId);
      if (!config) {
        throw new Error(`Missing runtime snapshot config for ${snapshotId}`);
      }

      return JSON.stringify({ mappingConfig: config });
    });

    deploymentPersistenceMocks.create.mockImplementation(async (input: Record<string, unknown>) => {
      const deployedAt = `2026-06-25T00:00:0${++deploymentSeq}.000Z`;
      const environment = input.environment as 'DEV' | 'PREPROD' | 'PROD';
      const item = {
        mappingId: input.mappingId,
        environment,
        environmentDeployedAt: `${environment}#${deployedAt}`,
        sourceType: input.sourceType,
        sourceNumber: input.sourceNumber,
        artifactId: input.artifactId,
        artifactHash: input.artifactHash,
        configS3Key: `deployments/${String(input.mappingId)}/${environment}/${String(input.artifactId)}.json`,
        configHash: `cfg-${String(input.artifactId)}`,
        deployedAt,
        deployedBy: 'system',
        ...(input.promotedFrom ? { promotedFrom: input.promotedFrom } : {}),
      };
      deploymentHistory.push(item);
      deploymentCurrent[environment] = {
        sourceType: input.sourceType,
        sourceNumber: input.sourceNumber,
        artifactId: input.artifactId,
        artifactHash: input.artifactHash,
        deployedAt,
      };
      return item;
    });

    deploymentPersistenceMocks.createRollback.mockImplementation(async (input: Record<string, unknown>) => {
      const deployedAt = `2026-06-25T00:00:0${++deploymentSeq}.000Z`;
      const environment = input.environment as 'DEV' | 'PREPROD' | 'PROD';
      const item = {
        mappingId: input.mappingId,
        environment,
        environmentDeployedAt: `${environment}#${deployedAt}`,
        sourceType: input.sourceType,
        sourceNumber: input.sourceNumber,
        artifactId: input.artifactId,
        artifactHash: input.artifactHash,
        configS3Key: input.configS3Key,
        configHash: input.configHash,
        deployedAt,
        deployedBy: 'system',
        rollbackOf: input.rollbackOf,
      };
      deploymentHistory.push(item);
      deploymentCurrent[environment] = {
        sourceType: input.sourceType,
        sourceNumber: input.sourceNumber,
        artifactId: input.artifactId,
        artifactHash: input.artifactHash,
        deployedAt,
      };
      return item;
    });

    deploymentPersistenceMocks.getCurrent.mockImplementation(async (_mappingId: string, environment: 'DEV' | 'PREPROD' | 'PROD') => {
      const current = deploymentCurrent[environment];
      return (current as Record<string, unknown> | null) ?? null;
    });

    deploymentPersistenceMocks.listHistory.mockImplementation(async (_mappingId: string, environment?: 'DEV' | 'PREPROD' | 'PROD') => {
      const filtered = environment
        ? deploymentHistory.filter((item) => item.environment === environment)
        : [...deploymentHistory];
      return [...filtered].sort((a, b) => String(b.environmentDeployedAt).localeCompare(String(a.environmentDeployedAt)));
    });

    deploymentPersistenceMocks.getActiveSnapshot.mockImplementation(async () => {
      if (!runtimeActiveSnapshotId) {
        return null;
      }

      const meta = runtimeSnapshotMeta.get(runtimeActiveSnapshotId);
      return {
        mappingId: fixture.mappingId,
        activeSnapshotId: runtimeActiveSnapshotId,
        snapshotHash: meta?.hash ?? 'unknown-hash',
        activatedAt: '2026-06-25T00:00:00.000Z',
        activatedBy: 'control-plane',
        sourceType: meta?.sourceType ?? 'version',
        sourceNumber: meta?.sourceNumber ?? 1,
      };
    });

    versionMocks.get.mockImplementation(async (_mappingId: string, version: number) => ({ version }));
    versionMocks.getConfig.mockImplementation(async (_mappingId: string, version: number) => ({ ...fixture.versions[version as 1 | 2] }));

    runtimeRelayMocks.buildRuntimeDeployArtifact.mockImplementation(async (input: Record<string, unknown>) => {
      const sourceNumber = Number(input.sourceNumber);
      const artifactId = `snapshot-${String(input.mappingId)}-v${sourceNumber}`;
      const artifactHash = `hash-${String(input.mappingId)}-v${sourceNumber}`;
      return {
        artifactId,
        snapshotId: artifactId,
        artifactHash,
        mappingId: String(input.mappingId),
        sourceType: input.sourceType,
        sourceNumber,
        sourceConfigHash: `cfg-${sourceNumber}`,
        engineVersion: '2.0.0',
        mappingConfig: (input.config as Record<string, unknown>) ?? {},
      };
    });

    runtimeRelayMocks.assertArtifactPayloadWithinLimit.mockImplementation(() => ({ ok: true, payloadBytes: 512, limitBytes: 1024 }));
    runtimeRelayMocks.relayClient.pushArtifact.mockImplementation(async (_environment: string, artifact: Record<string, unknown>) => {
      const snapshotId = String(artifact.snapshotId);
      runtimeSnapshots.set(snapshotId, (artifact.mappingConfig as Record<string, unknown>) ?? {});
      runtimeSnapshotMeta.set(snapshotId, {
        hash: String(artifact.artifactHash),
        sourceType: artifact.sourceType as 'revision' | 'version',
        sourceNumber: Number(artifact.sourceNumber),
      });
      runtimeActiveSnapshotId = snapshotId;

      return {
        ok: true,
        statusCode: 201,
        requestId: `runtime-${snapshotId}`,
      };
    });

    runtimeApiClientMocks.client.rollback.mockImplementation(async (request: Record<string, unknown>) => {
      const targetArtifactId = String(request.targetArtifactId);
      if (!runtimeSnapshots.has(targetArtifactId)) {
        return {
          ok: false,
          statusCode: 409,
          requestId: 'runtime-rollback-missing',
          errorCode: 'ARTIFACT_NOT_PRESENT',
          message: 'Rollback target artifact missing in runtime local storage',
          retryable: false,
        };
      }

      runtimeActiveSnapshotId = targetArtifactId;
      return {
        ok: true,
        statusCode: 201,
        requestId: `runtime-rollback-${targetArtifactId}`,
        data: {
          mappingId: fixture.mappingId,
          environment: String(request.environment ?? 'DEV'),
          artifactId: targetArtifactId,
        },
      };
    });

    retryMocks.executeRuntimeOperationWithRetry.mockImplementation(async (input: {
      executeAttempt: (attempt: number) => Promise<Record<string, unknown>>;
    }) => {
      const attempt = await input.executeAttempt(1);
      if (attempt.ok === true) {
        return {
          ok: true,
          requestId: String(attempt.requestId),
          attemptCount: 1,
          reconciled: false,
          data: attempt.data,
        };
      }

      return {
        ok: false,
        requestId: String(attempt.requestId),
        attemptCount: 1,
        errorCode: String(attempt.errorCode),
        message: String(attempt.message),
        statusCode: Number(attempt.statusCode),
        retryable: Boolean(attempt.retryable),
        finalStatus: 'failed',
      };
    });

    engineMocks.execute.mockImplementation((config: { version?: number }, sourceData: { amount: number }) => {
      const multiplier = config.version === 2 ? 2 : 1;
      return {
        output: { Amount: sourceData.amount * multiplier },
        diagnostics: [],
        stats: { rulesEvaluated: 1, rulesSucceeded: 1, rulesFailed: 0, durationMs: 1 },
      };
    });

    const deployModule = await importDeployHandler();
    const promoteModule = await importPromoteHandler();
    const rollbackModule = await importRollbackHandler();
    const runtimeExecuteModule = await importRuntimeExecuteHandler();

    // Step 1-2: deploy initial migrated fixture version (SANDBOX-equivalent stage uses DEV path in current contract)
    const deployV1 = await deployModule.handler({
      body: JSON.stringify({ environment: 'DEV', sourceType: 'version', sourceNumber: 1 }),
      pathParameters: { mappingId: fixture.mappingId },
      headers: { 'x-idempotency-key': 'fs100-ae12-v1' },
    });
    expect(deployV1.statusCode).toBe(201);
    const deployV1Body = JSON.parse(deployV1.body) as { artifactId: string; artifactHash: string; environmentDeployedAt: string };

    // Step 3: execute runtime against active snapshot
    const executeV1 = await runtimeExecuteModule.handler({
      body: JSON.stringify({ mappingId: fixture.mappingId, sourceData: fixture.sourceData }),
      pathParameters: {},
    });
    expect(executeV1.statusCode).toBe(200);
    expect((JSON.parse(executeV1.body) as { output: unknown }).output).toEqual(fixture.expected.version1Output);

    // Step 4-5: deploy changed version
    const deployV2 = await deployModule.handler({
      body: JSON.stringify({ environment: 'DEV', sourceType: 'version', sourceNumber: 2 }),
      pathParameters: { mappingId: fixture.mappingId },
      headers: { 'x-idempotency-key': 'fs100-ae12-v2' },
    });
    expect(deployV2.statusCode).toBe(201);
    const deployV2Body = JSON.parse(deployV2.body) as { artifactId: string; artifactHash: string };
    expect(deployV2Body.artifactId).not.toBe(deployV1Body.artifactId);
    expect(deployV2Body.artifactHash).not.toBe(deployV1Body.artifactHash);

    const executeV2 = await runtimeExecuteModule.handler({
      body: JSON.stringify({ mappingId: fixture.mappingId, sourceData: fixture.sourceData }),
      pathParameters: {},
    });
    expect(executeV2.statusCode).toBe(200);
    expect((JSON.parse(executeV2.body) as { output: unknown }).output).toEqual(fixture.expected.version2Output);

    // Step 6-7: rollback to initial deployment snapshot and verify output restored
    const rollbackToV1 = await rollbackModule.handler({
      body: JSON.stringify({ environment: 'DEV', deploymentSK: deployV1Body.environmentDeployedAt }),
      pathParameters: { mappingId: fixture.mappingId },
      headers: { 'x-idempotency-key': 'fs100-ae12-rollback-v1' },
    });
    expect(rollbackToV1.statusCode).toBe(201);

    const executeAfterRollback = await runtimeExecuteModule.handler({
      body: JSON.stringify({ mappingId: fixture.mappingId, sourceData: fixture.sourceData }),
      pathParameters: {},
    });
    expect(executeAfterRollback.statusCode).toBe(200);
    expect((JSON.parse(executeAfterRollback.body) as { output: unknown }).output).toEqual(fixture.expected.version1Output);

    // Step 8-11: promote current DEV snapshot to PREPROD and assert identity/output parity
    const promoteToPreprod = await promoteModule.handler({
      body: JSON.stringify({ fromEnvironment: 'DEV', toEnvironment: 'PREPROD' }),
      pathParameters: { mappingId: fixture.mappingId },
      headers: { 'x-idempotency-key': 'fs100-ae12-promote' },
    });
    expect(promoteToPreprod.statusCode).toBe(201);
    const promotedBody = JSON.parse(promoteToPreprod.body) as { artifactId: string; artifactHash: string; promotedFrom?: string };
    expect(promotedBody.artifactId).toBe(deployV1Body.artifactId);
    expect(promotedBody.artifactHash).toBe(deployV1Body.artifactHash);
    expect(promotedBody.promotedFrom).toBe('DEV');

    const executeAfterPromote = await runtimeExecuteModule.handler({
      body: JSON.stringify({ mappingId: fixture.mappingId, sourceData: fixture.sourceData }),
      pathParameters: {},
    });
    expect(executeAfterPromote.statusCode).toBe(200);
    expect((JSON.parse(executeAfterPromote.body) as { output: unknown }).output).toEqual(fixture.expected.version1Output);
  });
});
