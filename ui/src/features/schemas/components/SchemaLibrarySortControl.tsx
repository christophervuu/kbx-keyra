// SchemaLibrarySortControl — Sort field + direction selector (FS-016 T-03)

import type { SortDirection, SortField } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaLibrarySortControlProps {
  field: SortField;
  direction: SortDirection;
  onSort: (field: SortField, direction?: SortDirection) => void;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SORT_FIELDS: Array<{ value: SortField; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'fieldCount', label: 'Field Count' },
  { value: 'updatedAt', label: 'Last Modified' },
  { value: 'origin', label: 'Origin' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SchemaLibrarySortControl({
  field,
  direction,
  onSort,
}: SchemaLibrarySortControlProps) {
  return (
    <div className="flex items-center gap-2" aria-label="Sort schemas">
      <select
        value={field}
        onChange={(e) => onSort(e.target.value as SortField)}
        aria-label="Sort by field"
        className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        data-testid="sort-field-select"
      >
        {SORT_FIELDS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => onSort(field)}
        aria-label={direction === 'asc' ? 'Sort ascending' : 'Sort descending'}
        data-testid="sort-direction-button"
        className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 hover:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {direction === 'asc' ? '↑' : '↓'}
      </button>
    </div>
  );
}
