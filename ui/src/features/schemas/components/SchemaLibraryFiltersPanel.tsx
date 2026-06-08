// SchemaLibraryFiltersPanel — Multi-select filter toggles for origin and format (FS-016 T-03)

import type { SchemaOrigin } from '@/lib/types';

import type { DisplayFormat } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaLibraryFiltersPanelProps {
  origins: SchemaOrigin[];
  formats: DisplayFormat[];
  onToggleOrigin: (origin: SchemaOrigin) => void;
  onToggleFormat: (format: DisplayFormat) => void;
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
  children: React.ReactNode;
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

const ORIGIN_OPTIONS: Array<{ value: SchemaOrigin; label: string }> = [
  { value: 'cdm', label: 'CDM' },
  { value: 'uploaded', label: 'Uploaded' },
  { value: 'inferred', label: 'Inferred' },
];

const FORMAT_OPTIONS: Array<{ value: DisplayFormat; label: string }> = [
  { value: 'JSON', label: 'JSON' },
  { value: 'XSD', label: 'XSD' },
  { value: 'Inferred', label: 'Inferred' },
];

export function SchemaLibraryFiltersPanel({
  origins,
  formats,
  onToggleOrigin,
  onToggleFormat,
}: SchemaLibraryFiltersPanelProps) {
  return (
    <div className="flex flex-wrap gap-4">
      <FilterGroup label="Origin">
        {ORIGIN_OPTIONS.map(({ value, label }) => (
          <ToggleButton
            key={value}
            label={label}
            active={origins.includes(value)}
            onClick={() => onToggleOrigin(value)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Format">
        {FORMAT_OPTIONS.map(({ value, label }) => (
          <ToggleButton
            key={value}
            label={label}
            active={formats.includes(value)}
            onClick={() => onToggleFormat(value)}
          />
        ))}
      </FilterGroup>
    </div>
  );
}
