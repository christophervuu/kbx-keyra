import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  loadDeploymentPageQueryData,
  type DeploymentPageQueryData,
} from './deployment-query-data';

import { useAdapter } from '@/lib/api';
import type {
  CurrentDeployments,
  DeploymentOperationAcceptedResponse,
  DeploymentOperationStatusResponse,
  DeploymentOrchestrationStatus,
  DeploymentRecord,
  DeploymentSourceType,
} from '@/lib/api/types';
import {
  cancelDeploymentContextReads,
  invalidateDeploymentDependents,
  queryKeys,
  queryPolicies,
} from '@/lib/query';
import { toAppError } from '@/lib/state/app-error';
import type { Environment, MappingVersion } from '@/lib/types';

const ACTIVE_DEPLOYMENT_OPERATION_STORAGE_KEY = 'keyra:active-deployment-operation';
const OPERATION_POLL_INTERVAL_MS = 2_500;

type RuntimeEnvironment = 'DEV' | 'PREPROD' | 'PROD';

type DeploymentActionKind = 'deploy' | 'promote' | 'rollback';

interface ActiveDeploymentOperationState {
  readonly mappingId: string;
  readonly operationId: string;
  readonly actionKind: DeploymentActionKind;
  readonly targetEnvironment: RuntimeEnvironment;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeployTarget = Environment;

export interface DeploymentUiErrorDetails {
  readonly message: string;
  readonly requestId?: string;
  readonly code?: string;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly details?: unknown;
}

export interface DeployInput {
  environment: Environment;
  sourceType: DeploymentSourceType;
  sourceNumber: number;
}

export interface UseDeploymentPageResult {
  environment: DeployTarget;
  setEnvironment: (env: DeployTarget) => void;

  versions: readonly MappingVersion[];
  currentDeployments: CurrentDeployments | null;

  deploymentHistory: readonly DeploymentRecord[];
  isHistoryLoading: boolean;
  historyError: DeploymentUiErrorDetails | null;

  isLoading: boolean;
  error: DeploymentUiErrorDetails | null;

  isRefreshing: boolean;
  refreshError: DeploymentUiErrorDetails | null;
  lastUpdatedAt: string | null;

  isDeploying: boolean;
  deployFeedback:
    | {
      kind: 'success';
      message: string;
      orchestration?: DeploymentActionOrchestrationDetails;
      artifact?: DeploymentActionArtifactDetails;
    }
    | {
      kind: 'error';
      message: string;
      requestId?: string;
      technicalDetails?: DeploymentUiErrorDetails;
      cdmBlockIssues?: readonly CdmDeployBlockUiIssue[];
      orchestration?: DeploymentActionOrchestrationDetails;
      artifact?: DeploymentActionArtifactDetails;
    }
    | null;
  clearDeployFeedback: () => void;

  deploy: (input: DeployInput) => Promise<void>;
  promote: (fromEnvironment: Environment, toEnvironment: Environment, reason?: string) => Promise<void>;
  rollback: (environment: Environment, deploymentSK: string, reason: string) => Promise<void>;

