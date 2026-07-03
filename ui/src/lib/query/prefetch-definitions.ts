import type { QueryClient, QueryFunction, QueryKey } from '@tanstack/react-query';

import { boundedPrefetchQuery, resetBoundedPrefetchState } from './prefetch';
import { queryKeys } from './query-keys';
import { queryPolicies } from './query-policies';

import { loadDeploymentPageQueryData } from '@/features/deployments/hooks/deployment-query-data';
import { loadDashboardDataQueryData } from '@/features/home/hooks/dashboard-query-data';
import {
  loadMappingEditorServerData,
  type MappingEditorQueryDataLoaders,
} from '@/features/mappings/hooks/mapping-editor-query-data';
import {
  loadProjectOverviewQueryData,
  type ProjectOverviewQueryData,
} from '@/features/projects/hooks/project-overview-query-data';
import type { ApiAdapter } from '@/lib/api';

export type PrefetchReason = 'hover' | 'focus' | 'intent';

export interface PrefetchDiagnosticsSnapshot {
  attempts: number;
  started: number;
  skipped: number;
  reasons: Record<PrefetchReason, number>;
  keys: Record<string, number>;
}

const IS_DEV = import.meta.env.DEV;
const PREFETCH_DIAGNOSTICS_SCOPE = 'keyra:query-prefetch';

const prefetchDiagnostics: PrefetchDiagnosticsSnapshot = {
  attempts: 0,
  started: 0,
  skipped: 0,
  reasons: {
    hover: 0,
    focus: 0,
    intent: 0,
  },
  keys: {},
};

function queryKeyToLogKey(queryKey: QueryKey): string {
  return JSON.stringify(queryKey);
}

function logPrefetchDiagnostics(
  reason: PrefetchReason,
  queryKey: QueryKey,
  started: boolean,
): void {
  prefetchDiagnostics.attempts += 1;
  prefetchDiagnostics.reasons[reason] += 1;

  const key = queryKeyToLogKey(queryKey);
  prefetchDiagnostics.keys[key] = (prefetchDiagnostics.keys[key] ?? 0) + 1;

  if (started) {
    prefetchDiagnostics.started += 1;
  } else {
    prefetchDiagnostics.skipped += 1;
  }

  if (!IS_DEV || typeof globalThis === 'undefined') {
    return;
  }

  const scopedGlobal = globalThis as {
    [PREFETCH_DIAGNOSTICS_SCOPE]?: PrefetchDiagnosticsSnapshot;
  };

  scopedGlobal[PREFETCH_DIAGNOSTICS_SCOPE] = {
    attempts: prefetchDiagnostics.attempts,
    started: prefetchDiagnostics.started,
    skipped: prefetchDiagnostics.skipped,
    reasons: {
      hover: prefetchDiagnostics.reasons.hover,
      focus: prefetchDiagnostics.reasons.focus,
      intent: prefetchDiagnostics.reasons.intent,
    },
    keys: { ...prefetchDiagnostics.keys },
  };

  // Lightweight dev-only observability (disabled in production builds).
  console.debug('[query-prefetch]', {
    reason,
    queryKey,
    started,
    attempts: prefetchDiagnostics.attempts,
    startedCount: prefetchDiagnostics.started,
    skippedCount: prefetchDiagnostics.skipped,
  });
}

export function getPrefetchDiagnosticsSnapshot(): PrefetchDiagnosticsSnapshot {
  return {
    attempts: prefetchDiagnostics.attempts,
    started: prefetchDiagnostics.started,
    skipped: prefetchDiagnostics.skipped,
    reasons: {
      hover: prefetchDiagnostics.reasons.hover,
      focus: prefetchDiagnostics.reasons.focus,
      intent: prefetchDiagnostics.reasons.intent,
    },
    keys: { ...prefetchDiagnostics.keys },
  };
}

export function resetPrefetchDiagnostics(): void {
  prefetchDiagnostics.attempts = 0;
  prefetchDiagnostics.started = 0;
  prefetchDiagnostics.skipped = 0;
  prefetchDiagnostics.reasons.hover = 0;
  prefetchDiagnostics.reasons.focus = 0;
  prefetchDiagnostics.reasons.intent = 0;
  prefetchDiagnostics.keys = {};
  resetBoundedPrefetchState();

  if (!IS_DEV || typeof globalThis === 'undefined') {
    return;
  }

  const scopedGlobal = globalThis as {
    [PREFETCH_DIAGNOSTICS_SCOPE]?: PrefetchDiagnosticsSnapshot;
  };

  delete scopedGlobal[PREFETCH_DIAGNOSTICS_SCOPE];
}

