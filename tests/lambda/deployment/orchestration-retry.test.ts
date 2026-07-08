import { beforeEach, describe, expect, it, vi } from 'vitest';

const orchestrationPersistenceMocks = vi.hoisted(() => ({
  updateStatus: vi.fn(),
}));

const deploymentSummariesMocks = vi.hoisted(() => ({
  upsert: vi.fn(),
}));

const environmentConfigMocks = vi.hoisted(() => ({
  loadDeploymentEnvironmentSettings: vi.fn(),
  getRuntimeEnvironmentConfig: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/deployment-orchestrations.js', () => ({
  updateStatus: orchestrationPersistenceMocks.updateStatus,
}));

vi.mock('../../../src/lib/persistence/deployment-summaries.js', () => ({
  upsert: deploymentSummariesMocks.upsert,
}));

vi.mock('../../../src/lambda/deployment/environment-config.js', () => ({
  loadDeploymentEnvironmentSettings: environmentConfigMocks.loadDeploymentEnvironmentSettings,
  getRuntimeEnvironmentConfig: environmentConfigMocks.getRuntimeEnvironmentConfig,
}));

async function importRetryModule() {
  return import('../../../src/lambda/deployment/orchestration-retry.js');
}

describe('orchestration retry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    orchestrationPersistenceMocks.updateStatus.mockReset().mockResolvedValue(undefined);
    deploymentSummariesMocks.upsert.mockReset().mockResolvedValue(undefined);
    environmentConfigMocks.loadDeploymentEnvironmentSettings.mockReset().mockResolvedValue({
      deploymentEnvironments: [
        {
          key: 'DEV',
          runtimeApiBaseUrl: 'https://runtime.dev.local',
          deployApiPath: '/internal/deploy',
          rollbackApiPath: '/internal/rollback',
          previewApiPath: '/internal/preview',
          statusApiPath: '/internal/status/{mappingId}',
          requestTimeoutMs: 10_000,
          retryPolicy: { maxAttempts: 3, baseDelayMs: 50, maxDelayMs: 100 },
        },
      ],
    });
    environmentConfigMocks.getRuntimeEnvironmentConfig.mockReset().mockReturnValue({
      retryPolicy: { maxAttempts: 3, baseDelayMs: 50, maxDelayMs: 100 },
    });
  });

  it('retries retryable failure and succeeds on later attempt', async () => {
    const mod = await importRetryModule();
    const executeAttempt = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        statusCode: 503,
        requestId: 'req-1',
        errorCode: 'SERVICE_UNAVAILABLE',
        message: 'runtime unavailable',
        retryable: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        statusCode: 201,
        requestId: 'req-2',
        data: { activated: true },
      });

    const result = await mod.executeRuntimeOperationWithRetry({
      mappingId: 'map-1',
      projectId: 'proj-1',
      mappingName: 'Map 1',
      environment: 'DEV',
      operationType: 'deploy',
      orchestrationId: 'orc-1',
      requestId: 'req-orc',
      artifactId: 'artifact-1',
      runtimeApiClient: {
        deploy: vi.fn(),
        rollback: vi.fn(),
        preview: vi.fn(),
        status: vi.fn(),
      },
      executeAttempt,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toEqual({
      ok: true,
      requestId: 'req-2',
      attemptCount: 2,
      reconciled: false,
      data: { activated: true },
    });
    expect(orchestrationPersistenceMocks.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ orchestrationId: 'orc-1', status: 'retrying', attemptCount: 1 }),
    );
    expect(deploymentSummariesMocks.upsert).toHaveBeenCalled();
  });

  it('reconciles timeout as success when runtime status indicates deployed state', async () => {
    const mod = await importRetryModule();
    const status = vi.fn().mockResolvedValue({
      ok: true,
      statusCode: 200,
      requestId: 'status-req-1',
      data: {
        status: 'deployed',
        activeSnapshot: {
          activeSnapshotId: 'artifact-1',
        },
      },
    });

    const result = await mod.executeRuntimeOperationWithRetry({
      mappingId: 'map-1',
      environment: 'DEV',
      operationType: 'deploy',
      orchestrationId: 'orc-2',
      requestId: 'req-orc-2',
      artifactId: 'artifact-1',
      runtimeApiClient: {
        deploy: vi.fn(),
        rollback: vi.fn(),
        preview: vi.fn(),
        status,
      },
      executeAttempt: vi.fn().mockResolvedValue({
        ok: false,
        statusCode: 504,
        requestId: 'req-timeout-1',
        errorCode: 'TIMEOUT',
        message: 'timed out',
        retryable: true,
      }),
      sleep: vi.fn(),
    });

    expect(result).toEqual({
      ok: true,
      requestId: 'status-req-1',
      attemptCount: 1,
      reconciled: true,
    });
    expect(status).toHaveBeenCalledWith(
      expect.objectContaining({ mappingId: 'map-1', environment: 'DEV', requestId: 'req-timeout-1' }),
    );
  });

  it('does not retry non-retryable failure and marks orchestration failed', async () => {
    const mod = await importRetryModule();
    const result = await mod.executeRuntimeOperationWithRetry({
      mappingId: 'map-1',
      projectId: 'proj-1',
      mappingName: 'Map 1',
      environment: 'DEV',
      operationType: 'rollback',
      orchestrationId: 'orc-3',
      requestId: 'req-orc-3',
      artifactId: 'artifact-1',
      runtimeApiClient: {
        deploy: vi.fn(),
        rollback: vi.fn(),
        preview: vi.fn(),
        status: vi.fn(),
      },
      executeAttempt: vi.fn().mockResolvedValue({
        ok: false,
        statusCode: 409,
        requestId: 'req-fail-1',
        errorCode: 'ARTIFACT_NOT_PRESENT',
        message: 'artifact missing',
        retryable: false,
      }),
      sleep: vi.fn(),
    });

    expect(result).toEqual({
      ok: false,
      requestId: 'req-fail-1',
      attemptCount: 1,
      errorCode: 'ARTIFACT_NOT_PRESENT',
      message: 'artifact missing',
      statusCode: 409,
      retryable: false,
      finalStatus: 'failed',
    });
    expect(orchestrationPersistenceMocks.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ orchestrationId: 'orc-3', status: 'failed', lastErrorCode: 'ARTIFACT_NOT_PRESENT' }),
    );
    expect(deploymentSummariesMocks.upsert).toHaveBeenCalled();
  });
});
