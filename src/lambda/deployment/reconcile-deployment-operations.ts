import {
  ERROR_CODES,
  jsonResponse,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import {
  listReconciliationCandidates,
  releaseOperationLock,
  updateOperationRecordStatus,
  type DeploymentOperationRecord,
} from '../../lib/persistence/deployment-orchestrations.js';
import { get as getDeploymentSummary, upsert as upsertDeploymentSummary } from '../../lib/persistence/deployment-summaries.js';
import { getRuntimeApiClient } from './runtime-api-client.js';
import { emitDeploymentMetric } from './observability.js';
import { serviceActor } from './actor-context.js';

const RECONCILE_ACTOR = serviceActor('service:reconcile', 'Reconciliation Worker');

function expectedArtifactForOperation(operation: DeploymentOperationRecord): string | null {
  if (operation.operationType === 'ROLLBACK') {
    return operation.artifactId ?? null;
  }

  if (operation.operationType === 'DEPLOY' || operation.operationType === 'PROMOTE' || operation.operationType === 'RETRY') {
    return operation.artifactId ?? null;
  }

  return null;
}

function extractActiveArtifact(statusData: {
  readonly artifactId?: string | null;
  readonly activeSnapshot?: { readonly activeSnapshotId?: string } | null;
}): string | null {
  return statusData.artifactId ?? statusData.activeSnapshot?.activeSnapshotId ?? null;
}

function operationToSummaryStatus(status: 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT'): 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' {
  return status;
}

function normalizeRuntimeEnvironment(value: string): 'DEV' | 'PREPROD' | 'PROD' | null {
  return value === 'DEV' || value === 'PREPROD' || value === 'PROD' ? value : null;
}

async function reconcileOne(operation: DeploymentOperationRecord): Promise<{ outcome: 'finalized' | 'unchanged'; reason: string }> {
  const targetEnvironment = operation.targetEnvironment ? normalizeRuntimeEnvironment(operation.targetEnvironment) : null;
  if (!targetEnvironment) {
    return { outcome: 'unchanged', reason: 'no-target-environment' };
  }

  const runtimeStatus = await getRuntimeApiClient().status({
    mappingId: operation.mappingId,
    environment: targetEnvironment,
    requestId: operation.operationId,
  });

  if (!runtimeStatus.ok) {
    await updateOperationRecordStatus({
      operationId: operation.operationId,
      operationStatus: 'TIMED_OUT',
      operationStage: 'VERIFYING_RUNTIME',
      failureCode: runtimeStatus.errorCode,
      failureMessage: runtimeStatus.message,
      retryable: runtimeStatus.retryable,
    });
    return { outcome: 'unchanged', reason: 'runtime-status-unavailable' };
  }

  const activeArtifactId = extractActiveArtifact(runtimeStatus.data);
  const expectedArtifactId = expectedArtifactForOperation(operation);
  const matchesRuntimeAuthority = Boolean(expectedArtifactId) && activeArtifactId === expectedArtifactId;

  if (matchesRuntimeAuthority) {
    await updateOperationRecordStatus({
      operationId: operation.operationId,
      operationStatus: 'SUCCEEDED',
      operationStage: 'FINALIZING',
      completedAt: new Date().toISOString(),
    });

    const summary = await getDeploymentSummary(operation.mappingId);
    if (summary) {
      await upsertDeploymentSummary({
        mappingId: operation.mappingId,
        projectId: summary.projectId,
        mappingName: summary.mappingName,
        environmentStates: {
          [targetEnvironment]: {
            activeArtifactId: expectedArtifactId,
            activeVersion: operation.sourceVersion ?? null,
            lastOperationStatus: operationToSummaryStatus('SUCCEEDED'),
          },
        },
        operationType: operation.operationType,
        operationStatus: 'SUCCEEDED',
        activeOperationId: null,
        actorId: RECONCILE_ACTOR.actorId,
        actorDisplayName: RECONCILE_ACTOR.actorDisplayName,
      });
    }

    await releaseOperationLock({
      mappingId: operation.mappingId,
      targetEnvironment,
      ownerOperationId: operation.operationId,
    });

    return { outcome: 'finalized', reason: 'runtime-authority-match' };
  }

  await updateOperationRecordStatus({
    operationId: operation.operationId,
    operationStatus: 'FAILED',
    operationStage: 'FINALIZING',
    completedAt: new Date().toISOString(),
    failureCode: ERROR_CODES.CONFLICT,
    failureMessage: 'Runtime active pointer does not match expected artifact after reconciliation.',
    retryable: true,
  });

  const summary = await getDeploymentSummary(operation.mappingId);
  if (summary) {
    await upsertDeploymentSummary({
      mappingId: operation.mappingId,
      projectId: summary.projectId,
      mappingName: summary.mappingName,
      environmentStates: {
        [targetEnvironment]: {
          lastOperationStatus: operationToSummaryStatus('FAILED'),
        },
      },
      operationType: operation.operationType,
      operationStatus: 'FAILED',
      activeOperationId: null,
      actorId: RECONCILE_ACTOR.actorId,
      actorDisplayName: RECONCILE_ACTOR.actorDisplayName,
    });
  }

  await releaseOperationLock({
    mappingId: operation.mappingId,
    targetEnvironment,
    ownerOperationId: operation.operationId,
  });

  return { outcome: 'finalized', reason: 'runtime-authority-mismatch' };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  void event;

  const startedAt = Date.now();
  const candidates = await listReconciliationCandidates();
  const records: Array<Record<string, unknown>> = [];

  for (const candidate of candidates) {
    try {
      const result = await reconcileOne(candidate);
      records.push({
        operationId: candidate.operationId,
        mappingId: candidate.mappingId,
        targetEnvironment: candidate.targetEnvironment,
        outcome: result.outcome,
        reason: result.reason,
      });
    } catch (error) {
      records.push({
        operationId: candidate.operationId,
        mappingId: candidate.mappingId,
        targetEnvironment: candidate.targetEnvironment,
        outcome: 'error',
        reason: (error as { message?: string } | null | undefined)?.message ?? 'unknown-error',
      });
    }
  }

  console.info(JSON.stringify({
    eventType: 'deployment-reconciliation',
    durationMs: Date.now() - startedAt,
    candidateCount: candidates.length,
    finalizedCount: records.filter((row) => row.outcome === 'finalized').length,
    unchangedCount: records.filter((row) => row.outcome === 'unchanged').length,
    errorCount: records.filter((row) => row.outcome === 'error').length,
  }));

  emitDeploymentMetric({
    metricName: 'deployment.reconciliation',
    operationType: 'RECONCILE',
    operationStatus: 'COMPLETED',
    durationMs: Date.now() - startedAt,
    value: records.filter((row) => row.outcome === 'finalized').length,
    actor: RECONCILE_ACTOR,
    details: {
      candidateCount: candidates.length,
      unchangedCount: records.filter((row) => row.outcome === 'unchanged').length,
      errorCount: records.filter((row) => row.outcome === 'error').length,
    },
  });

  return jsonResponse(200, {
    scanned: candidates.length,
    records,
  });
}
