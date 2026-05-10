import { useCallback, useEffect, useRef, useState } from 'react';

import type { Diagnostic, TraceEntry } from '@keyra/engine';
import type { PreviewExecutionState } from '@/lib/types/domain';
import type { DebugSelection, FailureExplanation } from '@/features/mappings/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DiagnosticsDisplayProps {
  state: PreviewExecutionState;
  /** Called when the user clicks a diagnostic row to initiate linked selection. */
  onSelect?: (selection: DebugSelection) => void;
  /** The targetPath of the currently active linked selection (from another panel). */
  selectedTargetPath?: string | null;
  /** The ruleIndex of the currently active linked selection (from another panel). */
  selectedRuleIndex?: number | null;
  /**
   * Optional failure explainer function (injected by the page layer, T-08).
   * When provided, called for each diagnostic; if it returns non-null the
   * plain-language explanation is rendered below the diagnostic message.
   */
  explainDiagnostic?: (
    diagnostic: Diagnostic,
    traceEntry?: TraceEntry,
  ) => FailureExplanation | null;
  /** Trace entries from the last execution, used to correlate with diagnostics for explanations. */
  traceEntries?: readonly TraceEntry[];
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

function severityIcon(severity: Diagnostic['severity']): string {
  switch (severity) {
    case 'error':
      return '✕';
    case 'warning':
      return '⚠';
    case 'info':
      return 'ℹ';
  }
}

function severityColor(severity: Diagnostic['severity']): string {
  switch (severity) {
    case 'error':
      return 'text-red-400';
    case 'warning':
      return 'text-amber-400';
    case 'info':
      return 'text-blue-400';
  }
}

function severityIconAriaLabel(severity: Diagnostic['severity']): string {
  switch (severity) {
    case 'error':
      return 'Error';
    case 'warning':
      return 'Warning';
    case 'info':
      return 'Info';
  }
}

/**
 * Returns the chip background/text classes for an active severity filter chip.
 * Inactive chips use a muted outline style.
 */
