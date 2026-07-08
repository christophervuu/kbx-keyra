import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  jsonResponse: vi.fn(),
  ERROR_CODES: {
    CONFLICT: 'CONFLICT',
  },
}));

const orchestrationMocks = vi.hoisted(() => ({
  listReconciliationCandidates: vi.fn(),
  updateOperationRecordStatus: vi.fn(),
  releaseOperationLock: vi.fn(),
}));

const summaryMocks = vi.hoisted(() => ({
  get: vi.fn(),
  upsert: vi.fn(),
}));

const runtimeApiMocks = vi.hoisted(() => ({
  getRuntimeApiClient: vi.fn(),
  client: {
    status: vi.fn(),
  },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);
vi.mock('../../../src/lib/persistence/deployment-orchestrations.js', () => orchestrationMocks);
vi.mock('../../../src/lib/persistence/deployment-summaries.js', () => summaryMocks);
vi.mock('../../../src/lambda/deployment/runtime-api-client.js', () => runtimeApiMocks);

async function importHandler() {
  return import('../../../src/lambda/deployment/reconcile-deployment-operations.js');
}

describe('reconcile deployment operations handler', () => {
  beforeEach(() => {
    vi.resetModules();

    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(body),
    }));

    orchestrationMocks.listReconciliationCandidates.mockReset().mockResolvedValue([]);
    orchestrationMocks.updateOperationRecordStatus.mockReset().mockResolvedValue(undefined);
    orchestrationMocks.releaseOperationLock.mockReset().mockResolvedValue(true);

    summaryMocks.get.mockReset().mockResolvedValue({
      mappingId: 'map-1',
      projectId: 'proj-1',
      mappingName: 'Map 1',
    });
    summaryMocks.upsert.mockReset().mockResolvedValue(undefined);

    runtimeApiMocks.getRuntimeApiClient.mockReset().mockReturnValue(runtimeApiMocks.client);
    runtimeApiMocks.client.status.mockReset().mockResolvedValue({
      ok: true,
      statusCode: 200,
      requestId: 'runtime-req-1',
      data: {
        mappingId: 'map-1',
        activeSnapshot: {
          activeSnapshotId: 'artifact-1',
        },
      },
    });
  });

  it('finalizes timed-out operation as succeeded when runtime authority matches expected artifact', async () => {
    orchestrationMocks.listReconciliationCandidates.mockResolvedValueOnce([
      {
        operationId: 'op-1',
        mappingId: 'map-1',
        operationType: 'DEPLOY',
        operationStatus: 'TIMED_OUT',
        targetEnvironment: 'DEV',
        artifactId: 'artifact-1',
        requestedAt: '2026-07-07T00:00:00.000Z',
      },
    ]);

    const { handler } = await importHandler();
    const result = await handler({ body: null });

    expect(result.statusCode).toBe(200);
    expect(orchestrationMocks.updateOperationRecordStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'op-1',
        operationStatus: 'SUCCEEDED',
      }),
    );
    expect(summaryMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingId: 'map-1',
        operationStatus: 'SUCCEEDED',
      }),
    );
    expect(orchestrationMocks.releaseOperationLock).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingId: 'map-1',
        targetEnvironment: 'DEV',
        ownerOperationId: 'op-1',
      }),
    );
    expect(summaryMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'service:reconcile',
        actorDisplayName: 'Reconciliation Worker',
      }),
    );
  });

  it('marks operation failed when runtime active pointer mismatches expected artifact', async () => {
    orchestrationMocks.listReconciliationCandidates.mockResolvedValueOnce([
      {
        operationId: 'op-2',
        mappingId: 'map-1',
        operationType: 'PROMOTE',
        operationStatus: 'RUNNING',
        targetEnvironment: 'PREPROD',
        artifactId: 'artifact-expected',
        requestedAt: '2026-07-07T00:00:00.000Z',
      },
    ]);

    runtimeApiMocks.client.status.mockResolvedValueOnce({
      ok: true,
      statusCode: 200,
      requestId: 'runtime-req-2',
      data: {
        mappingId: 'map-1',
        activeSnapshot: {
          activeSnapshotId: 'artifact-other',
        },
      },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: null });

    expect(result.statusCode).toBe(200);
    expect(orchestrationMocks.updateOperationRecordStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'op-2',
        operationStatus: 'FAILED',
      }),
    );
    expect(summaryMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingId: 'map-1',
        operationStatus: 'FAILED',
      }),
    );
  });
});
