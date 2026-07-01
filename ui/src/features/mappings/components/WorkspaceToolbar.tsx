import { RefreshCw, X } from 'lucide-react';

import type { SuggestionFilter } from '../hooks/use-auto-map-workspace';
import type { AutoMapWorkspaceSummary, SuggestionWorkspaceItem } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceToolbarProps {
  activeFilters: ReadonlySet<SuggestionFilter>;
  onToggleFilter: (filter: SuggestionFilter) => void;
  onClearFilters: () => void;
  summary: AutoMapWorkspaceSummary;
  totalFilteredCount: number;
  items?: readonly SuggestionWorkspaceItem[];
  targetSearchQuery: string;
  onTargetSearchChange: (query: string) => void;
  onClearTargetSearch: () => void;
  onRefreshStale: () => void;
  isRefreshing: boolean;
  /** Optional className for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Filter chip config
// ---------------------------------------------------------------------------

interface FilterChipConfig {
  filter: SuggestionFilter;
  label: string;
  /** Returns the count to show in the badge, or null to hide the badge */
  count: (
    summary: AutoMapWorkspaceSummary,
    items?: readonly SuggestionWorkspaceItem[],
  ) => number | null;
}

function isReviewedStatus(item: SuggestionWorkspaceItem): boolean {
  return item.status === 'accepted' || item.status === 'edited' || item.status === 'dismissed';
}

