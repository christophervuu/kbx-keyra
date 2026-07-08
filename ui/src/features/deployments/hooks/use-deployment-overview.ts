import { useQuery } from '@tanstack/react-query';

import { useAdapter } from '@/lib/api';
import type {
  DeploymentOverviewAttentionState,
  DeploymentOverviewFreshness,
  DeploymentOverviewItem,
  DeploymentOverviewOperationStatus,
} from '@/lib/api/types';
import { queryKeys, queryPolicies } from '@/lib/query';

export interface DeploymentOverviewFilters {
  readonly environment?: 'DEV' | 'PREPROD' | 'PROD';
  readonly freshness?: DeploymentOverviewFreshness;
  readonly attentionState?: DeploymentOverviewAttentionState;
  readonly operationStatus?: DeploymentOverviewOperationStatus;
  readonly version?: number;
  readonly search?: string;
  readonly pageSize: number;
  readonly cursor?: string;
}

export interface DeploymentOverviewResult {
  readonly items: readonly DeploymentOverviewItem[];
  readonly summary: {
    readonly failedCount: number;
    readonly attentionCount: number;
  };
  readonly nextCursor: string | null;
  readonly returned: number;
  readonly totalMatched: number;
  readonly isLoading: boolean;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly errorMessage?: string;
  readonly refetch: () => void;
}

export function useGlobalDeploymentOverview(
  filters: DeploymentOverviewFilters,
  options?: { enabled?: boolean },
): DeploymentOverviewResult {
  const adapter = useAdapter();
  const hasOverviewApi = typeof adapter.listGlobalDeploymentSummaries === 'function';

  const fallbackErrorMessage = options?.enabled === false
    ? undefined
    : hasOverviewApi
      ? undefined
      : 'Deployment overview API is not available in this adapter mode.';

  const query = useQuery({
    queryKey: queryKeys.deployments.globalOverview(filters),
    staleTime: queryPolicies.deploymentSummaryContext.staleTime,
    gcTime: queryPolicies.deploymentSummaryContext.gcTime,
    enabled: (options?.enabled ?? true) && hasOverviewApi,
    queryFn: async () => {
      if (!adapter.listGlobalDeploymentSummaries) {
        throw new Error('Deployment overview API is not available in this adapter mode.');
      }

      const { cursor, ...requestFilters } = filters;
      return adapter.listGlobalDeploymentSummaries(requestFilters);
    },
  });

  const isApiUnavailable = Boolean(fallbackErrorMessage) && query.fetchStatus === 'idle';

  return {
    items: query.data?.items ?? [],
    summary: query.data?.summary ?? { failedCount: 0, attentionCount: 0 },
    nextCursor: query.data?.page.nextCursor ?? null,
    returned: query.data?.page.returned ?? 0,
    totalMatched: query.data?.page.totalMatched ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError || isApiUnavailable,
    ...(query.error
      ? { errorMessage: query.error.message }
      : fallbackErrorMessage
        ? { errorMessage: fallbackErrorMessage }
        : {}),
    refetch: () => {
      void query.refetch();
    },
  };
}

export function useProjectDeploymentOverview(
  projectId: string,
  filters: DeploymentOverviewFilters,
  options?: { enabled?: boolean },
): DeploymentOverviewResult {
  const adapter = useAdapter();
  const hasOverviewApi = typeof adapter.listProjectDeploymentSummaries === 'function';

  const fallbackErrorMessage = options?.enabled === false
    ? undefined
    : hasOverviewApi
      ? undefined
      : 'Project deployment overview API is not available in this adapter mode.';

  const query = useQuery({
    queryKey: queryKeys.deployments.projectOverview(projectId, filters),
    staleTime: queryPolicies.deploymentSummaryContext.staleTime,
    gcTime: queryPolicies.deploymentSummaryContext.gcTime,
    enabled: (options?.enabled ?? true) && projectId.trim().length > 0 && hasOverviewApi,
    queryFn: async () => {
      if (!adapter.listProjectDeploymentSummaries) {
        throw new Error('Project deployment overview API is not available in this adapter mode.');
      }

      const { cursor, ...requestFilters } = filters;
      return adapter.listProjectDeploymentSummaries(projectId, requestFilters);
    },
  });

  const isApiUnavailable = Boolean(fallbackErrorMessage) && query.fetchStatus === 'idle';

  return {
    items: query.data?.items ?? [],
    summary: query.data?.summary ?? { failedCount: 0, attentionCount: 0 },
    nextCursor: query.data?.page.nextCursor ?? null,
    returned: query.data?.page.returned ?? 0,
    totalMatched: query.data?.page.totalMatched ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError || isApiUnavailable,
    ...(query.error
      ? { errorMessage: query.error.message }
      : fallbackErrorMessage
        ? { errorMessage: fallbackErrorMessage }
        : {}),
    refetch: () => {
      void query.refetch();
    },
  };
}
