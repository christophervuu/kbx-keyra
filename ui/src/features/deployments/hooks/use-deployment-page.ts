import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import {
  loadDeploymentPageQueryData,
  type DeploymentPageQueryData,
} from './deployment-query-data';

import { useAdapter } from '@/lib/api';
import type {
  CurrentDeployments,
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
  promote: (fromEnvironment: Environment, toEnvironment: Environment) => Promise<void>;
  rollback: (environment: Environment, deploymentSK: string) => Promise<void>;

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

  const [environment, setEnvironmentState] = useState<DeployTarget>('SANDBOX');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployFeedback, setDeployFeedback] = useState<UseDeploymentPageResult['deployFeedback']>(null);

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

  const setEnvironment = useCallback((env: Environment) => {
    setEnvironmentState(env);
  }, []);

  const deploy = useCallback(
    async (input: DeployInput): Promise<void> => {
      setIsDeploying(true);
      setDeployFeedback(null);
      try {
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

        await cancelDeploymentContextReads(queryClient, mappingId);
        await Promise.all([refreshCurrentDeployments(), refreshHistory()]);
        invalidateDeploymentDependents(queryClient, mappingId);
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
      } finally {
        setIsDeploying(false);
      }
    },
    [
      adapter,
      mappingId,
      queryClient,
      refreshCurrentDeployments,
      refreshHistory,
    ],
  );

  const promote = useCallback(
    async (fromEnvironment: Environment, toEnvironment: Environment): Promise<void> => {
      setIsDeploying(true);
      setDeployFeedback(null);
      try {
        const record = await adapter.promoteDeployment(mappingId, {
          fromEnvironment,
          toEnvironment,
        });
        const label = `v${record.sourceNumber}`;
        setDeployFeedback({
          kind: 'success',
          message: `${label} promoted from ${fromEnvironment} to ${toEnvironment} successfully.`,
          orchestration: {
            orchestrationId: record.orchestrationId,
            status: 'succeeded',
          },
          artifact: {
            artifactId: record.artifactId,
            artifactHash: record.artifactHash,
          },
        });

        await cancelDeploymentContextReads(queryClient, mappingId);
        await Promise.all([refreshCurrentDeployments(), refreshHistory()]);
        invalidateDeploymentDependents(queryClient, mappingId);
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
      } finally {
        setIsDeploying(false);
      }
    },
    [adapter, mappingId, queryClient, refreshCurrentDeployments, refreshHistory],
  );

  const rollback = useCallback(
    async (env: Environment, deploymentSK: string): Promise<void> => {
      setIsDeploying(true);
      setDeployFeedback(null);
      try {
        const record = await adapter.rollbackDeployment(mappingId, {
          environment: env,
          deploymentSK,
        });
        const label =
          record.sourceType === 'revision'
            ? `Rev ${record.sourceNumber}`
            : `v${record.sourceNumber}`;
        setDeployFeedback({
          kind: 'success',
          message: `Rolled back ${env} to ${label}.`,
          orchestration: {
            orchestrationId: record.orchestrationId,
            status: 'succeeded',
          },
          artifact: {
            artifactId: record.artifactId,
            artifactHash: record.artifactHash,
          },
        });

        await cancelDeploymentContextReads(queryClient, mappingId);
        await Promise.all([refreshCurrentDeployments(), refreshHistory()]);
        invalidateDeploymentDependents(queryClient, mappingId);
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
      } finally {
        setIsDeploying(false);
      }
    },
    [adapter, mappingId, queryClient, refreshCurrentDeployments, refreshHistory],
  );

  const clearDeployFeedback = useCallback(() => setDeployFeedback(null), []);

  const refresh = useCallback(() => {
    void deploymentQuery.refetch();
  }, [deploymentQuery]);

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