function severityChipActiveClass(severity: Diagnostic['severity']): string {
  switch (severity) {
    case 'error':
      return 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50';
    case 'warning':
      return 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50';
    case 'info':
      return 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50';
  }
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
// DiagnosticItem sub-component
// ---------------------------------------------------------------------------

interface DiagnosticItemProps {
  diagnostic: Diagnostic;
  index: number;
  isSelected: boolean;
  onSelect?: (selection: DebugSelection) => void;
  explanation: FailureExplanation | null;
}

function DiagnosticItem({
  diagnostic,
  index,
  isSelected,
  onSelect,
  explanation,
}: DiagnosticItemProps) {
  const color = severityColor(diagnostic.severity);
  // Error and warning rows are visually emphasized relative to info rows.
  const isEmphasized = diagnostic.severity === 'error' || diagnostic.severity === 'warning';

  const handleClick = useCallback(() => {
    if (!onSelect) return;
    onSelect({
      targetPath: diagnostic.targetPath ?? '',
      ruleIndex: diagnostic.ruleIndex,
      source: 'diagnostics',
    });
  }, [onSelect, diagnostic.targetPath, diagnostic.ruleIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  const interactiveProps = onSelect
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: handleClick,
        onKeyDown: handleKeyDown,
        'aria-pressed': isSelected,
        className: [
          'flex gap-2 border-b border-zinc-800 px-3 py-2 last:border-0 w-full text-left',
          'cursor-pointer transition-colors',
          isSelected
            ? 'bg-blue-500/15 ring-1 ring-inset ring-blue-500/30'
            : 'hover:bg-zinc-800/60',
        ].join(' '),
      }
    : {
        className: 'flex gap-2 border-b border-zinc-800 px-3 py-2 last:border-0',
      };

  return (
    <li
      data-testid={`diagnostic-item-${index}`}
      data-selected={isSelected || undefined}
      {...interactiveProps}
    >
      {/* Severity icon */}
      <span
        className={`mt-px shrink-0 text-xs font-bold ${color}`}
        aria-label={severityIconAriaLabel(diagnostic.severity)}
        role="img"
      >
        {severityIcon(diagnostic.severity)}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className={`text-xs ${color} ${isEmphasized ? 'font-medium' : ''}`}>
          {diagnostic.message}
        </p>

        {/* Target path */}
        {diagnostic.targetPath !== undefined && diagnostic.targetPath !== '' && (
          <p
            className="mt-0.5 font-mono text-xs text-zinc-500"
            data-testid={`diagnostic-path-${index}`}
          >
            {diagnostic.targetPath}
          </p>
        )}

        {/* Expression snippet */}
        {diagnostic.expression !== undefined && diagnostic.expression !== '' && (
          <p
            className="mt-0.5 font-mono text-xs text-zinc-600"
            data-testid={`diagnostic-expression-${index}`}
          >
            {diagnostic.expression}
          </p>
        )}

        {/* Plain-language failure explanation */}
        {explanation !== null && (
          <div
            className="mt-1.5 rounded bg-zinc-800/60 px-2 py-1.5"
            data-testid={`diagnostic-explanation-${index}`}
          >
            <p className="text-xs text-slate-400">
              <span className="mr-1 text-blue-400" aria-hidden="true">ℹ</span>
              {explanation.summary}
            </p>
            {explanation.suggestion !== undefined && (
              <p className="mt-0.5 text-xs text-zinc-500">
                {explanation.suggestion}
              </p>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Severity filter chip
// ---------------------------------------------------------------------------

interface SeverityChipProps {
  severity: Diagnostic['severity'];
  active: boolean;
  onToggle: (severity: Diagnostic['severity']) => void;
}

function SeverityChip({ severity, active, onToggle }: SeverityChipProps) {
  const label = severityIconAriaLabel(severity);
  return (
    <button
      type="button"
      onClick={() => onToggle(severity)}
      aria-pressed={active}
      className={[
        'rounded px-2 py-0.5 text-xs font-medium transition-colors',
        active
          ? severityChipActiveClass(severity)
          : 'text-zinc-500 ring-1 ring-zinc-700 hover:text-zinc-300',
      ].join(' ')}
      data-testid={`severity-chip-${severity}`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SEVERITIES: Diagnostic['severity'][] = ['error', 'warning', 'info'];
const DEBOUNCE_MS = 200;

/**
 * Diagnostics tab content for the Preview Panel.
 *
 * Renders a severity-categorised list of engine diagnostics from execution
 * results. Supports:
 * - Click-to-select rows for linked cross-panel debugging (FS-036)
 * - Highlight state driven by external selection (selectedTargetPath / selectedRuleIndex)
 * - Severity filter chips (Error | Warning | Info)
 * - Debounced search by targetPath or message
 * - Count display when filters are active
 * - Plain-language failure explanation slot (explainDiagnostic prop)
 */
export function DiagnosticsDisplay({
  state,
  onSelect,
  selectedTargetPath,
  selectedRuleIndex,
  explainDiagnostic,
  traceEntries,
}: DiagnosticsDisplayProps) {
  // ---------------------------------------------------------------------------
  // Filter state
  // ---------------------------------------------------------------------------

  // Active severity chips — empty set means "show all"
  const [activeSeverities, setActiveSeverities] = useState<Set<Diagnostic['severity']>>(
    new Set(),
  );
  const [searchRaw, setSearchRaw] = useState('');
  const searchQuery = useDebounced(searchRaw, DEBOUNCE_MS);

  const toggleSeverity = useCallback((severity: Diagnostic['severity']) => {
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) {
        next.delete(severity);
      } else {
        next.add(severity);
      }
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Non-success states (no filter UI needed)
  // ---------------------------------------------------------------------------

  if (state.status === 'idle') {
    return (
      <div
        className="flex h-full items-center justify-center p-4"
        data-testid="diagnostics-idle"
      >
        <p className="text-xs text-zinc-500">Run a mapping to see diagnostics</p>
      </div>
    );
  }

  if (state.status === 'executing') {
    return (
      <div
        className="flex h-full items-center justify-center p-4"
        data-testid="diagnostics-executing"
      >
        <p className="text-xs text-zinc-500">Executing…</p>
      </div>
    );
  }

  if (state.status === 'timeout') {
    return (
      <div className="p-3" data-testid="diagnostics-timeout">
        <p className="text-xs text-amber-400">
          Execution timed out — no diagnostics available
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="p-3" data-testid="diagnostics-error">
        <p className="text-xs text-red-400">
          Execution failed — no diagnostics available
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Success — filter and render
  // ---------------------------------------------------------------------------

  const { diagnostics } = state.result;
  const total = diagnostics.length;

  if (total === 0) {
    return (
      <div
        className="flex h-full items-center justify-center p-4"
        data-testid="diagnostics-empty"
      >
        <div className="flex flex-col items-center gap-1">
          <span className="text-base text-green-400" aria-hidden="true">
            ✓
          </span>
          <p className="text-xs text-zinc-400">No issues found</p>
        </div>
      </div>
    );
  }

  // Apply filters
  const lowerQuery = searchQuery.toLowerCase();
  const filtered = diagnostics.filter((d) => {
    // Severity chip filter (empty set = show all)
    if (activeSeverities.size > 0 && !activeSeverities.has(d.severity)) {
      return false;
    }
    // Search filter
    if (lowerQuery !== '') {
      const pathMatch = (d.targetPath ?? '').toLowerCase().includes(lowerQuery);
      const msgMatch = d.message.toLowerCase().includes(lowerQuery);
      if (!pathMatch && !msgMatch) return false;
    }
    return true;
  });

  const filteredCount = filtered.length;
  const isFiltered = filteredCount !== total;

  // Build a lookup from ruleIndex → TraceEntry for explanation correlation
  const traceByRuleIndex = new Map<number, TraceEntry>();
  if (traceEntries) {
    for (const entry of traceEntries) {
      traceByRuleIndex.set(entry.ruleIndex, entry);
    }
  }

  return (
    <div className="flex h-full flex-col" data-testid="diagnostics-list-container">
      {/* Toolbar: severity chips + search */}
      <div
        className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2"
        data-testid="diagnostics-toolbar"
      >
        {/* Severity filter chips */}
        <div className="flex items-center gap-1" role="group" aria-label="Filter by severity">
          {SEVERITIES.map((sev) => (
            <SeverityChip
              key={sev}
              severity={sev}
              active={activeSeverities.has(sev)}
              onToggle={toggleSeverity}
            />
          ))}
        </div>

        {/* Search input */}
        <input
          type="search"
          value={searchRaw}
          onChange={(e) => setSearchRaw(e.target.value)}
          placeholder="Filter by path or message…"
          aria-label="Filter diagnostics"
          className="min-w-0 flex-1 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none ring-1 ring-zinc-700 focus:ring-blue-500/50"
          data-testid="diagnostics-search"
        />

        {/* Count display — only shown when filtered */}
        {isFiltered && (
          <span
            className="shrink-0 text-xs text-zinc-500"
            data-testid="diagnostics-count"
            aria-live="polite"
            aria-atomic="true"
          >
            {filteredCount} of {total} diagnostics
          </span>
        )}
      </div>

      {/* Diagnostics list */}
      {filteredCount === 0 ? (
        <div
          className="flex flex-1 items-center justify-center p-4"
          data-testid="diagnostics-no-results"
        >
          <p className="text-xs text-zinc-500">No diagnostics match your filter</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <ul
            role="list"
            aria-label={`${filteredCount} diagnostic${filteredCount === 1 ? '' : 's'}`}
            data-testid="diagnostics-list"
          >
            {filtered.map((d, filteredIdx) => {
              // Determine original index for stable test IDs
              const originalIdx = diagnostics.indexOf(d);

              // Determine if this row is highlighted by the current linked selection
              const isSelected =
                (selectedTargetPath != null &&
                  d.targetPath !== undefined &&
                  d.targetPath === selectedTargetPath) ||
                (selectedRuleIndex != null &&
                  d.ruleIndex !== undefined &&
                  d.ruleIndex === selectedRuleIndex);

              // Resolve trace entry for explanation correlation
              const traceEntry =
                d.ruleIndex !== undefined
                  ? traceByRuleIndex.get(d.ruleIndex)
                  : undefined;

              const explanation = explainDiagnostic
                ? explainDiagnostic(d, traceEntry) ?? null
                : null;

              return (
                <DiagnosticItem
                  key={`${originalIdx}-${filteredIdx}`}
                  diagnostic={d}
                  index={originalIdx}
                  isSelected={isSelected}
                  onSelect={onSelect}
                  explanation={explanation}
                />
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
