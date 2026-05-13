// ---------------------------------------------------------------------------
// Skeleton helpers
// ---------------------------------------------------------------------------

function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-800 ${className}`}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Animated loading skeleton mimicking the Project Overview page layout:
 * Header → Summary Row → Mappings → Schemas (FS-050 T-06 / AE-15).
 */
export function ProjectOverviewSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      data-testid="project-overview-skeleton"
      role="status"
    >
      <span className="sr-only">Loading project...</span>

      {/* Header area — title + action buttons + metadata row */}
      <div data-testid="skeleton-header-area">
        {/* Title row */}
        <div className="mb-3 flex items-center justify-between">
          <SkeletonBlock className="h-7 w-56" />
          <div className="flex gap-2">
            <SkeletonBlock className="h-7 w-28 rounded-md" />
            <SkeletonBlock className="h-7 w-24 rounded-md" />
            <SkeletonBlock className="h-7 w-7 rounded-md" />
          </div>
        </div>
        {/* Metadata row — description + dates + tags */}
        <div className="flex flex-wrap items-center gap-3">
          <SkeletonBlock className="h-4 w-48" />
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-5 w-14 rounded-full" />
          <SkeletonBlock className="h-5 w-10 rounded-full" />
        </div>
      </div>

      {/* Summary row — metric pills */}
      <div
        className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-slate-800 bg-slate-900/50 px-4 py-2.5"
        data-testid="skeleton-summary-row"
      >
        <SkeletonBlock className="h-4 w-20" />
        <SkeletonBlock className="h-4 w-20" />
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonBlock className="h-4 w-28" />
        <div className="flex-1" aria-hidden="true" />
        <SkeletonBlock className="h-4 w-28" />
      </div>

      {/* Mappings area — heading + table header + rows */}
      <div data-testid="skeleton-mappings-area">
        <SkeletonBlock className="mb-4 h-6 w-36" />
        <div className="overflow-hidden rounded-lg border border-slate-700">
          {/* Table header */}
          <SkeletonBlock className="h-9 w-full rounded-none" />
          {/* Table rows */}
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="mt-px h-11 w-full rounded-none" />
          ))}
        </div>
      </div>

      {/* Schemas area — heading + card grid */}
      <div data-testid="skeleton-schemas-area">
        <SkeletonBlock className="mb-4 h-5 w-28" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
        </div>
      </div>
    </div>
  );
}
