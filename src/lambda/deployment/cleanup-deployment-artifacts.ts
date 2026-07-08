import {
  jsonResponse,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { getRetentionPolicy } from '../../lib/deployment/retention-policy.js';
import {
  deleteDeploymentHistoryEntries,
  getCurrent,
  listInProgressOperationArtifactIds,
  listRetentionCleanupTargets,
  selectRetentionCleanupCandidates,
  updateRollbackEligibility,
} from '../../lib/persistence/deployments.js';
import type { DeploymentEnvironment } from '../../lib/persistence/types.js';
import { emitDeploymentMetric } from './observability.js';
import { serviceActor } from './actor-context.js';

const CLEANUP_ACTOR = serviceActor('service:cleanup', 'Retention Cleanup Worker');

function predecessorEnvironment(environment: DeploymentEnvironment): DeploymentEnvironment | null {
  if (environment === 'PREPROD') {
    return 'DEV';
  }

  if (environment === 'PROD') {
    return 'PREPROD';
  }

  return null;
}

interface CleanupTargetResult {
  readonly mappingId: string;
  readonly environment: DeploymentEnvironment;
  readonly retainedCount: number;
  readonly deletedCount: number;
  readonly rollbackEligibilityUpdated: number;
}

async function cleanupTarget(mappingId: string, environment: DeploymentEnvironment): Promise<CleanupTargetResult> {
  const policy = getRetentionPolicy(environment);
  const current = await getCurrent(mappingId, environment);
  const inProgressArtifactIds = await listInProgressOperationArtifactIds(mappingId, environment);

  const sourceEnv = predecessorEnvironment(environment);
  const sourceCurrent = sourceEnv ? await getCurrent(mappingId, sourceEnv) : null;
  const promotionSourceArtifactIds = sourceCurrent?.artifactId ? [sourceCurrent.artifactId] : [];

  const selected = await selectRetentionCleanupCandidates({
    mappingId,
    environment,
    retainSuccessfulActivations: policy.retainSuccessfulActivations,
    protection: {
      activeArtifactId: current?.artifactId ?? null,
      inProgressArtifactIds,
      rollbackWindowArtifactIds: [],
      promotionSourceArtifactIds,
    },
  });

  const rollbackEligibleArtifactIds = selected.protectedItems
    .map((item) => item.artifactId)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const rollbackEligibilityUpdated = await updateRollbackEligibility(
    mappingId,
    environment,
    rollbackEligibleArtifactIds,
  );
  const deletedCount = await deleteDeploymentHistoryEntries(selected.deleteCandidates);

  return {
    mappingId,
    environment,
    retainedCount: selected.protectedItems.length,
    deletedCount,
    rollbackEligibilityUpdated,
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  void event;

  const startedAt = Date.now();
  const targets = await listRetentionCleanupTargets();
  const records: CleanupTargetResult[] = [];

  for (const target of targets) {
    const result = await cleanupTarget(target.mappingId, target.environment);
    records.push(result);
  }

  const deletedCount = records.reduce((sum, record) => sum + record.deletedCount, 0);
  const rollbackEligibilityUpdates = records.reduce((sum, record) => sum + record.rollbackEligibilityUpdated, 0);

  console.info(JSON.stringify({
    eventType: 'deployment-retention-cleanup',
    durationMs: Date.now() - startedAt,
    targetCount: targets.length,
    deletedCount,
    rollbackEligibilityUpdates,
  }));

  emitDeploymentMetric({
    metricName: 'deployment.cleanup',
    operationType: 'CLEANUP',
    operationStatus: 'COMPLETED',
    durationMs: Date.now() - startedAt,
    value: deletedCount,
    actor: CLEANUP_ACTOR,
    details: {
      targetCount: targets.length,
      rollbackEligibilityUpdates,
    },
  });

  return jsonResponse(200, {
    scannedTargets: targets.length,
    deletedCount,
    rollbackEligibilityUpdates,
    records,
  });
}
