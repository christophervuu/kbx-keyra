import { AlertCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';
import type { DeploymentOverviewItem } from '@/lib/api/types';
import { PATHS } from '@/routes';

export interface DeploymentOverviewTableProps {
  readonly items: readonly DeploymentOverviewItem[];
  readonly isLoading: boolean;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly errorMessage?: string;
  readonly nextCursor: string | null;
  readonly onLoadMore: () => void;
  readonly onRowClick?: (item: DeploymentOverviewItem) => void;
}

function envLabel(value: 'DEV' | 'PREPROD' | 'PROD'): string {
  return value === 'PREPROD' ? 'PREPROD' : value;
}

function statusTone(status: string | null): string {
  if (status === 'FAILED' || status === 'TIMED_OUT') {
    return 'text-red-300';
  }

  if (status === 'RUNNING' || status === 'QUEUED') {
    return 'text-amber-300';
  }

  if (status === 'SUCCEEDED') {
    return 'text-green-300';
  }

  return 'text-slate-400';
}

function freshnessLabel(value: 'NOT_DEPLOYED' | 'CURRENT' | 'STALE'): string {
  if (value === 'NOT_DEPLOYED') return 'Not deployed';
  if (value === 'CURRENT') return 'Current';
  return 'Stale';
}

export function DeploymentOverviewTable({
  items,
  isLoading,
  isFetching,
  isError,
  errorMessage,
  nextCursor,
  onLoadMore,
  onRowClick,
}: DeploymentOverviewTableProps) {
  if (isError) {
    return <ErrorBanner message={errorMessage ?? 'Failed to load deployment overviews'} />;
  }

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading deployment overviews" className="space-y-2" data-testid="deployment-overview-loading">
        <div className="h-10 animate-pulse rounded bg-slate-800" />
        <div className="h-10 animate-pulse rounded bg-slate-800" />
        <div className="h-10 animate-pulse rounded bg-slate-800" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="rounded-md border border-slate-800 bg-slate-900/60 px-4 py-8 text-center text-sm text-slate-400"
        data-testid="deployment-overview-empty"
      >
        No deployments matched the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Mapping</th>
              <th className="px-3 py-2">Latest</th>
              <th className="px-3 py-2">DEV</th>
              <th className="px-3 py-2">PREPROD</th>
              <th className="px-3 py-2">PROD</th>
              <th className="px-3 py-2">Attention</th>
              <th className="px-3 py-2">Last activity</th>
              <th className="px-3 py-2">Open</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const deploymentPath = PATHS.MAPPING_DEPLOYMENT
                .replace(':projectId', item.projectId)
                .replace(':mappingId', item.mappingId);

              return (
                <tr
                  key={item.mappingId}
                  className="border-t border-slate-800 text-slate-200"
                  data-testid={`deployment-overview-row-${item.mappingId}`}
                >
                  <td className="px-3 py-2">{item.projectName}</td>
                  <td className="px-3 py-2">{item.mappingName}</td>
                  <td className="px-3 py-2 font-mono">v{item.latestVersion}</td>
                  {(['DEV', 'PREPROD', 'PROD'] as const).map((env) => {
                    const state = item.environments[env];
                    return (
                      <td key={env} className="px-3 py-2">
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-400">{envLabel(env)}</span>
                          <span>{freshnessLabel(state.freshness)}</span>
                          <span className={`text-xs ${statusTone(state.lastOperationStatus)}`}>
                            {state.lastOperationStatus ?? '—'}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    {item.attentionState === 'NEEDS_ATTENTION' ? (
                      <span className="inline-flex items-center gap-1 text-red-300">
                        <AlertCircle size={14} aria-hidden="true" /> Needs attention
                      </span>
                    ) : (
                      <span className="text-slate-400">OK</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">{new Date(item.lastActivityAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <Link
                      to={deploymentPath}
                      aria-label={`Open deployment details for ${item.mappingName}`}
                      title={`Open deployment details for ${item.mappingName}`}
                      className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      onClick={() => onRowClick?.(item)}
                    >
                      Open <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {nextCursor ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={onLoadMore}
            loading={isFetching}
            aria-label="Load more deployment overview results"
            data-testid="deployment-overview-load-more"
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
