// Hook: useDashboardData (FS-014 T-02, FS-103 T-03)
// Loads dashboard data through TanStack Query, computes DashboardMetrics,
// and preserves initial loading vs background-refresh semantics.

import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import type {
  DashboardLoadState,
  DashboardMetrics,
  ProjectListItem,
} from '../types';
import { loadDashboardDataQueryData } from './dashboard-query-data';

import { useAdapter } from '@/lib/api';
import { queryKeys, queryPolicies } from '@/lib/query';

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseDashboardDataResult {
  loadState: DashboardLoadState;
  isRefreshing: boolean;
  refreshError: Error | null;
  lastUpdatedAt: string | null;
  metrics: DashboardMetrics | null;
  projects: ProjectListItem[];
  schemaCount: number;
  retry: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDashboardData(): UseDashboardDataResult {
  const adapter = useAdapter();

  const dashboardQuery = useQuery({
    queryKey: queryKeys.home.dashboard(),
    staleTime: queryPolicies.homeDashboard.staleTime,
    gcTime: queryPolicies.homeDashboard.gcTime,
    retry: false,
    queryFn: () => loadDashboardDataQueryData(adapter),
  });

  const loadState: DashboardLoadState =
    !dashboardQuery.data && dashboardQuery.isPending
      ? 'loading'
      : dashboardQuery.isError && !dashboardQuery.data
        ? 'error'
        : 'loaded';

  const isRefreshing = dashboardQuery.isFetching && Boolean(dashboardQuery.data);
  const refreshError = dashboardQuery.error && dashboardQuery.data ? dashboardQuery.error : null;
  const lastUpdatedAt = dashboardQuery.dataUpdatedAt
    ? new Date(dashboardQuery.dataUpdatedAt).toISOString()
    : null;

  const retry = useCallback(() => {
    void dashboardQuery.refetch();
  }, [dashboardQuery]);

  const metrics = dashboardQuery.data?.metrics ?? null;
  const projects = useMemo(() => dashboardQuery.data?.projects ?? [], [dashboardQuery.data?.projects]);
  const schemaCount = dashboardQuery.data?.schemaCount ?? 0;

  return {
    loadState,
    isRefreshing,
    refreshError,
    lastUpdatedAt,
    metrics,
    projects,
    schemaCount,
    retry,
  };
}