  refresh: () => void;
}

export type CdmDeployBlockUiIssueReason =
  | 'unsynced'
  | 'update-failed'
  | 'metadata-incomplete'
  | 'ingest-not-ready'
  | 'schema-missing';

export type CdmDeployBlockUiIssueRemediation =
  | 're-sync-schema'
  | 'retry-sync'
  | 'relink-cdm-schema'
  | 'complete-ingestion';

export interface CdmDeployBlockUiIssue {
  readonly schemaId: string;
  readonly schemaName?: string;
  readonly referenceRole: 'source' | 'target';
  readonly reason: CdmDeployBlockUiIssueReason;
  readonly remediationKey: CdmDeployBlockUiIssueRemediation;
}

export interface DeploymentActionOrchestrationDetails {
  readonly orchestrationId?: string;
  readonly status?: DeploymentOrchestrationStatus;
  readonly attemptCount?: number;
  readonly finalStatus?: DeploymentOrchestrationStatus;
}

export interface DeploymentActionArtifactDetails {
  readonly artifactId?: string;
  readonly artifactHash?: string;
}

const EMPTY_VERSIONS: readonly MappingVersion[] = [];
const EMPTY_DEPLOYMENT_HISTORY: readonly DeploymentRecord[] = [];

interface OrchestrationErrorDetails {
  readonly orchestrationId?: unknown;
  readonly attemptCount?: unknown;
  readonly finalStatus?: unknown;
  readonly status?: unknown;
  readonly artifactId?: unknown;
  readonly artifactHash?: unknown;
}

function isOrchestrationStatus(value: unknown): value is DeploymentOrchestrationStatus {
  return (
    value === 'queued' ||
    value === 'in_progress' ||
    value === 'retrying' ||
    value === 'succeeded' ||
    value === 'failed' ||
    value === 'timed_out'
  );
}

function parseOrchestrationDetails(error: unknown): {
  orchestration?: DeploymentActionOrchestrationDetails;
  artifact?: DeploymentActionArtifactDetails;
} {
  const appError = toAppError(error);
  const details = appError.details as OrchestrationErrorDetails | undefined;
  if (!details || typeof details !== 'object') {
    return {};
  }

  const orchestration: DeploymentActionOrchestrationDetails = {
    ...(typeof details.orchestrationId === 'string' ? { orchestrationId: details.orchestrationId } : {}),
    ...(typeof details.attemptCount === 'number' ? { attemptCount: details.attemptCount } : {}),
    ...(isOrchestrationStatus(details.status) ? { status: details.status } : {}),
    ...(isOrchestrationStatus(details.finalStatus) ? { finalStatus: details.finalStatus } : {}),
  };

  const artifact: DeploymentActionArtifactDetails = {
    ...(typeof details.artifactId === 'string' ? { artifactId: details.artifactId } : {}),
    ...(typeof details.artifactHash === 'string' ? { artifactHash: details.artifactHash } : {}),
  };

  return {
    ...(Object.keys(orchestration).length > 0 ? { orchestration } : {}),
    ...(Object.keys(artifact).length > 0 ? { artifact } : {}),
  };
}

interface CdmDeployBlockDetails {
  readonly issues?: unknown;
}

function createIdempotencyKey(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function toRuntimeEnvironment(env: Environment): RuntimeEnvironment {
  if (env === 'QA') {
    return 'PREPROD';
  }

  if (env === 'DEV' || env === 'PREPROD' || env === 'PROD') {
    return env;
  }

  return 'DEV';
}

function readActiveDeploymentOperationState(mappingId: string): ActiveDeploymentOperationState | null {
  try {
    const raw = localStorage.getItem(ACTIVE_DEPLOYMENT_OPERATION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as ActiveDeploymentOperationState;
    if (!parsed || parsed.mappingId !== mappingId) {
      return null;
    }

    if (
      typeof parsed.operationId !== 'string'
      || (parsed.actionKind !== 'deploy' && parsed.actionKind !== 'promote' && parsed.actionKind !== 'rollback')
      || (parsed.targetEnvironment !== 'DEV' && parsed.targetEnvironment !== 'PREPROD' && parsed.targetEnvironment !== 'PROD')
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeActiveDeploymentOperationState(state: ActiveDeploymentOperationState | null): void {
  try {
    if (!state) {
      localStorage.removeItem(ACTIVE_DEPLOYMENT_OPERATION_STORAGE_KEY);
      return;
    }

    localStorage.setItem(ACTIVE_DEPLOYMENT_OPERATION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
}

function isTerminalOperationStatus(status: DeploymentOperationStatusResponse['operationStatus']): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED' || status === 'TIMED_OUT';
}

function toOrchestrationStatus(
  status: DeploymentOperationStatusResponse['operationStatus'],
): DeploymentOrchestrationStatus {
  if (status === 'QUEUED') return 'queued';
  if (status === 'RUNNING') return 'in_progress';
  if (status === 'SUCCEEDED') return 'succeeded';
  if (status === 'FAILED') return 'failed';
  return 'timed_out';
}

function formatErrorMessage(error: unknown, fallback: string): string {
  const appError = toAppError(error);
  return appError.message || fallback;
}

function toDeploymentUiError(error: unknown, fallback: string): DeploymentUiErrorDetails {
  const appError = toAppError(error);

  return {
    message: appError.message || fallback,
    ...(typeof appError.requestId === 'string' && appError.requestId.trim() !== ''
      ? { requestId: appError.requestId }
      : {}),
    ...(typeof appError.code === 'string' && appError.code.trim() !== '' ? { code: appError.code } : {}),
    ...(typeof appError.statusCode === 'number' ? { statusCode: appError.statusCode } : {}),
    retryable: appError.retryable,
    ...(appError.details !== undefined ? { details: appError.details } : {}),
  };
}

function isReferenceRole(value: unknown): value is CdmDeployBlockUiIssue['referenceRole'] {
  return value === 'source' || value === 'target';
}

function isIssueReason(value: unknown): value is CdmDeployBlockUiIssueReason {
  return (
    value === 'unsynced' ||
    value === 'update-failed' ||
    value === 'metadata-incomplete' ||
    value === 'ingest-not-ready' ||
    value === 'schema-missing'
  );
}

function isRemediationKey(value: unknown): value is CdmDeployBlockUiIssueRemediation {
  return (
    value === 're-sync-schema' ||
    value === 'retry-sync' ||
    value === 'relink-cdm-schema' ||
    value === 'complete-ingestion'
  );
}

function parseCdmDeployBlockIssues(error: unknown): readonly CdmDeployBlockUiIssue[] | undefined {
  const appError = toAppError(error);
  if (appError.code !== 'DEPLOY_BLOCKED_CDM_SCHEMA_STATE') {
    return undefined;
  }

  const details = appError.details as CdmDeployBlockDetails | undefined;
  if (!details || !Array.isArray(details.issues)) {
    return [];
  }

  const parsed: CdmDeployBlockUiIssue[] = [];
  for (const issue of details.issues) {
    if (!issue || typeof issue !== 'object') {
      continue;
    }

    const typed = issue as {
      schemaId?: unknown;
      schemaName?: unknown;
      referenceRole?: unknown;
      reason?: unknown;
      remediationKey?: unknown;
    };

    if (
      typeof typed.schemaId !== 'string' ||
      !isReferenceRole(typed.referenceRole) ||
      !isIssueReason(typed.reason) ||
      !isRemediationKey(typed.remediationKey)
    ) {
      continue;
    }

    parsed.push({
      schemaId: typed.schemaId,
      ...(typeof typed.schemaName === 'string' ? { schemaName: typed.schemaName } : {}),
      referenceRole: typed.referenceRole,
      reason: typed.reason,
      remediationKey: typed.remediationKey,
    });
  }

  return parsed;
}

export function useDeploymentPage(mappingId: string): UseDeploymentPageResult {
  const adapter = useAdapter();
  const queryClient = useQueryClient();

  const [environment, setEnvironmentState] = useState<DeployTarget>('DEV');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployFeedback, setDeployFeedback] = useState<UseDeploymentPageResult['deployFeedback']>(null);
  const [activeOperation, setActiveOperation] = useState<ActiveDeploymentOperationState | null>(() =>
    readActiveDeploymentOperationState(mappingId),
  );
  const pollingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setActiveOperation(readActiveDeploymentOperationState(mappingId));
  }, [mappingId]);

  const deploymentQueryKey = queryKeys.deployments.context(mappingId);

  const deploymentQuery = useQuery<DeploymentPageQueryData>({
    queryKey: deploymentQueryKey,
    staleTime: queryPolicies.deploymentSummaryContext.staleTime,
    gcTime: queryPolicies.deploymentSummaryContext.gcTime,
    retry: false,
    refetchOnWindowFocus: true,
    queryFn: () => loadDeploymentPageQueryData(adapter, mappingId),
  });

  const patchDeploymentData = useCallback(
    (updater: (current: DeploymentPageQueryData) => DeploymentPageQueryData) => {
      queryClient.setQueryData<DeploymentPageQueryData | undefined>(deploymentQueryKey, (current) => {
        if (!current) {
          return current;
        }

        return updater(current);
      });
    },
    [deploymentQueryKey, queryClient],
  );

  const isLoading = !deploymentQuery.data && deploymentQuery.isPending;
  const loadError = deploymentQuery.isError ? toDeploymentUiError(deploymentQuery.error, 'Failed to load deployment data') : null;
  const error = loadError && !deploymentQuery.data ? loadError : null;

  const isRefreshing = deploymentQuery.isFetching && Boolean(deploymentQuery.data);
  const refreshError = loadError && deploymentQuery.data ? loadError : null;
  const lastUpdatedAt = deploymentQuery.dataUpdatedAt
    ? new Date(deploymentQuery.dataUpdatedAt).toISOString()
    : null;

  const versions = deploymentQuery.data?.versions ?? EMPTY_VERSIONS;
  const currentDeployments = deploymentQuery.data?.currentDeployments ?? null;
  const deploymentHistory = deploymentQuery.data?.deploymentHistory ?? EMPTY_DEPLOYMENT_HISTORY;

  const isHistoryLoading = isLoading;
  const historyError = error;

  const refreshCurrentDeployments = useCallback(async () => {
    try {
      const updated = await adapter.getCurrentDeployments(mappingId);
      patchDeploymentData((current) => ({
        ...current,
        currentDeployments: updated,
      }));
    } catch {
      // non-critical
    }
  }, [adapter, mappingId, patchDeploymentData]);

  const refreshHistory = useCallback(async () => {
    try {
      const records = await adapter.listDeployments(mappingId);
      const sortedHistory = [...records].sort(
        (a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime(),
      );
      patchDeploymentData((current) => ({
        ...current,
        deploymentHistory: sortedHistory,
      }));
    } catch {
      // non-critical
    }
  }, [adapter, mappingId, patchDeploymentData]);

  const refreshDeploymentData = useCallback(async () => {
    await cancelDeploymentContextReads(queryClient, mappingId);
    await Promise.all([refreshCurrentDeployments(), refreshHistory()]);
    invalidateDeploymentDependents(queryClient, mappingId);
  }, [mappingId, queryClient, refreshCurrentDeployments, refreshHistory]);

  const clearPollingTimer = useCallback(() => {
    if (pollingTimerRef.current !== null) {
      window.clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const stopOperationPolling = useCallback(() => {
    clearPollingTimer();
    setActiveOperation(null);
    writeActiveDeploymentOperationState(null);
  }, [clearPollingTimer]);

  const applyOperationSuccessFeedback = useCallback(
    async (
      context: ActiveDeploymentOperationState,
      operation: DeploymentOperationStatusResponse,
    ) => {
      const status = toOrchestrationStatus(operation.operationStatus);

      if (context.actionKind === 'deploy') {
        setDeployFeedback({
          kind: 'success',
          message: `Deployment to ${context.targetEnvironment} completed successfully.`,
          orchestration: {
            orchestrationId: operation.operationId,
            status,
            finalStatus: status,
          },
          artifact: {
            ...(operation.artifactId ? { artifactId: operation.artifactId } : {}),
            ...(operation.artifactHash ? { artifactHash: operation.artifactHash } : {}),
          },
        });
      } else if (context.actionKind === 'promote') {
        setDeployFeedback({
          kind: 'success',
          message: `Promotion to ${context.targetEnvironment} completed successfully.`,
          orchestration: {
            orchestrationId: operation.operationId,
            status,
            finalStatus: status,
          },
          artifact: {
            ...(operation.artifactId ? { artifactId: operation.artifactId } : {}),
            ...(operation.artifactHash ? { artifactHash: operation.artifactHash } : {}),
          },
        });
      } else {
        setDeployFeedback({
          kind: 'success',
          message: `Rollback in ${context.targetEnvironment} completed successfully.`,
          orchestration: {
            orchestrationId: operation.operationId,
            status,
            finalStatus: status,
          },
          artifact: {
            ...(operation.artifactId ? { artifactId: operation.artifactId } : {}),
            ...(operation.artifactHash ? { artifactHash: operation.artifactHash } : {}),
          },
        });
      }

      await refreshDeploymentData();
      stopOperationPolling();
      setIsDeploying(false);
    },
    [refreshDeploymentData, stopOperationPolling],
  );

  const applyOperationFailureFeedback = useCallback(
    (
      context: ActiveDeploymentOperationState,
      operation: DeploymentOperationStatusResponse,
    ) => {
      const status = toOrchestrationStatus(operation.operationStatus);
      const failureMessage = operation.failureMessage
        ?? `Deployment operation failed during ${operation.operationStage ?? 'FINALIZING'}.`;

      setDeployFeedback({
        kind: 'error',
        message: failureMessage,
        technicalDetails: {
          message: failureMessage,
          ...(operation.failureCode ? { code: operation.failureCode } : {}),
          retryable: operation.retryable ?? false,
          details: {
            operationId: operation.operationId,
            operationStatus: operation.operationStatus,
            operationStage: operation.operationStage,
            actionKind: context.actionKind,
            targetEnvironment: context.targetEnvironment,
          },
        },
        orchestration: {
          orchestrationId: operation.operationId,
          status,
          finalStatus: status,
        },
        artifact: {
          ...(operation.artifactId ? { artifactId: operation.artifactId } : {}),
          ...(operation.artifactHash ? { artifactHash: operation.artifactHash } : {}),
        },
      });

      stopOperationPolling();
      setIsDeploying(false);
    },
    [stopOperationPolling],
  );

  const setEnvironment = useCallback((env: Environment) => {
    if (env === 'QA') {
      setEnvironmentState('PREPROD');
      return;
    }
    setEnvironmentState(env);
  }, []);

  useEffect(() => {
    writeActiveDeploymentOperationState(activeOperation);
  }, [activeOperation]);

  useEffect(() => {
    if (!activeOperation || activeOperation.mappingId !== mappingId) {
      clearPollingTimer();
      if (!activeOperation) {
        setIsDeploying(false);
      }
      return;
    }

    if (!adapter.getDeploymentOperation) {
      setDeployFeedback({
        kind: 'error',
        message: 'Deployment operation polling is not available in this adapter mode.',
        technicalDetails: {
          message: 'Missing ApiAdapter.getDeploymentOperation implementation',
          code: 'FEATURE_NOT_ENABLED',
          retryable: false,
        },
      });
      stopOperationPolling();
      setIsDeploying(false);
      return;
    }

    let cancelled = false;

    const pollOnce = async () => {
      try {
        const operation = await adapter.getDeploymentOperation!(activeOperation.operationId);
        if (cancelled) {
          return;
        }

        if (isTerminalOperationStatus(operation.operationStatus)) {
          if (operation.operationStatus === 'SUCCEEDED') {
            await applyOperationSuccessFeedback(activeOperation, operation);
          } else {
            applyOperationFailureFeedback(activeOperation, operation);
          }
          return;
        }

        pollingTimerRef.current = window.setTimeout(() => {
          void pollOnce();
        }, OPERATION_POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) {
          return;
        }

        const technicalDetails = toDeploymentUiError(err, 'Failed to poll deployment operation status');
        setDeployFeedback({
          kind: 'error',
          message: technicalDetails.message,
          ...(technicalDetails.requestId ? { requestId: technicalDetails.requestId } : {}),
          technicalDetails,
          orchestration: {
            orchestrationId: activeOperation.operationId,
          },
        });
        stopOperationPolling();
        setIsDeploying(false);
      }
    };

    clearPollingTimer();
    setIsDeploying(true);
    void pollOnce();

    return () => {
      cancelled = true;
      clearPollingTimer();
    };
  }, [
    activeOperation,
    adapter,
    applyOperationFailureFeedback,
    applyOperationSuccessFeedback,
    clearPollingTimer,
    mappingId,
    stopOperationPolling,
  ]);

  const deploy = useCallback(
    async (input: DeployInput): Promise<void> => {
      setIsDeploying(true);
      setDeployFeedback(null);
      try {
        if (adapter.startDeployOperation) {
          const runtimeEnvironment = toRuntimeEnvironment(input.environment);
          const currentActiveArtifactId =
            runtimeEnvironment === 'DEV'
              ? currentDeployments?.DEV.deployment?.artifactId ?? null
              : runtimeEnvironment === 'PREPROD'
                ? currentDeployments?.PREPROD.deployment?.artifactId ?? null
                : currentDeployments?.PROD.deployment?.artifactId ?? null;

          const accepted: DeploymentOperationAcceptedResponse = await adapter.startDeployOperation(
            mappingId,
            {
              version: input.sourceNumber,
              targetEnvironment: runtimeEnvironment,
              expectedActiveArtifactId: currentActiveArtifactId,
            },
            createIdempotencyKey(`deploy:${mappingId}:${runtimeEnvironment}`),
          );

          setActiveOperation({
            mappingId,
            operationId: accepted.operationId,
            actionKind: 'deploy',
            targetEnvironment: runtimeEnvironment,
          });
        } else {
          const record: DeploymentRecord = await adapter.deployMapping(mappingId, input);
          const label =
            record.sourceType === 'revision'
              ? `Rev ${record.sourceNumber}`
              : `v${record.sourceNumber}`;
          setDeployFeedback({
            kind: 'success',
            message: `${label} deployed to ${record.environment} successfully.`,
            orchestration: {
              orchestrationId: record.orchestrationId,
              status: 'succeeded',
            },
            artifact: {
              artifactId: record.artifactId,
              artifactHash: record.artifactHash,
            },
          });

          await refreshDeploymentData();
          setIsDeploying(false);
        }
      } catch (err) {
        const cdmBlockIssues = parseCdmDeployBlockIssues(err);
        const technicalDetails = toDeploymentUiError(err, 'Deploy failed');
        const message = formatErrorMessage(err, 'Deploy failed');
        const details = parseOrchestrationDetails(err);
        setDeployFeedback({
          kind: 'error',
          message,
          ...(technicalDetails.requestId ? { requestId: technicalDetails.requestId } : {}),
          technicalDetails,
          ...(cdmBlockIssues ? { cdmBlockIssues } : {}),
          ...details,
        });
        setIsDeploying(false);
      }
    },
    [
      adapter,
      currentDeployments,
      mappingId,
      refreshDeploymentData,
    ],
  );

  const promote = useCallback(
    async (fromEnvironment: Environment, toEnvironment: Environment, reason?: string): Promise<void> => {
      setIsDeploying(true);
      setDeployFeedback(null);
      try {
        const sourceEnvironment = toRuntimeEnvironment(fromEnvironment);
        const targetEnvironment = toRuntimeEnvironment(toEnvironment);

        if (adapter.startPromotionOperation) {
          const expectedSourceArtifactId =
            sourceEnvironment === 'DEV'
              ? currentDeployments?.DEV.deployment?.artifactId
              : sourceEnvironment === 'PREPROD'
                ? currentDeployments?.PREPROD.deployment?.artifactId
                : currentDeployments?.PROD.deployment?.artifactId;

          if (!expectedSourceArtifactId) {
            throw new Error(`No active ${sourceEnvironment} artifact found for promotion.`);
          }

          const expectedTargetArtifactId =
            targetEnvironment === 'DEV'
              ? currentDeployments?.DEV.deployment?.artifactId ?? null
              : targetEnvironment === 'PREPROD'
                ? currentDeployments?.PREPROD.deployment?.artifactId ?? null
                : currentDeployments?.PROD.deployment?.artifactId ?? null;

          const accepted = await adapter.startPromotionOperation(
            mappingId,
            {
              sourceEnvironment,
              targetEnvironment,
              expectedSourceArtifactId,
              expectedTargetArtifactId,
              ...(typeof reason === 'string' && reason.trim().length > 0 ? { reason: reason.trim() } : {}),
            },
            createIdempotencyKey(`promote:${mappingId}:${sourceEnvironment}:${targetEnvironment}`),
          );

          setActiveOperation({
            mappingId,
            operationId: accepted.operationId,
            actionKind: 'promote',
            targetEnvironment,
          });
        } else {
          const record = await adapter.promoteDeployment(mappingId, {
            fromEnvironment: sourceEnvironment,
            toEnvironment: targetEnvironment,
          });
          const label = `v${record.sourceNumber}`;
          setDeployFeedback({
            kind: 'success',
            message: `${label} promoted from ${sourceEnvironment} to ${targetEnvironment} successfully.`,
            orchestration: {
              orchestrationId: record.orchestrationId,
              status: 'succeeded',
            },
            artifact: {
              artifactId: record.artifactId,
              artifactHash: record.artifactHash,
            },
          });

          await refreshDeploymentData();
          setIsDeploying(false);
        }
      } catch (err) {
        const cdmBlockIssues = parseCdmDeployBlockIssues(err);
        const technicalDetails = toDeploymentUiError(err, 'Promote failed');
        const message = formatErrorMessage(err, 'Promote failed');
        const details = parseOrchestrationDetails(err);
        setDeployFeedback({
          kind: 'error',
          message,
          ...(technicalDetails.requestId ? { requestId: technicalDetails.requestId } : {}),
          technicalDetails,
          ...(cdmBlockIssues ? { cdmBlockIssues } : {}),
          ...details,
        });
        setIsDeploying(false);
      }
    },
    [adapter, currentDeployments, mappingId, refreshDeploymentData],
  );

  const rollback = useCallback(
    async (env: Environment, deploymentSK: string, reason: string): Promise<void> => {
      setIsDeploying(true);
      setDeployFeedback(null);
      try {
        const runtimeEnvironment = toRuntimeEnvironment(env);

        if (adapter.startRollbackOperation) {
          const targetRecord = deploymentHistory.find((record) => record.environmentDeployedAt === deploymentSK);
          if (!targetRecord?.artifactId) {
            throw new Error('Rollback target artifact is missing.');
          }

          const expectedActiveArtifactId =
            runtimeEnvironment === 'DEV'
              ? currentDeployments?.DEV.deployment?.artifactId
              : runtimeEnvironment === 'PREPROD'
                ? currentDeployments?.PREPROD.deployment?.artifactId
                : currentDeployments?.PROD.deployment?.artifactId;

          if (!expectedActiveArtifactId) {
            throw new Error(`No active ${runtimeEnvironment} artifact found for rollback.`);
          }

          const accepted = await adapter.startRollbackOperation(
            mappingId,
            {
              environment: runtimeEnvironment,
              targetArtifactId: targetRecord.artifactId,
              expectedActiveArtifactId,
              reason,
            },
            createIdempotencyKey(`rollback:${mappingId}:${runtimeEnvironment}:${deploymentSK}`),
          );

          setActiveOperation({
            mappingId,
            operationId: accepted.operationId,
            actionKind: 'rollback',
            targetEnvironment: runtimeEnvironment,
          });
        } else {
          const record = await adapter.rollbackDeployment(mappingId, {
            environment: runtimeEnvironment,
            deploymentSK,
          });
          const label =
            record.sourceType === 'revision'
              ? `Rev ${record.sourceNumber}`
              : `v${record.sourceNumber}`;
          setDeployFeedback({
            kind: 'success',
            message: `Rolled back ${runtimeEnvironment} to ${label}.`,
            orchestration: {
              orchestrationId: record.orchestrationId,
              status: 'succeeded',
            },
            artifact: {
              artifactId: record.artifactId,
              artifactHash: record.artifactHash,
            },
          });

          await refreshDeploymentData();
          setIsDeploying(false);
        }
      } catch (err) {
        const technicalDetails = toDeploymentUiError(err, 'Rollback failed');
        const message = formatErrorMessage(err, 'Rollback failed');
        const details = parseOrchestrationDetails(err);
        setDeployFeedback({
          kind: 'error',
          message,
          ...(technicalDetails.requestId ? { requestId: technicalDetails.requestId } : {}),
          technicalDetails,
          ...details,
        });
        setIsDeploying(false);
      }
    },
    [adapter, currentDeployments, deploymentHistory, mappingId, refreshDeploymentData],
  );

  const clearDeployFeedback = useCallback(() => setDeployFeedback(null), []);

  const refresh = useCallback(() => {
    void deploymentQuery.refetch();
  }, [deploymentQuery]);

  useEffect(() => {
    return () => {
      clearPollingTimer();
    };
  }, [clearPollingTimer]);

  const result = useMemo<UseDeploymentPageResult>(
    () => ({
      environment,
      setEnvironment,
      versions,
      currentDeployments,
      deploymentHistory,
      isHistoryLoading,
      historyError,
      isLoading,
      error,
      isRefreshing,
      refreshError,
      lastUpdatedAt,
      isDeploying,
      deployFeedback,
      clearDeployFeedback,
      deploy,
      promote,
      rollback,
      refresh,
    }),
    [
      clearDeployFeedback,
      currentDeployments,
      deploy,
      deployFeedback,
      deploymentHistory,
      environment,
      error,
      historyError,
      isDeploying,
      isHistoryLoading,
      isLoading,
      isRefreshing,
      lastUpdatedAt,
      promote,
      refresh,
      refreshError,
      rollback,
      setEnvironment,
      versions,
    ],
  );

  return result;
}
