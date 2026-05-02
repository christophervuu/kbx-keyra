// DashboardSkeleton — Animated pulse placeholder for the Home Dashboard (FS-014 T-09)
// Mimics the metrics bar (5 cards) + project card grid (6 cards) layout.

// ---------------------------------------------------------------------------
// Shared pulse block primitive
// ---------------------------------------------------------------------------

function PulseBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-700 ${className}`} />;
}

// ---------------------------------------------------------------------------
// Metrics bar skeleton — 5 compact card shapes
// ---------------------------------------------------------------------------

function MetricsBarSkeleton() {
  return (
    <div className="flex flex-wrap gap-3" aria-hidden="true">
      {/* 4 single-stat cards */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900 px-5 py-4 shadow-sm"
        >
          <PulseBlock className="h-8 w-16 bg-slate-700" />
          <PulseBlock className="h-4 w-20 bg-slate-700" />
        </div>
      ))}
      {/* Status breakdown card — wider */}
      <div className="flex animate-pulse flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900 px-5 py-4 shadow-sm">
        <PulseBlock className="h-4 w-12 bg-slate-700" />
        <div className="flex gap-4">
          <PulseBlock className="h-4 w-16 bg-slate-700" />
          <PulseBlock className="h-4 w-16 bg-slate-700" />
          <PulseBlock className="h-4 w-20 bg-slate-700" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project card skeleton — single card placeholder
// ---------------------------------------------------------------------------

function ProjectCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-sm">
      {/* Header: name + badge */}
      <div className="flex items-start justify-between gap-2">
        <PulseBlock className="h-5 w-32 bg-slate-700" />
        <PulseBlock className="h-5 w-16 rounded-full bg-slate-700" />
      </div>
      {/* Body: description lines + count */}
      <div className="flex flex-col gap-2">
        <PulseBlock className="h-4 w-full bg-slate-700" />
        <PulseBlock className="h-4 w-3/4 bg-slate-700" />
        <PulseBlock className="h-3 w-20 bg-slate-700" />
      </div>
      {/* Footer: deploy badges + date */}
      <div className="mt-auto flex items-center justify-between border-t border-slate-800 pt-3">
        <div className="flex gap-2">
          <PulseBlock className="h-4 w-20 bg-slate-700" />
          <PulseBlock className="h-4 w-20 bg-slate-700" />
          <PulseBlock className="h-4 w-20 bg-slate-700" />
        </div>
        <PulseBlock className="h-3 w-16 bg-slate-700" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main skeleton
// ---------------------------------------------------------------------------

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" className="flex flex-col gap-6">
      <MetricsBarSkeleton />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <ProjectCardSkeleton key={i} />
        ))}
      </div>
      <span className="sr-only">Loading dashboard data…</span>
    </div>
  );
}
