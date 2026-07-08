import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
  },
}));

const orchestrationMocks = vi.hoisted(() => ({
  createOperationRecord: vi.fn(),
  getOperationRecord: vi.fn(),
  acquireOperationLock: vi.fn(),
}));

const deploymentsMocks = vi.hoisted(() => ({
  getCurrent: vi.fn(),
}));

const versionEligibilityMocks = vi.hoisted(() => ({
  evaluateVersionEligibility: vi.fn(),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);
vi.mock('../../../src/lib/persistence/deployment-orchestrations.js', () => orchestrationMocks);
vi.mock('../../../src/lib/persistence/deployments.js', () => deploymentsMocks);
vi.mock('../../../src/lambda/deployment/version-eligibility.js', () => versionEligibilityMocks);

async function importStartDeployHandler() {
  return import('../../../src/lambda/deployment/start-deploy-operation.js');
}

async function importStartPromotionHandler() {
  return import('../../../src/lambda/deployment/start-promotion-operation.js');
}

async function importStartRollbackHandler() {
  return import('../../../src/lambda/deployment/start-rollback-operation.js');
}

async function importRetryOperationHandler() {
  return import('../../../src/lambda/deployment/retry-deployment-operation.js');
}

async function importGetOperationHandler() {
  return import('../../../src/lambda/deployment/get-deployment-operation.js');
}

describe('deployment operation handlers (FS-106 T-04)', () => {
  beforeEach(() => {
    vi.resetModules();

    sharedMocks.parsePathParam.mockReset().mockImplementation((event, name: string) => event.pathParameters?.[name] ?? null);
    sharedMocks.parseBody.mockReset().mockReturnValue({});
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(body),
    }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: { code, message, statusCode, retryable } }),
    }));

    orchestrationMocks.createOperationRecord.mockReset().mockResolvedValue(undefined);
    orchestrationMocks.getOperationRecord.mockReset().mockResolvedValue(null);
    orchestrationMocks.acquireOperationLock.mockReset().mockResolvedValue({ outcome: 'acquired', lockKey: 'lock:map-1:DEV' });
    deploymentsMocks.getCurrent.mockReset().mockResolvedValue(null);
    versionEligibilityMocks.evaluateVersionEligibility.mockReset().mockResolvedValue({
      eligible: true,
      normalizedVersion: 4,
      mappingConfig: {
        name: 'Map',
        version: 4,
        engineVersion: '1.0.0',
        config: {},
        rules: [],
      },
    });
  });

  it('deploy start handler returns 202 envelope and rejects revision-style input', async () => {
    sharedMocks.parseBody.mockReturnValueOnce({ sourceType: 'revision', sourceNumber: 2, targetEnvironment: 'DEV' });
    const { handler } = await importStartDeployHandler();

    const rejected = await handler({
      body: '{}',
      pathParameters: { mappingId: 'map-1' },
      headers: { 'Idempotency-Key': 'k1' },
    });

    expect(rejected.statusCode).toBe(400);
    expect(JSON.parse(rejected.body).error.code).toBe('VALIDATION_ERROR');

    sharedMocks.parseBody.mockReturnValueOnce({ version: 4, targetEnvironment: 'DEV', expectedActiveArtifactId: null });
    const accepted = await handler({
      body: '{}',
      pathParameters: { mappingId: 'map-1' },
      headers: { 'Idempotency-Key': 'k2' },
    });

    expect(accepted.statusCode).toBe(202);
    const body = JSON.parse(accepted.body);
    expect(body.operationType).toBe('DEPLOY');
    expect(body.status).toBe('QUEUED');
    expect(body.statusUrl).toContain('/deployment-operations/');
    expect(orchestrationMocks.createOperationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedBy: expect.objectContaining({
          actorType: 'DEVELOPMENT',
          actorId: 'development:system',
        }),
      }),
    );
  });

  it('deploy start handler captures USER actor metadata from request headers', async () => {
    sharedMocks.parseBody.mockReturnValueOnce({ version: 4, targetEnvironment: 'DEV', expectedActiveArtifactId: null });
    const { handler } = await importStartDeployHandler();

    const accepted = await handler({
      body: '{}',
      pathParameters: { mappingId: 'map-1' },
      headers: {
        'Idempotency-Key': 'k-user',
        'x-user-id': 'user-123',
        'x-user-display-name': 'Casey User',
        'x-user-email': 'casey@example.com',
      },
    });

    expect(accepted.statusCode).toBe(202);
    expect(orchestrationMocks.createOperationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedBy: {
          actorType: 'USER',
          actorId: 'user-123',
          actorDisplayName: 'Casey User',
          actorEmail: 'casey@example.com',
        },
      }),
    );
  });

  it('deploy start handler rejects ineligible versions', async () => {
    sharedMocks.parseBody.mockReturnValueOnce({ version: 4, targetEnvironment: 'DEV', expectedActiveArtifactId: null });
    versionEligibilityMocks.evaluateVersionEligibility.mockResolvedValueOnce({
      eligible: false,
      reason: 'VERSION_NOT_FOUND',
      message: 'Version source not found: map-1:4',
      statusCode: 404,
    });
    const { handler } = await importStartDeployHandler();

    const rejected = await handler({
      body: '{}',
      pathParameters: { mappingId: 'map-1' },
      headers: { 'Idempotency-Key': 'k-missing-version' },
    });

    expect(rejected.statusCode).toBe(404);
    expect(JSON.parse(rejected.body).error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('promotion handler enforces reason for PROD promotions', async () => {
    const { handler } = await importStartPromotionHandler();

    sharedMocks.parseBody.mockReturnValueOnce({
      sourceEnvironment: 'PREPROD',
      targetEnvironment: 'PROD',
      expectedSourceArtifactId: 'artifact-1',
      expectedTargetArtifactId: 'artifact-0',
    });
    const missingReason = await handler({
      body: '{}',
      pathParameters: { mappingId: 'map-1' },
      headers: { 'Idempotency-Key': 'k-prod' },
    });
    expect(missingReason.statusCode).toBe(400);

    sharedMocks.parseBody.mockReturnValueOnce({
      sourceEnvironment: 'PREPROD',
      targetEnvironment: 'PROD',
      expectedSourceArtifactId: 'artifact-1',
      expectedTargetArtifactId: 'artifact-0',
      reason: 'Release to PROD',
    });
    deploymentsMocks.getCurrent
      .mockResolvedValueOnce({ artifactId: 'artifact-1' })
      .mockResolvedValueOnce({ artifactId: 'artifact-0' });
    const accepted = await handler({
      body: '{}',
      pathParameters: { mappingId: 'map-1' },
      headers: { 'Idempotency-Key': 'k-prod-2' },
    });
    expect(accepted.statusCode).toBe(202);
    expect(JSON.parse(accepted.body).operationType).toBe('PROMOTE');
  });

  it('rollback handler requires reason and returns 202 envelope', async () => {
    const { handler } = await importStartRollbackHandler();

    sharedMocks.parseBody.mockReturnValueOnce({
      environment: 'PROD',
      targetArtifactId: 'artifact-7',
      expectedActiveArtifactId: 'artifact-9',
    });
    const missingReason = await handler({
      body: '{}',
      pathParameters: { mappingId: 'map-1' },
      headers: { 'Idempotency-Key': 'k-rb' },
    });
    expect(missingReason.statusCode).toBe(400);

    sharedMocks.parseBody.mockReturnValueOnce({
      environment: 'PROD',
      targetArtifactId: 'artifact-7',
      expectedActiveArtifactId: 'artifact-9',
      reason: 'Customer validation failure',
    });
    deploymentsMocks.getCurrent.mockResolvedValueOnce({ artifactId: 'artifact-9' });
    const accepted = await handler({
      body: '{}',
      pathParameters: { mappingId: 'map-1' },
      headers: { 'Idempotency-Key': 'k-rb-2' },
    });

    expect(accepted.statusCode).toBe(202);
    expect(JSON.parse(accepted.body).operationType).toBe('ROLLBACK');
  });

  it('retry handler creates new operationId linked by retryOfOperationId', async () => {
    orchestrationMocks.getOperationRecord
      .mockResolvedValueOnce({
        orchestrationId: 'op-1',
        operationId: 'op-1',
        mappingId: 'map-1',
        operationType: 'DEPLOY',
        operationStatus: 'FAILED',
        requestedBy: { actorType: 'DEVELOPMENT', actorId: 'development:system' },
        requestedAt: '2026-07-07T00:00:00.000Z',
      })
      .mockResolvedValueOnce(null);

    const { handler } = await importRetryOperationHandler();
    const result = await handler({
      body: '{}',
      pathParameters: { operationId: 'op-1' },
      headers: { 'Idempotency-Key': 'retry-k' },
    });

    expect(result.statusCode).toBe(202);
    const body = JSON.parse(result.body);
    expect(body.operationType).toBe('RETRY');
    expect(body.operationId).not.toBe('op-1');
    expect(body.retryOfOperationId).toBe('op-1');
  });

  it('get operation handler returns required response shape', async () => {
    orchestrationMocks.getOperationRecord.mockResolvedValueOnce({
      orchestrationId: 'op-1',
      operationId: 'op-1',
      mappingId: 'map-1',
      projectId: 'proj-1',
      operationType: 'DEPLOY',
      operationStatus: 'RUNNING',
      operationStage: 'ACTIVATING_ARTIFACT',
      sourceEnvironment: 'DEV',
      targetEnvironment: 'DEV',
      sourceVersion: 4,
      artifactId: 'artifact-4',
      artifactHash: 'hash-4',
      requestedBy: { actorType: 'DEVELOPMENT', actorId: 'development:system' },
      requestedAt: '2026-07-07T00:00:00.000Z',
      startedAt: '2026-07-07T00:00:01.000Z',
      retryOfOperationId: undefined,
    });

    const { handler } = await importGetOperationHandler();
    const result = await handler({ body: null, pathParameters: { operationId: 'op-1' } });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.operationId).toBe('op-1');
    expect(body.operationType).toBe('DEPLOY');
    expect(body.operationStatus).toBe('RUNNING');
    expect(body.operationStage).toBe('ACTIVATING_ARTIFACT');
    expect(body.requestedBy.actorType).toBe('DEVELOPMENT');
  });
});
