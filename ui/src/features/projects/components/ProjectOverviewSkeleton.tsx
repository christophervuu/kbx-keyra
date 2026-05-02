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
 * Animated loading skeleton mimicking the Project Overview page layout (Sections A–D).
 */
export function ProjectOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" data-testid="project-overview-skeleton">
      {/* Section A — Metadata skeleton */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-5">
        <SkeletonBlock className="mb-3 h-6 w-48" />
        <SkeletonBlock className="mb-2 h-4 w-full" />
        <SkeletonBlock className="mb-3 h-4 w-3/4" />
        <div className="flex gap-2">
          <SkeletonBlock className="h-5 w-14 rounded-full" />
          <SkeletonBlock className="h-5 w-10 rounded-full" />
          <SkeletonBlock className="h-5 w-16 rounded-full" />
        </div>
      </div>

      {/* Section B — Schemas skeleton */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-5">
        <SkeletonBlock className="mb-4 h-5 w-32" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
        </div>
      </div>

      {/* Section C — Mappings skeleton */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-5">
        <SkeletonBlock className="mb-4 h-5 w-24" />
        <SkeletonBlock className="mb-2 h-8 w-full" />
        <SkeletonBlock className="mb-2 h-10 w-full" />
        <SkeletonBlock className="mb-2 h-10 w-full" />
        <SkeletonBlock className="h-10 w-full" />
      </div>

      {/* Section D — Actions skeleton */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-5">
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-7 w-28" />
          <SkeletonBlock className="h-7 w-24" />
          <SkeletonBlock className="h-7 w-32" />
        </div>
      </div>
    </div>
  );
}
