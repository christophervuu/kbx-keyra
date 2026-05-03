// SchemaLibraryNoResults — Empty state shown when filters yield zero results (FS-016 T-03)

export interface SchemaLibraryNoResultsProps {
  onClearFilters: () => void;
}

export function SchemaLibraryNoResults({ onClearFilters }: SchemaLibraryNoResultsProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-16 text-center"
      data-testid="no-results"
    >
      <p className="text-sm text-slate-400">No schemas match the current filters.</p>
      <button
        type="button"
        onClick={onClearFilters}
        aria-label="Clear filters"
        className="rounded-md border border-slate-600 bg-slate-800 px-4 py-1.5 text-sm text-slate-200 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        data-testid="no-results-clear"
      >
        Clear filters
      </button>
    </div>
  );
}
