// SchemaLibraryFiltersPanel — Multi-select filter toggles for origin, format, scope (FS-016 T-03)

import type { SchemaOrigin } from '@/lib/types';

import type { DisplayFormat } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaLibraryFiltersPanelProps {
  origins: SchemaOrigin[];
  formats: DisplayFormat[];
  scopes: Array<'global' | 'project'>;
  onToggleOrigin: (origin: SchemaOrigin) => void;
  onToggleFormat: (format: DisplayFormat) => void;
  onToggleScope: (scope: 'global' | 'project') => void;
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
  { value: 'published', label: 'Published' },
  { value: 'local', label: 'Local' },
];

const FORMAT_OPTIONS: Array<{ value: DisplayFormat; label: string }> = [
  { value: 'JSON Schema', label: 'JSON Schema' },
  { value: 'XSD', label: 'XSD' },
  { value: 'Inferred', label: 'Inferred' },
];

const SCOPE_OPTIONS: Array<{ value: 'global' | 'project'; label: string }> = [
  { value: 'global', label: 'Global' },
  { value: 'project', label: 'Project-Level' },
];

export function SchemaLibraryFiltersPanel({
  origins,
  formats,
  scopes,
  onToggleOrigin,
  onToggleFormat,
  onToggleScope,
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

      <FilterGroup label="Scope">
        {SCOPE_OPTIONS.map(({ value, label }) => (
          <ToggleButton
            key={value}
            label={label}
            active={scopes.includes(value)}
            onClick={() => onToggleScope(value)}
          />
        ))}
      </FilterGroup>
    </div>
  );
}
