// MetricsBar — Summary metric cards at the top of the Home Dashboard (FS-014 T-03)

import type { DashboardMetrics } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MetricsBarProps {
  metrics: DashboardMetrics | null;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface MetricCardProps {
  label: string;
  value: number | string;
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-700 bg-slate-900 px-5 py-4 shadow-sm">
      <span className="text-2xl font-bold text-slate-100">{value}</span>
      <span className="text-sm text-slate-400">{label}</span>
    </div>
  );
}

interface StatusItemProps {
  count: number;
  label: string;
  dotClass: string;
  textClass: string;
}

function StatusItem({ count, label, dotClass, textClass }: StatusItemProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      <span className={`text-sm font-medium ${textClass}`}>
        {count} {label}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function MetricCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex animate-pulse flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900 px-5 py-4 shadow-sm"
    >
      <div className="h-8 w-16 rounded bg-slate-700" />
      <div className="h-4 w-20 rounded bg-slate-700" />
    </div>
  );
}

function StatusCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex animate-pulse flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900 px-5 py-4 shadow-sm"
    >
      <div className="h-4 w-24 rounded bg-slate-700" />
      <div className="flex gap-4">
        <div className="h-4 w-16 rounded bg-slate-700" />
        <div className="h-4 w-16 rounded bg-slate-700" />
        <div className="h-4 w-20 rounded bg-slate-700" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MetricsBar({ metrics, loading }: MetricsBarProps) {
  if (loading || metrics === null) {
    return (
      <div
        role="status"
        aria-label="Loading metrics"
        className="flex flex-wrap gap-3"
      >
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <StatusCardSkeleton />
        <MetricCardSkeleton />
      </div>
    );
  }

  const { totalProjects, totalMappings, totalSchemas, statusBreakdown, deployedCount } = metrics;

  return (
    <div role="region" aria-label="Dashboard metrics" className="flex flex-wrap gap-3">
      <MetricCard label="Projects" value={totalProjects} />
      <MetricCard label="Mappings" value={totalMappings} />
      <MetricCard label="Schemas" value={totalSchemas} />

      {/* Status breakdown card */}
      <div className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900 px-5 py-4 shadow-sm">
        <span className="text-sm text-slate-400">Status</span>
        <div className="flex flex-wrap gap-4">
          <StatusItem
            count={statusBreakdown.ready}
            label="Ready"
            dotClass="bg-green-500"
            textClass="text-green-400"
          />
          <StatusItem
            count={statusBreakdown.draft}
            label="Draft"
            dotClass="bg-slate-400"
            textClass="text-slate-300"
          />
          <StatusItem
            count={statusBreakdown.hasErrors}
            label="Has Errors"
            dotClass="bg-red-500"
            textClass="text-red-400"
          />
        </div>
      </div>

      {/* Deployments card — always 0 in Phase 0 */}
      <div className="flex flex-col gap-1 rounded-lg border border-slate-700 bg-slate-900 px-5 py-4 shadow-sm">
        <span className="text-2xl font-bold text-slate-400">{deployedCount}</span>
        <span className="text-sm text-slate-400">Deployed</span>
      </div>
    </div>
  );
}