const FILTER_CHIPS: FilterChipConfig[] = [
  {
    filter: 'needsReview',
    label: 'Needs Review',
    count: (s, items) => {
      if (items && items.length > 0) {
        const count = items.filter((item) => !isReviewedStatus(item)).length;
        return count > 0 ? count : null;
      }
      const fallback = s.pending + s.stale;
      return fallback > 0 ? fallback : null;
    },
  },
  {
    filter: 'unmapped',
    label: 'Unmapped',
    count: (s, items) => {
      if (items && items.length > 0) {
        const count = items.filter((item) => item.isNew && !isReviewedStatus(item)).length;
        return count > 0 ? count : null;
      }
      return s.pending > 0 ? s.pending : null;
    },
  },
  {
    filter: 'replacing',
    label: 'Replacing',
    count: (_s, items) => {
      if (!items || items.length === 0) {
        return null;
      }
      const count = items.filter((item) => !item.isNew && !isReviewedStatus(item)).length;
      return count > 0 ? count : null;
    },
  },
  {
    filter: 'valid',
    label: 'Valid',
    count: (s) => (s.validCount > 0 ? s.validCount : null),
  },
  {
    filter: 'invalid',
    label: 'Invalid',
    count: (s) => (s.invalidCount > 0 ? s.invalidCount : null),
  },
  {
    filter: 'lowConfidence',
    label: 'Low Confidence',
    count: (s) => (s.lowConfidence > 0 ? s.lowConfidence : null),
  },
  {
    filter: 'accepted',
    label: 'Accepted',
    count: (s) => (s.accepted > 0 ? s.accepted : null),
  },
  {
    filter: 'dismissed',
    label: 'Dismissed',
    count: (s) => (s.dismissed > 0 ? s.dismissed : null),
  },
  {
    filter: 'stale',
    label: 'Stale',
    count: (s) => (s.stale > 0 ? s.stale : null),
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ChipProps {
  label: string;
  count: number | null;
  active: boolean;
  onClick: () => void;
  testId: string;
}

function FilterChip({ label, count, active, onClick, testId }: ChipProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      className={[
        'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
        active
          ? 'bg-blue-900/60 text-blue-300 ring-1 ring-blue-500/30'
          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
      ].join(' ')}
    >
      {label}
      {count !== null && (
        <span
          aria-hidden="true"
          className={[
            'inline-flex min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-semibold',
            active ? 'bg-blue-700/60 text-blue-200' : 'bg-zinc-700 text-zinc-300',
          ].join(' ')}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// WorkspaceToolbar
// ---------------------------------------------------------------------------

/**
 * WorkspaceToolbar — filter chips + bulk action buttons for the Auto-Map workspace.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────────────┐
 * │  [All] [Unmapped(3)] [Valid(5)] … │ [Accept All Valid]   │
 * │                                   │ [Refresh Unmapped]   │
 * │                                   │ [Refresh Stale]      │
 * │                                   │ [Refresh All]        │
 * └──────────────────────────────────────────────────────────┘
 *
 * Renders in the `toolbarSlot` of `AutoMapWorkspace`.
 */
export function WorkspaceToolbar({
  activeFilters,
  onToggleFilter,
  onClearFilters,
  summary,
  totalFilteredCount,
  items,
  targetSearchQuery,
  onTargetSearchChange,
  onClearTargetSearch,
  onRefreshStale,
  isRefreshing,
  className = '',
}: WorkspaceToolbarProps) {
  const hasActiveFilters = activeFilters.size > 0;
  const hasStale = summary.stale > 0;

  return (
    <div
      data-testid="workspace-toolbar"
      className={[
        'shrink-0 border-b border-slate-800 bg-slate-950 px-3 py-2',
        className,
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Filter chips */}
        <div
          role="group"
          aria-label="Filter suggestions"
          className="flex flex-wrap items-center gap-1"
        >
          {/* "All" chip — active when no filters */}
          <button
            type="button"
            data-testid="filter-chip-all"
            onClick={onClearFilters}
            aria-pressed={!hasActiveFilters}
            className={[
              'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              !hasActiveFilters
                ? 'bg-blue-900/60 text-blue-300 ring-1 ring-blue-500/30'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
            ].join(' ')}
          >
            All
            <span
              aria-hidden="true"
              className={[
                'inline-flex min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-semibold',
                !hasActiveFilters ? 'bg-blue-700/60 text-blue-200' : 'bg-zinc-700 text-zinc-300',
              ].join(' ')}
            >
              {summary.total}
            </span>
          </button>

          {/* Individual filter chips */}
          {FILTER_CHIPS.map(({ filter, label, count }) => (
            <FilterChip
              key={filter}
              label={label}
              count={count(summary, items)}
              active={activeFilters.has(filter)}
              onClick={() => onToggleFilter(filter)}
              testId={`filter-chip-${filter}`}
            />
          ))}

          {/* Clear filters button — only when filters are active */}
          {hasActiveFilters && (
            <button
              type="button"
              data-testid="filter-clear"
              onClick={onClearFilters}
              aria-label="Clear all filters"
              className={[
                'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium',
                'text-slate-500 transition-colors hover:text-slate-300',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              ].join(' ')}
            >
              <X size={9} aria-hidden="true" />
              Clear
            </button>
          )}
        </div>

        <div className="flex min-w-[16rem] flex-1 justify-end">
          <div className="flex w-full max-w-xs items-center gap-1">
            <input
              type="search"
              value={targetSearchQuery}
              onChange={(event) => onTargetSearchChange(event.target.value)}
              placeholder="Search target paths"
              aria-label="Search target suggestions"
              data-testid="workspace-target-search"
              className="h-7 w-full rounded border border-slate-700 bg-slate-900 px-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {targetSearchQuery.trim().length > 0 ? (
              <button
                type="button"
                onClick={onClearTargetSearch}
                data-testid="workspace-target-search-clear"
                aria-label="Clear target search"
                className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              >
                <X size={10} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Bulk action buttons */}
        <div
          role="group"
          aria-label="Bulk actions"
          className="flex flex-wrap items-center gap-1.5"
        >
          {/* Refresh Stale — hidden when no stale items */}
          {hasStale && (
            <button
              type="button"
              data-testid="bulk-refresh-stale"
              onClick={onRefreshStale}
              disabled={isRefreshing}
              aria-label="Refresh stale suggestions"
              className={[
                'flex items-center gap-1 rounded border px-2.5 py-1 text-[10px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                isRefreshing
                  ? 'cursor-not-allowed border-slate-700 text-slate-600'
                  : 'border-amber-700/60 text-amber-400 hover:border-amber-600 hover:text-amber-300',
              ].join(' ')}
            >
              <RefreshCw size={10} aria-hidden="true" />
              Refresh Stale
            </button>
          )}

        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500" data-testid="workspace-filtered-scope">
        <span>
          Batch scope: {totalFilteredCount} filtered row{totalFilteredCount === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}
