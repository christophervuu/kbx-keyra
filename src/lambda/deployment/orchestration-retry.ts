import { updateStatus as updateDeploymentOrchestrationStatus } from '../../lib/persistence/deployment-orchestrations.js';
import { upsert as upsertDeploymentSummary } from '../../lib/persistence/deployment-summaries.js';
import {
  getRuntimeEnvironmentConfig,
  loadDeploymentEnvironmentSettings,
  type RuntimeEnvironmentKey,
  type RuntimeEnvironmentRetryPolicy,
} from './environment-config.js';
import type { RuntimeApiClient, RuntimeApiResult, RuntimeStatusResponseData } from './runtime-api-client.js';
import { ERROR_CODES } from '../shared/errors.js';
import { emitDeploymentMetric } from './observability.js';
import { serviceActor } from './actor-context.js';

const RETRY_ACTOR = serviceActor('service:retry', 'Retry Worker');

const DEFAULT_RETRY_POLICY: RuntimeEnvironmentRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 5000,
};

export type OrchestrationOperationType = 'deploy' | 'promote' | 'rollback' | 'preview';

interface RetryFailure {
  readonly ok: false;
  readonly statusCode: number;
  readonly requestId: string;
  readonly errorCode: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ExecuteWithRetrySuccess<TData> {
  readonly ok: true;
  readonly requestId: string;
  readonly attemptCount: number;
  readonly reconciled: boolean;
  readonly data?: TData;
}

export interface ExecuteWithRetryFailure {
  readonly ok: false;
  readonly requestId: string;
  readonly attemptCount: number;
  readonly errorCode: string;
  readonly message: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly finalStatus: 'failed' | 'timed_out';
}

export type ExecuteWithRetryResult<TData> = ExecuteWithRetrySuccess<TData> | ExecuteWithRetryFailure;

export async function executeRuntimeOperationWithRetry<TData>(input: {
  readonly mappingId: string;
  readonly projectId?: string;
  readonly mappingName?: string;
  readonly environment: RuntimeEnvironmentKey;
  readonly operationType: OrchestrationOperationType;
  readonly orchestrationId: string;
  readonly requestId: string;
  readonly artifactId?: string;
  readonly targetArtifactId?: string;
  readonly runtimeApiClient: RuntimeApiClient;
  readonly executeAttempt: (attemptCount: number) => Promise<RuntimeApiResult<TData> | RetryFailure>;
  readonly retryPolicyOverride?: RuntimeEnvironmentRetryPolicy;
  readonly sleep?: (ms: number) => Promise<void>;
}): Promise<ExecuteWithRetryResult<TData>> {
  const retryPolicy = input.retryPolicyOverride ?? (await resolveRetryPolicy(input.environment));
  const sleep = input.sleep ?? wait;

  for (let attemptCount = 1; attemptCount <= retryPolicy.maxAttempts; attemptCount += 1) {
    const result = await input.executeAttempt(attemptCount);
    if (result.ok) {
      return {
        ok: true,
        requestId: result.requestId,
        attemptCount,
        reconciled: false,
        data: result.data,
      };
    }

    if (shouldAttemptTimeoutReconciliation(input.operationType, result.errorCode)) {
      const reconciled = await reconcileTimeoutOutcome({
        mappingId: input.mappingId,
        environment: input.environment,
        operationType: input.operationType,
        runtimeApiClient: input.runtimeApiClient,
        requestId: result.requestId,
        artifactId: input.artifactId,
        targetArtifactId: input.targetArtifactId,
      });

      if (reconciled.ok) {
        return {
          ok: true,
          requestId: reconciled.requestId,
          attemptCount,
          reconciled: true,
        };
      }
    }

    if (result.retryable && attemptCount < retryPolicy.maxAttempts) {
      await updateDeploymentOrchestrationStatus({
        orchestrationId: input.orchestrationId,
        status: 'retrying',
        attemptCount,
        artifactId: input.artifactId,
        requestId: result.requestId,
        lastErrorCode: result.errorCode,
        lastErrorMessage: result.message,
      });

      if (input.projectId && input.mappingName) {
        await upsertDeploymentSummary({
          mappingId: input.mappingId,
          projectId: input.projectId,
          mappingName: input.mappingName,
          environmentStates: {
            [input.environment]: {
              lastOperationStatus: 'RUNNING',
            },
          },
          operationType:
            input.operationType === 'deploy'
              ? 'DEPLOY'
              : input.operationType === 'promote'
                ? 'PROMOTE'
                : input.operationType === 'rollback'
                  ? 'ROLLBACK'
                  : 'RETRY',
          operationStatus: 'RUNNING',
          activeOperationId: input.orchestrationId,
          actorId: RETRY_ACTOR.actorId,
          actorDisplayName: RETRY_ACTOR.actorDisplayName,
        });
      }

      emitDeploymentMetric({
        metricName: 'deployment.operation.finalized',
        mappingId: input.mappingId,
        projectId: input.projectId,
        artifactId: input.artifactId,
        operationId: input.orchestrationId,
        operationType: input.operationType.toUpperCase(),
        operationStatus: 'RUNNING',
        environment: input.environment,
        value: attemptCount,
        actor: RETRY_ACTOR,
      });

      await sleep(computeRetryDelayMs(retryPolicy, attemptCount));
      continue;
    }

    const finalStatus = result.errorCode === ERROR_CODES.TIMEOUT ? 'timed_out' : 'failed';

    await updateDeploymentOrchestrationStatus({
      orchestrationId: input.orchestrationId,
      status: finalStatus,
      attemptCount,
      artifactId: input.artifactId,
      requestId: result.requestId,
      lastErrorCode: result.errorCode,
      lastErrorMessage: result.message,
    });

    if (input.projectId && input.mappingName) {
      await upsertDeploymentSummary({
        mappingId: input.mappingId,
        projectId: input.projectId,
        mappingName: input.mappingName,
        environmentStates: {
          [input.environment]: {
            lastOperationStatus: finalStatus === 'timed_out' ? 'TIMED_OUT' : 'FAILED',
          },
        },
        operationType:
          input.operationType === 'deploy'
            ? 'DEPLOY'
            : input.operationType === 'promote'
              ? 'PROMOTE'
              : input.operationType === 'rollback'
                ? 'ROLLBACK'
                : 'RETRY',
        operationStatus: finalStatus === 'timed_out' ? 'TIMED_OUT' : 'FAILED',
        activeOperationId: null,
        actorId: RETRY_ACTOR.actorId,
        actorDisplayName: RETRY_ACTOR.actorDisplayName,
      });
    }

    emitDeploymentMetric({
      metricName: 'deployment.operation.finalized',
      mappingId: input.mappingId,
      projectId: input.projectId,
      artifactId: input.artifactId,
      operationId: input.orchestrationId,
      operationType: input.operationType.toUpperCase(),
      operationStatus: finalStatus === 'timed_out' ? 'TIMED_OUT' : 'FAILED',
      environment: input.environment,
      value: attemptCount,
      actor: RETRY_ACTOR,
      details: {
        errorCode: result.errorCode,
      },
    });

    return {
      ok: false,
      requestId: result.requestId,
      attemptCount,
      errorCode: result.errorCode,
      message: result.message,
      statusCode: result.statusCode,
      retryable: result.retryable,
      finalStatus,
    };
  }

  await updateDeploymentOrchestrationStatus({
    orchestrationId: input.orchestrationId,
    status: 'timed_out',
    attemptCount: retryPolicy.maxAttempts,
    artifactId: input.artifactId,
    requestId: input.requestId,
    lastErrorCode: ERROR_CODES.TIMEOUT,
    lastErrorMessage: 'Runtime operation timed out after max attempts.',
  });

  if (input.projectId && input.mappingName) {
    await upsertDeploymentSummary({
      mappingId: input.mappingId,
      projectId: input.projectId,
      mappingName: input.mappingName,
      environmentStates: {
        [input.environment]: {
          lastOperationStatus: 'TIMED_OUT',
        },
      },
      operationType:
        input.operationType === 'deploy'
          ? 'DEPLOY'
          : input.operationType === 'promote'
            ? 'PROMOTE'
            : input.operationType === 'rollback'
              ? 'ROLLBACK'
              : 'RETRY',
      operationStatus: 'TIMED_OUT',
      activeOperationId: null,
      actorId: RETRY_ACTOR.actorId,
      actorDisplayName: RETRY_ACTOR.actorDisplayName,
    });
  }

  emitDeploymentMetric({
    metricName: 'deployment.operation.finalized',
    mappingId: input.mappingId,
    projectId: input.projectId,
    artifactId: input.artifactId,
    operationId: input.orchestrationId,
    operationType: input.operationType.toUpperCase(),
    operationStatus: 'TIMED_OUT',
    environment: input.environment,
    value: retryPolicy.maxAttempts,
    actor: RETRY_ACTOR,
    details: {
      errorCode: ERROR_CODES.TIMEOUT,
    },
  });

  return {
    ok: false,
    requestId: input.requestId,
    attemptCount: retryPolicy.maxAttempts,
    errorCode: ERROR_CODES.TIMEOUT,
    message: 'Runtime operation timed out after max attempts.',
    statusCode: 504,
    retryable: true,
    finalStatus: 'timed_out',
  };
}

function shouldAttemptTimeoutReconciliation(
  operationType: OrchestrationOperationType,
  errorCode: string,
): boolean {
  return operationType !== 'preview' && errorCode === ERROR_CODES.TIMEOUT;
}

async function reconcileTimeoutOutcome(input: {
  mappingId: string;
  environment: RuntimeEnvironmentKey;
  operationType: OrchestrationOperationType;
  runtimeApiClient: RuntimeApiClient;
  requestId: string;
  artifactId?: string;
  targetArtifactId?: string;
}): Promise<{ ok: true; requestId: string } | { ok: false }> {
  const statusResult = await input.runtimeApiClient.status({
    mappingId: input.mappingId,
    environment: input.environment,
    requestId: input.requestId,
  });

  if (!statusResult.ok) {
    return { ok: false };
  }

  if (isReconciledSuccess(statusResult.data, input.operationType, input.artifactId, input.targetArtifactId)) {
    return {
      ok: true,
      requestId: statusResult.requestId,
    };
  }

  return { ok: false };
}

function isReconciledSuccess(
  statusData: RuntimeStatusResponseData,
  operationType: OrchestrationOperationType,
  artifactId?: string,
  targetArtifactId?: string,
): boolean {
  const status = (statusData.state ?? statusData.status ?? '').toLowerCase();
  const activeSnapshotId = statusData.activeSnapshot?.activeSnapshotId ?? undefined;

  if (operationType === 'rollback' && typeof targetArtifactId === 'string') {
    return activeSnapshotId === targetArtifactId;
  }

  if (typeof artifactId === 'string' && activeSnapshotId === artifactId) {
    return true;
  }

  return status === 'activated' || status === 'stored' || status === 'deployed';
}

function computeRetryDelayMs(policy: RuntimeEnvironmentRetryPolicy, attemptCount: number): number {
  const exponential = policy.baseDelayMs * (2 ** Math.max(attemptCount - 1, 0));
  const clamped = Math.min(exponential, policy.maxDelayMs);
  const jitter = Math.floor(Math.random() * Math.max(policy.baseDelayMs, 1));

  return clamped + jitter;
}

async function resolveRetryPolicy(environment: RuntimeEnvironmentKey): Promise<RuntimeEnvironmentRetryPolicy> {
  const settings = await loadDeploymentEnvironmentSettings();
  if (!settings) {
    return DEFAULT_RETRY_POLICY;
  }

  return getRuntimeEnvironmentConfig(settings, environment).retryPolicy;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(ms, 0));
  });
}

export const orchestrationRetry = {
  executeRuntimeOperationWithRetry,
};
