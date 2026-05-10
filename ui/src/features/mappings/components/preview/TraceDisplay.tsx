import { useCallback, useEffect, useRef, useState } from 'react';
import type { TraceEntry } from '@keyra/engine';
import type { DebugSelection } from '@/features/mappings/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TraceDisplayProps {
  /** Trace entries from the last successful execution, or undefined if trace was off. */
  trace: readonly TraceEntry[] | undefined;
  /** Whether the trace toggle is enabled in the toolbar. */
  traceEnabled: boolean;
  /** Called when the user clicks a trace row to initiate linked selection. */
  onSelect?: (selection: DebugSelection) => void;
  /** The ruleIndex of the currently active linked selection (from another panel). */
  selectedRuleIndex?: number | null;
  /** The targetPath of the currently active linked selection (from another panel). */
  selectedTargetPath?: string | null;
  /**
   * The source of the current selection — used to determine whether to
   * auto-scroll the highlighted row into view (only when source !== 'trace').
   */
  selectionSource?: DebugSelection['source'] | null;
}

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

// ---------------------------------------------------------------------------
// TraceEntryRow sub-component
// ---------------------------------------------------------------------------

interface TraceEntryRowProps {
  entry: TraceEntry;
  index: number;
  isSelected: boolean;
  /** Whether the selection came from an external panel (triggers auto-scroll). */
  scrollIntoView: boolean;
  onSelect?: (selection: DebugSelection) => void;
}