interface PrefetchCanonicalQueryInput<TData> {
  readonly queryClient: QueryClient;
  readonly queryKey: QueryKey;
  readonly queryFn: QueryFunction<TData, QueryKey>;
  readonly staleTime: number;
  readonly gcTime: number;
  readonly reason: PrefetchReason;
}

async function prefetchCanonicalQuery<TData>(
  input: PrefetchCanonicalQueryInput<TData>,
): Promise<boolean> {
  const started = await boundedPrefetchQuery({
    queryClient: input.queryClient,
    queryKey: input.queryKey,
    queryFn: input.queryFn,
    staleTime: input.staleTime,
    gcTime: input.gcTime,
  });

  logPrefetchDiagnostics(input.reason, input.queryKey, started);
  return started;
}

export async function prefetchDashboard(
  queryClient: QueryClient,
  adapter: ApiAdapter,
  reason: PrefetchReason,
): Promise<boolean> {
  return prefetchCanonicalQuery({
    queryClient,
    queryKey: queryKeys.home.dashboard(),
    queryFn: async () => loadDashboardDataQueryData(adapter),
    staleTime: queryPolicies.homeDashboard.staleTime,
    gcTime: queryPolicies.homeDashboard.gcTime,
    reason,
  });
}

export async function prefetchProjectOverviewByIntent(
  queryClient: QueryClient,
  adapter: ApiAdapter,
  projectId: string,
  reason: 'hover' | 'focus',
): Promise<boolean> {
  return prefetchProjectOverview(queryClient, adapter, projectId, reason);
}

export async function prefetchProjectOverview(
  queryClient: QueryClient,
  adapter: ApiAdapter,
  projectId: string,
  reason: PrefetchReason,
): Promise<boolean> {
  return prefetchCanonicalQuery<ProjectOverviewQueryData>({
    queryClient,
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: async () => loadProjectOverviewQueryData(adapter, projectId),
    staleTime: queryPolicies.projectDetail.staleTime,
    gcTime: queryPolicies.projectDetail.gcTime,
    reason,
  });
}

export async function prefetchMappingEditor(
  queryClient: QueryClient,
  adapter: ApiAdapter,
  mappingId: string,
  loaders: MappingEditorQueryDataLoaders,
  reason: PrefetchReason,
): Promise<boolean> {
  return prefetchCanonicalQuery({
    queryClient,
    queryKey: queryKeys.mappings.detail(mappingId),
    queryFn: async () => loadMappingEditorServerData(adapter, mappingId, loaders),
    staleTime: queryPolicies.savedMappingConfig.staleTime,
    gcTime: queryPolicies.savedMappingConfig.gcTime,
    reason,
  });
}

export async function prefetchMappingEditorByIntent(
  queryClient: QueryClient,
  adapter: ApiAdapter,
  mappingId: string,
  loaders: MappingEditorQueryDataLoaders,
  reason: 'hover' | 'focus',
): Promise<boolean> {
  return prefetchMappingEditor(queryClient, adapter, mappingId, loaders, reason);
}

export async function prefetchDeploymentPage(
  queryClient: QueryClient,
  adapter: ApiAdapter,
  mappingId: string,
  reason: PrefetchReason,
): Promise<boolean> {
  return prefetchCanonicalQuery({
    queryClient,
    queryKey: queryKeys.deployments.context(mappingId),
    queryFn: async () => loadDeploymentPageQueryData(adapter, mappingId),
    staleTime: queryPolicies.deploymentSummaryContext.staleTime,
    gcTime: queryPolicies.deploymentSummaryContext.gcTime,
    reason,
  });
}

export async function prefetchDeploymentPageByIntent(
  queryClient: QueryClient,
  adapter: ApiAdapter,
  mappingId: string,
  reason: 'hover' | 'focus',
): Promise<boolean> {
  return prefetchDeploymentPage(queryClient, adapter, mappingId, reason);
}
