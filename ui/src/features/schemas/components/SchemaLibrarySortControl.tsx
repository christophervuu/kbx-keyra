// SchemaLibrarySortControl — Sort field + direction selector (FS-016 T-03)

import type { SortDirection, SortField } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaLibrarySortControlProps {
  field: SortField;
  direction: SortDirection;
  onSort: (field: SortField, direction: SortDirection) => void;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SORT_OPTIONS: Array<{ value: { field: SortField; direction: SortDirection }; label: string }> = [
  { value: { field: 'name', direction: 'asc' }, label: 'Name A-Z' },
  { value: { field: 'name', direction: 'desc' }, label: 'Name Z-A' },
  { value: { field: 'status', direction: 'asc' }, label: 'Status Ready-Error' },
  { value: { field: 'status', direction: 'desc' }, label: 'Status Error-Ready' },
  { value: { field: 'dataFormat', direction: 'asc' }, label: 'Format JSON-XML' },
  { value: { field: 'dataFormat', direction: 'desc' }, label: 'Format XML-JSON' },
  { value: { field: 'projectCount', direction: 'desc' }, label: 'Used by High-Low' },
  { value: { field: 'projectCount', direction: 'asc' }, label: 'Used by Low-High' },
  { value: { field: 'updatedAt', direction: 'desc' }, label: 'Updated Newest' },
  { value: { field: 'updatedAt', direction: 'asc' }, label: 'Updated Oldest' },
  { value: { field: 'fieldCount', direction: 'desc' }, label: 'Field count High-Low' },
  { value: { field: 'fieldCount', direction: 'asc' }, label: 'Field count Low-High' },
  { value: { field: 'ownership', direction: 'asc' }, label: 'Ownership CDM-User' },
  { value: { field: 'ownership', direction: 'desc' }, label: 'Ownership User-CDM' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SchemaLibrarySortControl({
  field,
  direction,
  onSort,
}: SchemaLibrarySortControlProps) {
  const selectedValue = `${field}:${direction}`;

  return (
    <div className="flex items-center gap-2" aria-label="Sort schemas">
      <select
        value={selectedValue}
        onChange={(e) => {
          const [selectedField, selectedDirection] = e.target.value.split(':') as [SortField, SortDirection];
          onSort(selectedField, selectedDirection);
        }}
        aria-label="Sort schemas"
        className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        data-testid="sort-field-select"
      >
        {SORT_OPTIONS.map(({ value, label }) => (
          <option key={`${value.field}:${value.direction}`} value={`${value.field}:${value.direction}`}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
