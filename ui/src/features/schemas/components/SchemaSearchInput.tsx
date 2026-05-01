import { Search, X } from 'lucide-react';

interface SchemaSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  matchCount: number;
  isSearchActive: boolean;
}

export function SchemaSearchInput({
  value,
  onChange,
  onClear,
  matchCount,
  isSearchActive,
}: SchemaSearchInputProps) {
  return (
    <div className="mb-2">
      <div className="relative flex items-center">
        {/* Search icon */}
        <Search
          size={14}
          className="absolute left-2.5 text-slate-500 pointer-events-none"
          aria-hidden="true"
        />

        {/* Input */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search fields..."
          aria-label="Search schema fields"
          className="w-full h-8 pl-8 pr-8 text-sm text-slate-200 bg-slate-800 border border-slate-700 rounded placeholder:text-slate-500 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
        />

        {/* Clear button */}
        {value.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 p-0.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            aria-label="Clear search"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Result count (aria-live for screen readers) */}
      <div aria-live="polite" aria-atomic="true" className="mt-1 h-4">
        {isSearchActive && (
          <span className="text-xs text-slate-400">
            {matchCount === 0
              ? 'No matching fields'
              : `${matchCount} ${matchCount === 1 ? 'result' : 'results'}`}
          </span>
        )}
      </div>
    </div>
  );
}
