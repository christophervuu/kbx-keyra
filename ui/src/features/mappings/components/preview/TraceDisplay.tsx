import { useState } from 'react';
import type { TraceEntry } from '@keyra/engine';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TraceDisplayProps {
  /** Trace entries from the last successful execution, or undefined if trace was off. */
  trace: readonly TraceEntry[] | undefined;
  /** Whether the trace toggle is enabled in the toolbar. */
  traceEnabled: boolean;
}

// ---------------------------------------------------------------------------
// TraceEntryRow sub-component
// ---------------------------------------------------------------------------

interface TraceEntryRowProps {
  entry: TraceEntry;
  index: number;
}

function TraceEntryRow({ entry, index }: TraceEntryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isEven = index % 2 === 0;

  const durationLabel =
    entry.durationMs !== undefined ? `${entry.durationMs.toFixed(2)}ms` : '—';

  return (
    <li
      className={isEven ? 'bg-zinc-900' : 'bg-zinc-800/50'}
      data-testid={`trace-entry-${index}`}
    >
      {/* Collapsed row — always visible */}
      <button
        type="button"
        onClick={() => { setExpanded((prev) => !prev); }}
        aria-expanded={expanded}
        aria-controls={`trace-detail-${index}`}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-700/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        data-testid={`trace-row-${index}`}
      >
        {/* Chevron */}
        <span
          className={`shrink-0 text-zinc-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          ›
        </span>

        {/* Sequence */}
        <span className="shrink-0 font-mono text-xs text-zinc-500">
          #{index + 1}
        </span>

        {/* Target path */}
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">
          {entry.targetPath}
        </span>

        {/* Duration */}
        <span className="shrink-0 font-mono text-xs text-zinc-500">
          {durationLabel}
        </span>
      </button>

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
            <pre className="mt-0.5 font-mono text-xs text-zinc-300 whitespace-pre-wrap break-all">
              {entry.expression}
            </pre>
          </div>

          {/* Resolved value */}
          <div>
            <span className="text-xs text-zinc-500">Value</span>
            <pre className="mt-0.5 font-mono text-xs text-green-400 whitespace-pre-wrap break-all">
              {JSON.stringify(entry.outputValue, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Trace tab content for the Preview Panel.
 *
 * Renders a collapsible list of `TraceEntry` records ordered by execution
 * sequence. Shows prompts when trace is disabled or no execution has run.
 */
export function TraceDisplay({ trace, traceEnabled }: TraceDisplayProps) {
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

  // Trace enabled but no entries yet (no execution, or execution produced no trace)
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

  return (
    <div
      className="h-full overflow-auto"
      data-testid="trace-list-container"
    >
      <ul
        role="list"
        aria-label={`${trace.length} trace entr${trace.length === 1 ? 'y' : 'ies'}`}
        data-testid="trace-list"
      >
        {trace.map((entry, i) => (
          <TraceEntryRow key={i} entry={entry} index={i} />
        ))}
      </ul>
    </div>
  );
}
