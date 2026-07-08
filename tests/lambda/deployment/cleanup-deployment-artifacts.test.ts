import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  jsonResponse: vi.fn(),
}));

const retentionMocks = vi.hoisted(() => ({
  getRetentionPolicy: vi.fn(),
}));

const deploymentMocks = vi.hoisted(() => ({
  listRetentionCleanupTargets: vi.fn(),
  getCurrent: vi.fn(),
  listInProgressOperationArtifactIds: vi.fn(),
  selectRetentionCleanupCandidates: vi.fn(),
  updateRollbackEligibility: vi.fn(),
  deleteDeploymentHistoryEntries: vi.fn(),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);
vi.mock('../../../src/lib/deployment/retention-policy.js', () => retentionMocks);
vi.mock('../../../src/lib/persistence/deployments.js', () => deploymentMocks);

async function importHandler() {
  return import('../../../src/lambda/deployment/cleanup-deployment-artifacts.js');
}

describe('cleanup deployment artifacts handler', () => {
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

    retentionMocks.getRetentionPolicy.mockReset().mockImplementation((environment: 'DEV' | 'PREPROD' | 'PROD') => ({
      retainSuccessfulActivations: environment === 'PROD' ? 50 : 20,
    }));

    deploymentMocks.listRetentionCleanupTargets.mockReset().mockResolvedValue([]);
    deploymentMocks.getCurrent.mockReset().mockResolvedValue({ artifactId: null });
    deploymentMocks.listInProgressOperationArtifactIds.mockReset().mockResolvedValue([]);
    deploymentMocks.selectRetentionCleanupCandidates.mockReset().mockResolvedValue({
      protectedItems: [],
      deleteCandidates: [],
    });
    deploymentMocks.updateRollbackEligibility.mockReset().mockResolvedValue(0);
    deploymentMocks.deleteDeploymentHistoryEntries.mockReset().mockResolvedValue(0);
  });

  it('enforces retention cleanup and rollback eligibility updates across targets', async () => {
    deploymentMocks.listRetentionCleanupTargets.mockResolvedValueOnce([
      { mappingId: 'map-1', environment: 'DEV' },
      { mappingId: 'map-1', environment: 'PROD' },
    ]);

    deploymentMocks.getCurrent
      .mockResolvedValueOnce({ artifactId: 'artifact-dev-active' })
      .mockResolvedValueOnce({ artifactId: null })
      .mockResolvedValueOnce({ artifactId: 'artifact-prod-active' });

    deploymentMocks.listInProgressOperationArtifactIds
      .mockResolvedValueOnce(['artifact-dev-in-progress'])
      .mockResolvedValueOnce([]);

    deploymentMocks.selectRetentionCleanupCandidates
      .mockResolvedValueOnce({
        protectedItems: [
          { artifactId: 'artifact-dev-active' },
        ],
        deleteCandidates: [
          { mappingId: 'map-1', environmentDeployedAt: 'DEV#1', configS3Key: 'deployments/map-1/DEV/1.json' },
        ],
      })
      .mockResolvedValueOnce({
        protectedItems: [
          { artifactId: 'artifact-prod-active' },
        ],
        deleteCandidates: [],
      });

    deploymentMocks.updateRollbackEligibility
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    deploymentMocks.deleteDeploymentHistoryEntries
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    const { handler } = await importHandler();
    const response = await handler({ body: null });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.scannedTargets).toBe(2);
    expect(body.deletedCount).toBe(1);
    expect(body.rollbackEligibilityUpdates).toBe(1);

    expect(deploymentMocks.selectRetentionCleanupCandidates).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mappingId: 'map-1',
        environment: 'DEV',
        retainSuccessfulActivations: 20,
        protection: expect.objectContaining({
          activeArtifactId: 'artifact-dev-active',
          inProgressArtifactIds: ['artifact-dev-in-progress'],
          promotionSourceArtifactIds: [],
        }),
      }),
    );

    expect(deploymentMocks.selectRetentionCleanupCandidates).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        mappingId: 'map-1',
        environment: 'PROD',
        retainSuccessfulActivations: 50,
        protection: expect.objectContaining({
          activeArtifactId: null,
          promotionSourceArtifactIds: ['artifact-prod-active'],
        }),
      }),
    );
  });

  it('allows DEV local cleanup independent of PROD local runtime copy', async () => {
    deploymentMocks.listRetentionCleanupTargets.mockResolvedValueOnce([
      { mappingId: 'map-1', environment: 'DEV' },
    ]);
    deploymentMocks.getCurrent.mockResolvedValueOnce({ artifactId: null });
    deploymentMocks.listInProgressOperationArtifactIds.mockResolvedValueOnce([]);
    deploymentMocks.selectRetentionCleanupCandidates.mockResolvedValueOnce({
      protectedItems: [],
      deleteCandidates: [
        {
          mappingId: 'map-1',
          environmentDeployedAt: 'DEV#2026-07-07T00:00:00.000Z',
          configS3Key: 'deployments/map-1/DEV/2026-07-07T00:00:00.000Z.json',
          artifactId: 'artifact-shared',
        },
      ],
    });
    deploymentMocks.updateRollbackEligibility.mockResolvedValueOnce(0);
    deploymentMocks.deleteDeploymentHistoryEntries.mockResolvedValueOnce(1);

    const { handler } = await importHandler();
    const response = await handler({ body: null });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.deletedCount).toBe(1);
    expect(body.records[0]).toEqual(
      expect.objectContaining({
        mappingId: 'map-1',
        environment: 'DEV',
        deletedCount: 1,
      }),
    );
  });
});
