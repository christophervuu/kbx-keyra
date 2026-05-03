import { AlertTriangle, Filter, Layers, List, Search, Sparkles, SortAsc } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { EditorView, TargetFilter, TargetSort } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GlobalToolbarProps {
  /** Current search query (controlled) */
  searchQuery: string;
  /** Currently active filters (controlled) */
  activeFilters: readonly TargetFilter[];
  /** Current sort mode (controlled) */
  sort: TargetSort;
  /** Current editor view (controlled) */
  view: EditorView;
  /** Fired (debounced 300ms) when search input changes */
  onSearchChange: (query: string) => void;
  /** Fired when filter set changes */
  onFilterChange: (filters: TargetFilter[]) => void;
  /** Fired when sort mode changes */
  onSortChange: (sort: TargetSort) => void;
  /** Fired when view toggle is clicked */
  onViewToggle: (view: EditorView) => void;
  /** Whether breadcrumb drill-down mode is active */
  breadcrumbMode: boolean;
  /** Fired when breadcrumb mode toggle is clicked */
  onBreadcrumbModeToggle: () => void;
  /** Optional className for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;

const FILTER_OPTIONS: { value: TargetFilter; label: string }[] = [
  { value: 'unmapped', label: 'Unmapped' },
  { value: 'warnings', label: 'Warnings' },
  { value: 'required', label: 'Required' },
  { value: 'arrays', label: 'Arrays' },
];

const SORT_OPTIONS: { value: TargetSort; label: string }[] = [
  { value: 'schema', label: 'Schema order' },
  { value: 'unmapped-first', label: 'Unmapped first' },
  { value: 'required-first', label: 'Required first' },
];

const AUTO_MAP_TOOLTIP = 'AI-powered auto-mapping \u2014 available in a future release';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'rounded px-2 py-1 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
        active
          ? 'bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/50'
          : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * GlobalToolbar — horizontal bar above the three-column layout.
 *
 * Provides:
 * - Debounced search input for filtering target fields
 * - Combinable filter toggles: Unmapped, Warnings, Required, Arrays
 * - Sort mode selector: Schema order, Unmapped first, Required first
 * - Disabled "Auto-map Section" button (placeholder for future AI feature)
 * - View toggle: Target View / Rules View
 *
 * All state is controlled — the toolbar only emits change events.
 */
export function GlobalToolbar({
  searchQuery,
  activeFilters,
  sort,
  view,
  onSearchChange,
  onFilterChange,
  onSortChange,
  onViewToggle,
  breadcrumbMode,
  onBreadcrumbModeToggle,
  className = '',
}: GlobalToolbarProps) {
  // Internal search input value — debounced before firing onSearchChange
  const [inputValue, setInputValue] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync controlled value → local input when parent resets it
  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  const handleSearchInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearchChange(value);
      }, DEBOUNCE_MS);
    },
    [onSearchChange],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleFilterToggle = useCallback(
    (filter: TargetFilter) => {
      const current = new Set(activeFilters);
      if (current.has(filter)) {
        current.delete(filter);
      } else {
        current.add(filter);
      }
      onFilterChange(Array.from(current));
    },
    [activeFilters, onFilterChange],
  );

  const handleSortChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onSortChange(e.target.value as TargetSort);
    },
    [onSortChange],
  );

  const handleViewToggle = useCallback(() => {
    onViewToggle(view === 'target' ? 'rules' : 'target');
  }, [view, onViewToggle]);

  return (
    <div
      data-testid="global-toolbar"
      className={[
        'flex flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-900/80 px-3 py-2',
        className,
      ].join(' ')}
    >
      {/* Search input */}
      <div className="relative flex items-center">
        <Search
          size={13}
          className="pointer-events-none absolute left-2 text-slate-500"
          aria-hidden="true"
        />
        <input
          type="search"
          role="searchbox"
          aria-label="Search target fields"
          data-testid="toolbar-search"
          placeholder="Search fields\u2026"
          value={inputValue}
          onChange={handleSearchInput}
          className="h-7 w-44 rounded border border-slate-700 bg-slate-800 pl-7 pr-2 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Divider */}
      <span className="h-4 w-px bg-slate-700" aria-hidden="true" />

      {/* Filter label */}
      <span className="flex items-center gap-1 text-xs text-slate-500">
        <Filter size={12} aria-hidden="true" />
        <span className="sr-only">Filters:</span>
      </span>

      {/* Filter buttons */}
      {FILTER_OPTIONS.map(({ value, label }) => (
        <FilterButton
          key={value}
          label={label}
          active={activeFilters.includes(value)}
          onClick={() => handleFilterToggle(value)}
        />
      ))}

      {/* Divider */}
      <span className="h-4 w-px bg-slate-700" aria-hidden="true" />

      {/* Sort selector */}
      <div className="flex items-center gap-1">
        <SortAsc size={13} className="text-slate-500" aria-hidden="true" />
        <select
          aria-label="Sort order"
          data-testid="toolbar-sort"
          value={sort}
          onChange={handleSortChange}
          className="h-7 rounded border border-slate-700 bg-slate-800 px-1.5 text-xs text-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {SORT_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Spacer */}
      <span className="flex-1" aria-hidden="true" />

      {/* Auto-map Section — disabled placeholder */}
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={AUTO_MAP_TOOLTIP}
        data-testid="toolbar-automap"
        className="flex cursor-not-allowed items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-slate-600 opacity-50"
      >
        <Sparkles size={13} aria-hidden="true" />
        Auto-map Section
      </button>

      {/* Divider */}
      <span className="h-4 w-px bg-slate-700" aria-hidden="true" />

      {/* Breadcrumb mode toggle */}
      <button
        type="button"
        data-testid="toolbar-breadcrumb-mode"
        aria-pressed={breadcrumbMode}
        onClick={onBreadcrumbModeToggle}
        title="Focus mode — drill into a subtree"
        className={[
          'flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
          breadcrumbMode
            ? 'border-blue-500/50 bg-blue-600/20 text-blue-300'
            : 'border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
        ].join(' ')}
      >
        <Layers size={12} aria-hidden="true" />
        Focus
      </button>

      {/* Divider */}
      <span className="h-4 w-px bg-slate-700" aria-hidden="true" />

      {/* View toggle */}
      <div
        role="group"
        aria-label="Editor view"
        className="flex rounded border border-slate-700 bg-slate-800"
      >
        <button
          type="button"
          data-testid="toolbar-view-target"
          aria-pressed={view === 'target'}
          onClick={() => view !== 'target' && handleViewToggle()}
          className={[
            'flex items-center gap-1 rounded-l px-2 py-1 text-xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
            view === 'target'
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200',
          ].join(' ')}
        >
          <Filter size={12} aria-hidden="true" />
          Target View
        </button>
        <button
          type="button"
          data-testid="toolbar-view-rules"
          aria-pressed={view === 'rules'}
          onClick={() => view !== 'rules' && handleViewToggle()}
          className={[
            'flex items-center gap-1 rounded-r px-2 py-1 text-xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
            view === 'rules'
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200',
          ].join(' ')}
        >
          <List size={12} aria-hidden="true" />
          Rules View
        </button>
      </div>
    </div>
  );
}
