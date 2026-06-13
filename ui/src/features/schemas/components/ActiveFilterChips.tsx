// ActiveFilterChips — Displays active filter values as removable chips (FS-016 T-03)

import type { FilterDataFormat, FilterOwnership, FilterStatus } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ActiveFilterChipsProps {
  ownerships: FilterOwnership[];
  dataFormats: FilterDataFormat[];
  statuses: FilterStatus[];
  onRemoveOwnership: (ownership: FilterOwnership) => void;
  onRemoveDataFormat: (format: FilterDataFormat) => void;
  onRemoveStatus: (status: FilterStatus) => void;
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

const OWNERSHIP_COLORS: Record<FilterOwnership, string> = {
  cdm: 'bg-purple-200 text-purple-900',
  user: 'bg-blue-200 text-blue-900',
};

const STATUS_COLORS: Record<FilterStatus, string> = {
  ready: 'bg-emerald-200 text-emerald-900',
  processing: 'bg-slate-200 text-slate-900',
  needs_review: 'bg-amber-200 text-amber-900',
  error: 'bg-rose-200 text-rose-900',
};

function statusLabel(status: FilterStatus): string {
  const displayStatus = status === 'needs_review' ? 'ready' : status;
  return displayStatus[0].toUpperCase() + displayStatus.slice(1);
}

// ---------------------------------------------------------------------------
// ActiveFilterChips
// ---------------------------------------------------------------------------

export function ActiveFilterChips({
  ownerships,
  dataFormats,
  statuses,
  onRemoveOwnership,
  onRemoveDataFormat,
  onRemoveStatus,
  onClearAll,
}: ActiveFilterChipsProps) {
  const hasAny = ownerships.length > 0 || dataFormats.length > 0 || statuses.length > 0;

  if (!hasAny) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="active-filter-chips"
      aria-label="Active filters"
    >
      {ownerships.map((ownership) => (
        <Chip
          key={`ownership-${ownership}`}
          label={ownership === 'cdm' ? 'CDM' : 'User'}
          onRemove={() => onRemoveOwnership(ownership)}
          colorClass={OWNERSHIP_COLORS[ownership]}
        />
      ))}

      {dataFormats.map((format) => (
        <Chip
          key={`data-format-${format}`}
          label={format}
          onRemove={() => onRemoveDataFormat(format)}
        />
      ))}

      {statuses.map((status) => (
        <Chip
          key={`status-${status}`}
          label={statusLabel(status)}
          onRemove={() => onRemoveStatus(status)}
          colorClass={STATUS_COLORS[status]}
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
