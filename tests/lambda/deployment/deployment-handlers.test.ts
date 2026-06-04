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
  upsertActiveSnapshot: vi.fn(),
  appendDeploymentHistory: vi.fn(),
  listDeploymentHistory: vi.fn(),
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

async function importRuntimeDeployHandler() {
  return import('../../../src/lambda/deployment/runtime-deploy.js');
}

async function importRuntimeRollbackHandler() {
  return import('../../../src/lambda/deployment/runtime-rollback.js');
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
    sharedMocks.errorResponse
      .mockReset()
      .mockImplementation((code, message, statusCode, retryable, requestId, details) => ({
        statusCode,
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
      createdAt: '2026-06-03T00:00:00.000Z',
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

    putRuntimeSnapshotSpy.mockRestore();
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
});
