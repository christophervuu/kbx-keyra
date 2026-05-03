// SchemaLibrarySearch — Text search input for the Schema Library (FS-016 T-03)

export interface SchemaLibrarySearchProps {
  value: string;
  onChange: (value: string) => void;
  resultCount?: number;
  totalCount?: number;
}

export function SchemaLibrarySearch({
  value,
  onChange,
  resultCount,
  totalCount,
}: SchemaLibrarySearchProps) {
  const showCount =
    resultCount !== undefined && totalCount !== undefined && resultCount !== totalCount;

  return (
    <div className="flex flex-col gap-1">
      <div className="relative flex items-center">
        {/* Search icon */}
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </span>

        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search schemas..."
          aria-label="Search schemas"
          className="w-full rounded-md border border-slate-700 bg-slate-800 py-2 pl-9 pr-8 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        {/* Clear button */}
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="absolute right-2 flex items-center justify-center rounded p-0.5 text-slate-400 hover:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            ×
          </button>
        )}
      </div>

      {/* Result count */}
      {showCount && (
        <p className="text-xs text-slate-400" aria-live="polite" data-testid="result-count">
          Showing {resultCount} of {totalCount}
        </p>
      )}
    </div>
  );
}
