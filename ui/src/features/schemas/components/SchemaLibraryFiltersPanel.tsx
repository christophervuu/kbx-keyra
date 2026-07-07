// SchemaLibraryFiltersPanel — Multi-select filter toggles for origin and format (FS-016 T-03)

import type { ReactNode } from 'react';

import type { FilterDataFormat, FilterLifecycle, FilterOwnership, FilterStatus } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaLibraryFiltersPanelProps {
  ownerships: FilterOwnership[];
  dataFormats: FilterDataFormat[];
  statuses: FilterStatus[];
  lifecycles: FilterLifecycle[];
  onToggleOwnership: (ownership: FilterOwnership) => void;
  onToggleDataFormat: (format: FilterDataFormat) => void;
  onToggleStatus: (status: FilterStatus) => void;
  onToggleLifecycle: (lifecycle: FilterLifecycle) => void;
}

// ---------------------------------------------------------------------------
// Internal toggle button
// ---------------------------------------------------------------------------

interface ToggleButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function ToggleButton({ label, active, onClick }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-slate-900 ${
        active
          ? 'border-blue-500 bg-blue-600 text-white'
          : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500 hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Filter group
// ---------------------------------------------------------------------------

interface FilterGroupProps {
  label: string;
  children: ReactNode;
}

function FilterGroup({ label, children }: FilterGroupProps) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </legend>
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label={`Filter by ${label.toLowerCase()}`}
      >
        {children}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// SchemaLibraryFiltersPanel
// ---------------------------------------------------------------------------

const OWNERSHIP_OPTIONS: Array<{ value: FilterOwnership; label: string }> = [
  { value: 'cdm', label: 'CDM' },
  { value: 'user', label: 'User' },
];

const FORMAT_OPTIONS: Array<{ value: FilterDataFormat; label: string }> = [
  { value: 'JSON', label: 'JSON' },
  { value: 'XML', label: 'XML' },
];

const STATUS_OPTIONS: Array<{ value: FilterStatus; label: string }> = [
  { value: 'ready', label: 'Ready' },
  { value: 'processing', label: 'Processing' },
  { value: 'error', label: 'Error' },
];

const LIFECYCLE_OPTIONS: Array<{ value: FilterLifecycle; label: string }> = [
  { value: 'draft', label: 'Draft only' },
  { value: 'versioned', label: 'Versioned' },
  { value: 'archived', label: 'Archived' },
];

export function SchemaLibraryFiltersPanel({
  ownerships,
  dataFormats,
  statuses,
  lifecycles,
  onToggleOwnership,
  onToggleDataFormat,
  onToggleStatus,
  onToggleLifecycle,
}: SchemaLibraryFiltersPanelProps) {
  return (
    <div className="flex flex-wrap gap-4">
      <FilterGroup label="Ownership">
        {OWNERSHIP_OPTIONS.map(({ value, label }) => (
          <ToggleButton
            key={value}
            label={label}
            active={ownerships.includes(value)}
            onClick={() => onToggleOwnership(value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Data format">
        {FORMAT_OPTIONS.map(({ value, label }) => (
          <ToggleButton
            key={value}
            label={label}
            active={dataFormats.includes(value)}
            onClick={() => onToggleDataFormat(value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Status">
        {STATUS_OPTIONS.map(({ value, label }) => (
          <ToggleButton
            key={value}
            label={label}
            active={statuses.includes(value)}
            onClick={() => onToggleStatus(value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Lifecycle">
        {LIFECYCLE_OPTIONS.map(({ value, label }) => (
          <ToggleButton
            key={value}
            label={label}
            active={lifecycles.includes(value)}
            onClick={() => onToggleLifecycle(value)}
          />
        ))}
      </FilterGroup>
    </div>
  );
}
