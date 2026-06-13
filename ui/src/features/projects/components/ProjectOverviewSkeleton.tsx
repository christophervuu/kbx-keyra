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
 * Header → Mappings (FS-086 T-01).
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
    </div>
  );
}