function TraceEntryRow({ entry, index, isSelected, scrollIntoView, onSelect }: TraceEntryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);

  const durationLabel =
    entry.durationMs !== undefined ? `${entry.durationMs.toFixed(2)}ms` : '—';

  const hasDiagnostics = entry.diagnostics !== undefined && entry.diagnostics.length > 0;

  // Auto-scroll when externally selected
  useEffect(() => {
    if (scrollIntoView && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [scrollIntoView]);

  const handleRowClick = useCallback(() => {
    if (!onSelect) return;
    onSelect({
      targetPath: entry.targetPath,
      ruleIndex: entry.ruleIndex,
      source: 'trace',
    });
  }, [onSelect, entry.targetPath, entry.ruleIndex]);

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleRowClick();
      }
    },
    [handleRowClick],
  );

  const handleToggleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpanded((prev) => !prev);
    },
    [],
  );

  const handleToggleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Prevent row keydown from also firing
      e.stopPropagation();
    },
    [],
  );

  const rowInteractiveProps = onSelect
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: handleRowClick,
        onKeyDown: handleRowKeyDown,
        'aria-pressed': isSelected,
      }
    : {};

  return (
    <li
      ref={rowRef}
      className={[
        'border-b border-zinc-800 last:border-0',
        isSelected ? 'bg-blue-500/15 ring-1 ring-inset ring-blue-500/30' : (index % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-800/50'),
      ].join(' ')}
      data-testid={`trace-entry-${index}`}
      data-selected={isSelected || undefined}
      {...rowInteractiveProps}
    >
      {/* Collapsed row — always visible */}
      <div
        className={[
          'flex w-full items-center gap-2 px-3 py-2',
          onSelect ? 'cursor-pointer hover:bg-zinc-700/30' : '',
        ].join(' ')}
      >
        {/* Expand/collapse toggle button */}
        <button
          type="button"
          onClick={handleToggleClick}
          onKeyDown={handleToggleKeyDown}
          aria-expanded={expanded}
          aria-controls={`trace-detail-${index}`}
          className="shrink-0 text-zinc-500 transition-transform hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
          data-testid={`trace-row-${index}`}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} trace entry ${index + 1}`}
        >
          <span
            className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}
            aria-hidden="true"
          >
            ›
          </span>
        </button>

        {/* Sequence */}
        <span className="shrink-0 font-mono text-xs text-zinc-500">
          #{index + 1}
        </span>

        {/* Failure indicator */}
        {hasDiagnostics && (
          <span
            className="shrink-0 text-xs text-red-400"
            aria-label="Has diagnostics"
            role="img"
            data-testid={`trace-failure-indicator-${index}`}
          >
            ✕
          </span>
        )}

        {/* Target path */}
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">
          {entry.targetPath}
        </span>

        {/* Duration */}
        <span className="shrink-0 font-mono text-xs text-zinc-500">
          {durationLabel}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          id={`trace-detail-${index}`}
          className="border-t border-zinc-700/50 px-3 pb-2 pt-1.5"
          data-testid={`trace-detail-${index}`}
        >
          {/* Expression */}
          <div className="mb-1.5">
            <span className="text-xs text-zinc-500">Expression</span>
            <pre className="mt-0.5 whitespace-pre-wrap break-all font-mono text-xs text-zinc-300">
              {entry.expression}
            </pre>
          </div>

          {/* Resolved value */}
          <div>
            <span className="text-xs text-zinc-500">Value</span>
            <pre className="mt-0.5 whitespace-pre-wrap break-all font-mono text-xs text-green-400">
              {JSON.stringify(entry.outputValue, null, 2)}
            </pre>
          </div>

          {/* Per-step diagnostics */}
          {hasDiagnostics && (
            <div className="mt-1.5">
              <span className="text-xs text-zinc-500">Diagnostics</span>
              <ul className="mt-0.5 space-y-0.5">
                {entry.diagnostics!.map((d, di) => (
                  <li key={di} className="font-mono text-xs text-red-400">
                    {d.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Status filter chip
// ---------------------------------------------------------------------------

type StatusFilter = 'failed' | 'success';

interface StatusChipProps {
  status: StatusFilter;
  active: boolean;
  onToggle: (status: StatusFilter) => void;
}

function StatusChip({ status, active, onToggle }: StatusChipProps) {
  const label = status === 'failed' ? 'Failed' : 'Success';
  const activeClass =
    status === 'failed'
      ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50'
      : 'bg-green-500/20 text-green-400 ring-1 ring-green-500/50';

  return (
    <button
      type="button"
      onClick={() => onToggle(status)}
      aria-pressed={active}
      className={[
        'rounded px-2 py-0.5 text-xs font-medium transition-colors',
        active ? activeClass : 'text-zinc-500 ring-1 ring-zinc-700 hover:text-zinc-300',
      ].join(' ')}
      data-testid={`status-chip-${status}`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 200;

/**
 * Trace tab content for the Preview Panel.
 *
 * Renders a collapsible list of `TraceEntry` records ordered by execution
 * sequence. Supports:
 * - Click-to-select rows for linked cross-panel debugging (FS-036)
 * - Highlight state driven by external selection
 * - Auto-scroll highlighted row into view when selection is external
 * - Status filter chips: Failed | Success
 * - Debounced search by targetPath
 * - Count display when filters are active
 */
export function TraceDisplay({
  trace,
  traceEnabled,
  onSelect,
  selectedRuleIndex,
  selectedTargetPath,
  selectionSource,
}: TraceDisplayProps) {
  const [activeStatuses, setActiveStatuses] = useState<Set<StatusFilter>>(new Set());
  const [searchRaw, setSearchRaw] = useState('');
  const searchQuery = useDebounced(searchRaw, DEBOUNCE_MS);

  const toggleStatus = useCallback((status: StatusFilter) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  // Trace feature disabled
  if (!traceEnabled) {
    return (
      <div
        className="flex h-full items-center justify-center p-4"
        data-testid="trace-disabled"
      >
        <p className="max-w-xs text-center text-xs text-zinc-500">
          Enable <strong className="text-zinc-400">Trace</strong> in the toolbar to see
          step-by-step execution details
        </p>
      </div>
    );
  }

  // Trace enabled but no entries yet
  if (trace === undefined || trace.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center p-4"
        data-testid="trace-empty"
      >
        <p className="text-xs text-zinc-500">Run a mapping to see trace</p>
      </div>
    );
  }

  const total = trace.length;
  const lowerQuery = searchQuery.toLowerCase();

  const filtered = trace.filter((entry) => {
    // Status filter
    if (activeStatuses.size > 0) {
      const hasDiag = entry.diagnostics !== undefined && entry.diagnostics.length > 0;
      if (activeStatuses.has('failed') && !activeStatuses.has('success')) {
        if (!hasDiag) return false;
      } else if (activeStatuses.has('success') && !activeStatuses.has('failed')) {
        if (hasDiag) return false;
      }
      // Both active = show all (no-op)
    }
    // Search filter
    if (lowerQuery !== '') {
      if (!entry.targetPath.toLowerCase().includes(lowerQuery)) return false;
    }
    return true;
  });

  const filteredCount = filtered.length;
  const isFiltered = filteredCount !== total;

  return (
    <div className="flex h-full flex-col" data-testid="trace-list-container">
      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2"
        data-testid="trace-toolbar"
      >
        {/* Status filter chips */}
        <div className="flex items-center gap-1" role="group" aria-label="Filter by status">
          <StatusChip status="failed" active={activeStatuses.has('failed')} onToggle={toggleStatus} />
          <StatusChip status="success" active={activeStatuses.has('success')} onToggle={toggleStatus} />
        </div>

        {/* Search input */}
        <input
          type="search"
          value={searchRaw}
          onChange={(e) => setSearchRaw(e.target.value)}
          placeholder="Filter by target path…"
          aria-label="Filter trace entries"
          className="min-w-0 flex-1 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none ring-1 ring-zinc-700 focus:ring-blue-500/50"
          data-testid="trace-search"
        />

        {/* Count display */}
        {isFiltered && (
          <span
            className="shrink-0 text-xs text-zinc-500"
            data-testid="trace-count"
            aria-live="polite"
            aria-atomic="true"
          >
            {filteredCount} of {total} trace steps
          </span>
        )}
      </div>

      {/* List */}
      {filteredCount === 0 ? (
        <div
          className="flex flex-1 items-center justify-center p-4"
          data-testid="trace-no-results"
        >
          <p className="text-xs text-zinc-500">No trace entries match your filter</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <ul
            role="list"
            aria-label={`${filteredCount} trace entr${filteredCount === 1 ? 'y' : 'ies'}`}
            data-testid="trace-list"
          >
            {filtered.map((entry, filteredIdx) => {
              const originalIdx = trace.indexOf(entry);

              const isSelected =
                (selectedRuleIndex != null && entry.ruleIndex === selectedRuleIndex) ||
                (selectedTargetPath != null && entry.targetPath === selectedTargetPath);

              // Auto-scroll only when selection comes from an external panel
              const shouldScroll = isSelected && selectionSource !== 'trace';

              return (
                <TraceEntryRow
                  key={`${originalIdx}-${filteredIdx}`}
                  entry={entry}
                  index={originalIdx}
                  isSelected={isSelected}
                  scrollIntoView={shouldScroll}
                  onSelect={onSelect}
                />
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
