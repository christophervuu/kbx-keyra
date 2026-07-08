import { Search } from 'lucide-react';

import type { DeploymentOverviewFilters as DeploymentOverviewFilterState } from '../hooks/use-deployment-overview';

export interface DeploymentOverviewFiltersProps {
  readonly filters: DeploymentOverviewFilterState;
  readonly onChange: (next: DeploymentOverviewFilterState) => void;
  readonly onResetPage: () => void;
}

export function DeploymentOverviewFilters({
  filters,
  onChange,
  onResetPage,
}: DeploymentOverviewFiltersProps) {
  return (
    <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3 md:grid-cols-2 xl:grid-cols-5" data-testid="deployment-overview-filters">
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Environment
        <select
          aria-label="Filter by environment"
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          value={filters.environment ?? ''}
          onChange={(event) => {
            onResetPage();
            onChange({
              ...filters,
              environment: event.target.value === ''
                ? undefined
                : (event.target.value as 'DEV' | 'PREPROD' | 'PROD'),
            });
          }}
        >
          <option value="">All</option>
          <option value="DEV">DEV</option>
          <option value="PREPROD">PREPROD</option>
          <option value="PROD">PROD</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Freshness
        <select
          aria-label="Filter by freshness"
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          value={filters.freshness ?? ''}
          onChange={(event) => {
            onResetPage();
            onChange({
              ...filters,
              freshness: event.target.value === ''
                ? undefined
                : (event.target.value as 'NOT_DEPLOYED' | 'CURRENT' | 'STALE'),
            });
          }}
        >
          <option value="">All</option>
          <option value="NOT_DEPLOYED">Not deployed</option>
          <option value="CURRENT">Current</option>
          <option value="STALE">Stale</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Attention
        <select
          aria-label="Filter by attention"
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          value={filters.attentionState ?? ''}
          onChange={(event) => {
            onResetPage();
            onChange({
              ...filters,
              attentionState: event.target.value === ''
                ? undefined
                : (event.target.value as 'OK' | 'NEEDS_ATTENTION'),
            });
          }}
        >
          <option value="">All</option>
          <option value="NEEDS_ATTENTION">Needs attention</option>
          <option value="OK">OK</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Operation status
        <select
          aria-label="Filter by operation status"
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          value={filters.operationStatus ?? ''}
          onChange={(event) => {
            onResetPage();
            onChange({
              ...filters,
              operationStatus: event.target.value === ''
                ? undefined
                : (event.target.value as 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT'),
            });
          }}
        >
          <option value="">All</option>
          <option value="FAILED">Failed</option>
          <option value="TIMED_OUT">Timed out</option>
          <option value="RUNNING">Running</option>
          <option value="QUEUED">Queued</option>
          <option value="SUCCEEDED">Succeeded</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Search
        <span className="relative">
          <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2 top-2 text-slate-500" />
          <input
            aria-label="Search deployments"
            className="w-full rounded border border-slate-700 bg-slate-950 py-1 pl-7 pr-2 text-sm text-slate-100"
            value={filters.search ?? ''}
            onChange={(event) => {
              onResetPage();
              onChange({
                ...filters,
                search: event.target.value,
              });
            }}
            placeholder="Project, mapping, or id"
          />
        </span>
      </label>
    </div>
  );
}
