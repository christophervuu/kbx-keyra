import { Filter, Layers, List, SortAsc, Sparkles } from 'lucide-react';
import { useCallback } from 'react';

import type { EditorView, TargetSort } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GlobalToolbarProps {
  /** Current sort mode (controlled) */
  sort: TargetSort;
  /** Current editor view (controlled) */
  view: EditorView;
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

const SORT_OPTIONS: { value: TargetSort; label: string }[] = [
  { value: 'schema', label: 'Schema order' },
  { value: 'unmapped-first', label: 'Unmapped first' },
  { value: 'required-first', label: 'Required first' },
];

const AUTO_MAP_TOOLTIP = 'AI-powered auto-mapping \u2014 available in a future release';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * GlobalToolbar — horizontal bar above the three-column layout.
 *
 * Provides:
 * - Sort mode selector: Schema order, Unmapped first, Required first
 * - Disabled "Auto-map Section" button (placeholder for future AI feature)
 * - Breadcrumb focus mode toggle
 * - View toggle: Target View / Rules View
 *
 * Search and filter chips have moved into TargetWorklist (internal state).
 * All remaining state is controlled — the toolbar only emits change events.
 */
export function GlobalToolbar({
  sort,
  view,
  onSortChange,
  onViewToggle,
  breadcrumbMode,
  onBreadcrumbModeToggle,
  className = '',
}: GlobalToolbarProps) {
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
