import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  generateRequestId: vi.fn(),
  getItem: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
    NOT_DEPLOYED: 'NOT_DEPLOYED',
    SNAPSHOT_INTEGRITY_ERROR: 'SNAPSHOT_INTEGRITY_ERROR',
  },
}));

const deploymentMocks = vi.hoisted(() => ({
  getCurrent: vi.fn(),
}));

const orchestrationPersistenceMocks = vi.hoisted(() => ({
  create: vi.fn(),
  updateStatus: vi.fn(),
}));

const runtimeApiClientMocks = vi.hoisted(() => ({
  getRuntimeApiClient: vi.fn(),
  client: {
    preview: vi.fn(),
  },
}));

const retryMocks = vi.hoisted(() => ({
  executeRuntimeOperationWithRetry: vi.fn(),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);
vi.mock('../../../src/lib/persistence/deployments.js', () => deploymentMocks);
vi.mock('../../../src/lib/persistence/deployment-orchestrations.js', () => orchestrationPersistenceMocks);
vi.mock('../../../src/lambda/deployment/runtime-api-client.js', () => ({
  getRuntimeApiClient: runtimeApiClientMocks.getRuntimeApiClient,
}));
vi.mock('../../../src/lambda/deployment/orchestration-retry.js', () => ({
  executeRuntimeOperationWithRetry: retryMocks.executeRuntimeOperationWithRetry,
}));
vi.mock('../../../src/lib/persistence/types.js', async () => {
  const actual = await vi.importActual('../../../src/lib/persistence/types.js');
  return actual;
});

async function importHandler() {
  return import('../../../src/lambda/mapping/preview-mapping.js');
}

type EnvStore = Record<string, string | undefined>;

function envStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env unavailable');
  }
  return processRef.env;
}

describe('preview mapping handler', () => {
  beforeEach(() => {
    vi.resetModules();

    envStore().MAPPINGS_TABLE = 'Mappings';
    envStore().STORAGE_BUCKET = 'Storage';

    sharedMocks.parsePathParam.mockReset().mockImplementation((event, name: string) => event.pathParameters?.[name] ?? null);
    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-preview-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({ environment: 'DEV', sourceData: { a: 'x' } });
    sharedMocks.getItem.mockReset().mockResolvedValue({ mappingId: 'map-1' });
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable, requestId, details) => ({
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

    deploymentMocks.getCurrent.mockReset().mockResolvedValue({
      mappingId: 'map-1',
      environment: 'DEV',
      deployedAt: '2026-06-03T00:00:00.000Z',
      sourceType: 'version',
      sourceNumber: 3,
      artifactId: 'artifact-dev-3',
      artifactHash: 'hash-dev-3',
      configS3Key: 'deployments/map-1/DEV/artifact-dev-3.json',
      configHash: 'cfg-hash-dev-3',
    });

    orchestrationPersistenceMocks.create.mockReset().mockResolvedValue({
      orchestrationId: 'orc-preview-1',
    });
    orchestrationPersistenceMocks.updateStatus.mockReset().mockResolvedValue(undefined);

    runtimeApiClientMocks.getRuntimeApiClient.mockReset().mockReturnValue(runtimeApiClientMocks.client);
    runtimeApiClientMocks.client.preview.mockReset();
    retryMocks.executeRuntimeOperationWithRetry.mockReset().mockResolvedValue({
      ok: true,
      requestId: 'runtime-preview-req-1',
      attemptCount: 1,
      reconciled: false,
      data: {
        environment: 'DEV',
        mappingId: 'map-1',
        artifactId: 'artifact-dev-3',
        artifactHash: 'hash-dev-3',
        output: { A: 'x' },
        diagnostics: [],
      },
    });
  });

  it('executes preview against selected runtime environment and returns provenance metadata', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'PREPROD', sourceData: { a: 'x' } });
    retryMocks.executeRuntimeOperationWithRetry.mockResolvedValueOnce({
      ok: true,
      requestId: 'runtime-preview-req-preprod',
      attemptCount: 1,
      reconciled: false,
      data: {
        environment: 'PREPROD',
        mappingId: 'map-1',
        artifactId: 'artifact-preprod-5',
        artifactHash: 'hash-preprod-5',
        output: { A: 'x' },
        diagnostics: [],
      },
    });
    deploymentMocks.getCurrent.mockResolvedValueOnce({
      mappingId: 'map-1',
      environment: 'PREPROD',
      deployedAt: '2026-06-03T01:00:00.000Z',
      sourceType: 'version',
      sourceNumber: 5,
      artifactId: 'artifact-preprod-5',
      artifactHash: 'hash-preprod-5',
      configS3Key: 'deployments/map-1/PREPROD/artifact-preprod-5.json',
      configHash: 'cfg-hash-preprod-5',
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.metadata).toEqual({
      environment: 'PREPROD',
      artifactId: 'artifact-preprod-5',
      artifactHash: 'hash-preprod-5',
      deployedAt: '2026-06-03T01:00:00.000Z',
      sourceType: 'version',
      sourceNumber: 5,
      engineVersion: null,
    });
    expect(retryMocks.executeRuntimeOperationWithRetry).toHaveBeenCalled();
    expect(deploymentMocks.getCurrent).toHaveBeenCalledWith('map-1', 'PREPROD');
    expect(orchestrationPersistenceMocks.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ orchestrationId: 'orc-preview-1', status: 'succeeded', attemptCount: 1 }),
    );
  });

  it('returns deterministic not-deployed style error when runtime preview reports no active deployment', async () => {
    retryMocks.executeRuntimeOperationWithRetry.mockResolvedValueOnce({
      ok: false,
      requestId: 'runtime-preview-404',
      attemptCount: 1,
      errorCode: 'SOURCE_NOT_FOUND',
      message: 'No active deployment in runtime environment',
      statusCode: 404,
      retryable: false,
      finalStatus: 'failed',
    });
    sharedMocks.parseBody.mockReturnValue({ environment: 'PROD', sourceData: { a: 'x' } });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('NOT_DEPLOYED');
    expect(body.error.message).toContain('NOT_DEPLOYED');
    expect(body.error.details).toEqual({
      orchestrationId: 'orc-preview-1',
      environment: 'PROD',
      mappingId: 'map-1',
      attemptCount: 1,
      finalStatus: 'failed',
    });
    expect(orchestrationPersistenceMocks.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ orchestrationId: 'orc-preview-1', status: 'failed', lastErrorCode: 'NOT_DEPLOYED' }),
    );
    expect(deploymentMocks.getCurrent).not.toHaveBeenCalled();
  });

  it('rejects invalid preview request body', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'SANDBOX', sourceData: [] });
    const { handler } = await importHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
  });
});
