// SchemaLibrarySkeleton — Animated pulse skeleton for Schema Library loading state (FS-016 T-04)

function SkeletonCard() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900 p-5">
      {/* Name bar */}
      <div className="h-4 w-2/3 animate-pulse rounded bg-slate-700" />
      {/* Badge row */}
      <div className="flex gap-2">
        <div className="h-5 w-16 animate-pulse rounded-full bg-slate-700" />
        <div className="h-5 w-20 animate-pulse rounded-full bg-slate-700" />
      </div>
      {/* Metadata row */}
      <div className="flex gap-3">
        <div className="h-3 w-14 animate-pulse rounded bg-slate-700" />
        <div className="h-3 w-20 animate-pulse rounded bg-slate-700" />
        <div className="h-3 w-16 animate-pulse rounded bg-slate-700" />
      </div>
      {/* Footer */}
      <div className="mt-auto border-t border-slate-800 pt-3">
        <div className="h-3 w-28 animate-pulse rounded bg-slate-700" />
      </div>
    </div>
  );
}

export function SchemaLibrarySkeleton() {
  return (
    <div role="status" data-testid="schema-library-skeleton">
      <span className="sr-only">Loading schemas</span>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
