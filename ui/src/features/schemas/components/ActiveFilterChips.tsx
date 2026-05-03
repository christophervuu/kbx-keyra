// ActiveFilterChips — Displays active filter values as removable chips (FS-016 T-03)

import type { SchemaOrigin } from '@/lib/types';

import type { DisplayFormat } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ActiveFilterChipsProps {
  origins: SchemaOrigin[];
  formats: DisplayFormat[];
  scopes: Array<'global' | 'project'>;
  onRemoveOrigin: (origin: SchemaOrigin) => void;
  onRemoveFormat: (format: DisplayFormat) => void;
  onRemoveScope: (scope: 'global' | 'project') => void;
  onClearAll: () => void;
}

// ---------------------------------------------------------------------------
// Single chip
// ---------------------------------------------------------------------------

interface ChipProps {
  label: string;
  onRemove: () => void;
  colorClass?: string;
}

function Chip({ label, onRemove, colorClass = 'bg-slate-700 text-slate-200' }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
      data-testid="filter-chip"
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="ml-0.5 flex items-center rounded-full p-0.5 hover:bg-white/20 focus:outline-none focus:ring-1 focus:ring-white"
        data-testid="chip-remove"
      >
        ×
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Origin color mapping
// ---------------------------------------------------------------------------

const ORIGIN_COLORS: Record<SchemaOrigin, string> = {
  cdm: 'bg-purple-200 text-purple-900',
  published: 'bg-blue-200 text-blue-900',
  local: 'bg-green-200 text-green-900',
};

// ---------------------------------------------------------------------------
// ActiveFilterChips
// ---------------------------------------------------------------------------

export function ActiveFilterChips({
  origins,
  formats,
  scopes,
  onRemoveOrigin,
  onRemoveFormat,
  onRemoveScope,
  onClearAll,
}: ActiveFilterChipsProps) {
  const hasAny = origins.length > 0 || formats.length > 0 || scopes.length > 0;

  if (!hasAny) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="active-filter-chips"
      aria-label="Active filters"
    >
      {origins.map((origin) => (
        <Chip
          key={`origin-${origin}`}
          label={origin.charAt(0).toUpperCase() + origin.slice(1)}
          onRemove={() => onRemoveOrigin(origin)}
          colorClass={ORIGIN_COLORS[origin]}
        />
      ))}

      {formats.map((format) => (
        <Chip
          key={`format-${format}`}
          label={format}
          onRemove={() => onRemoveFormat(format)}
        />
      ))}

      {scopes.map((scope) => (
        <Chip
          key={`scope-${scope}`}
          label={scope === 'global' ? 'Global' : 'Project-Level'}
          onRemove={() => onRemoveScope(scope)}
          colorClass="bg-amber-100 text-amber-800"
        />
      ))}

      <button
        type="button"
        onClick={onClearAll}
        aria-label="Clear all filters"
        data-testid="clear-all-button"
        className="text-xs text-slate-400 underline hover:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        Clear all
      </button>
    </div>
  );
}
