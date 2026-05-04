import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ChevronDown, ChevronUp, ExternalLink, Play } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InlinePreviewStripProps {
  /** Raw source JSON text (controlled by parent) */
  sourceData: string;
  /** Fired when the source textarea changes */
  onSourceDataChange: (value: string) => void;
  /** Trigger a preview execution run */
  onRun: () => void;
  /** Latest output from the engine (null = no result yet) */
  output: unknown | null;
  /** Whether execution is currently in progress */
  isRunning: boolean;
  /**
   * Validation status summary from the last run.
   * Null when no run has completed yet.
   */
  status: { errors: number; warnings: number } | null;
  /** href for the "Open Advanced Testing" link */
  testingPageUrl: string;
  /** Whether the strip is collapsed to its summary bar */
  isCollapsed: boolean;
  /** Toggle collapsed/expanded state */
  onToggleCollapse: () => void;
  /** Whether auto-preview is enabled */
  autoPreview: boolean;
  /** Fired when the auto-preview checkbox changes */
  onAutoPreviewChange: (enabled: boolean) => void;
  /**
   * Incremented each time a rule is applied.
   * When auto-preview is on and sourceData is non-empty, a change here
   * triggers an automatic run.
   */
  lastApplyTimestamp: number | null;
  /** Optional className for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatOutput(output: unknown): string {
  if (output === null || output === undefined) return '';
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

// ---------------------------------------------------------------------------
// StatusLine sub-component
// ---------------------------------------------------------------------------

function StatusLine({ status }: { status: { errors: number; warnings: number } | null }) {
  if (status === null) {
    return (
      <span className="text-xs text-slate-500" data-testid="strip-status">
        No result yet
      </span>
    );
  }
  if (status.errors === 0 && status.warnings === 0) {
    return (
      <span className="text-xs text-green-400" data-testid="strip-status">
        ✓ Valid
      </span>
    );
  }
  return (
    <span className="text-xs" data-testid="strip-status">
      {status.errors > 0 && (
        <span className="text-red-400">
          {status.errors} error{status.errors !== 1 ? 's' : ''}
        </span>
      )}
      {status.errors > 0 && status.warnings > 0 && (
        <span className="text-slate-500">, </span>
      )}
      {status.warnings > 0 && (
        <span className="text-amber-400">
          {status.warnings} warning{status.warnings !== 1 ? 's' : ''}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * InlinePreviewStrip — compact bottom strip replacing the 4-tab BottomArea.
 *
 * Expanded layout (~120px):
 *   [Source input 30%] [Run] [Output 45%] [Status + auto-preview + link 25%]
 *
 * Collapsed layout (~32px):
 *   "Preview" label | status summary | expand chevron
 *
 * Auto-preview: when enabled and sourceData is non-empty, watches
 * `lastApplyTimestamp` and calls `onRun()` automatically on each change.
 * If sourceData is empty, auto-run is silently skipped (AE-14).
 */
export function InlinePreviewStrip({
  sourceData,
  onSourceDataChange,
  onRun,
  output,
  isRunning,
  status,
  testingPageUrl,
  isCollapsed,
  onToggleCollapse,
  autoPreview,
  onAutoPreviewChange,
  lastApplyTimestamp,
  className = '',
}: InlinePreviewStripProps) {
  // Flash animation state — applied briefly when output updates via auto-preview
  const [outputFlash, setOutputFlash] = useState(false);
  const prevTimestampRef = useRef<number | null>(null);

  // Auto-preview: fire onRun when lastApplyTimestamp changes (if conditions met)
  useEffect(() => {
    if (lastApplyTimestamp === null) return;
    if (lastApplyTimestamp === prevTimestampRef.current) return;
    prevTimestampRef.current = lastApplyTimestamp;

    if (!autoPreview) return;
    if (!sourceData.trim()) return; // AE-14: no-op when source data is empty

    onRun();
  }, [lastApplyTimestamp, autoPreview, sourceData, onRun]);

  // Flash output area briefly when output changes (only when auto-preview triggered it)
  const prevOutputRef = useRef<unknown>(null);
  useEffect(() => {
    if (output === prevOutputRef.current) return;
    prevOutputRef.current = output;
    if (output === null) return;

    setOutputFlash(true);
    const timer = setTimeout(() => setOutputFlash(false), 300);
    return () => clearTimeout(timer);
  }, [output]);

  const outputText = formatOutput(output);
  const canRun = !isRunning && sourceData.trim().length > 0;

  // ---------------------------------------------------------------------------
  // Collapsed bar
  // ---------------------------------------------------------------------------
  if (isCollapsed) {
    return (
      <div
        className={`flex h-8 shrink-0 items-center gap-3 border-t border-slate-800 bg-slate-950 px-3 ${className}`}
        data-testid="inline-preview-strip-collapsed"
      >
        <span className="text-xs font-medium text-slate-400">Preview</span>
        <span className="h-3 w-px bg-slate-700" aria-hidden="true" />
        <StatusLine status={status} />
        <span className="flex-1" aria-hidden="true" />
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand preview strip"
          data-testid="strip-expand-toggle"
          className="text-slate-500 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        >
          <ChevronUp size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Expanded strip
  // ---------------------------------------------------------------------------
  return (
    <div
      className={`flex shrink-0 flex-col border-t border-slate-800 bg-slate-950 ${className}`}
      data-testid="inline-preview-strip"
    >
      {/* Header bar */}
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-slate-800 px-3">
        <span className="text-xs font-medium text-slate-400">Preview</span>
        <span className="flex-1" aria-hidden="true" />
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Collapse preview strip"
          data-testid="strip-collapse-toggle"
          className="text-slate-500 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>

      {/* Main row */}
      <div className="flex min-h-0 flex-1 divide-x divide-slate-800">
        {/* Source input — ~30% */}
        <div className="flex w-[30%] shrink-0 flex-col gap-1 p-2">
          <label
            htmlFor="strip-source-input"
            className="text-[10px] font-medium uppercase tracking-wide text-slate-500"
          >
            Source JSON
          </label>
          <textarea
            id="strip-source-input"
            data-testid="strip-source-input"
            rows={3}
            value={sourceData}
            onChange={(e) => onSourceDataChange(e.target.value)}
            placeholder="Paste source JSON…"
            spellCheck={false}
            className="flex-1 resize-none rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Run button — narrow column */}
        <div className="flex shrink-0 flex-col items-center justify-center gap-1.5 px-2">
          <button
            type="button"
            onClick={onRun}
            disabled={!canRun}
            aria-disabled={!canRun}
            data-testid="strip-run-button"
            className={[
              'flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              canRun
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'cursor-not-allowed bg-slate-800 text-slate-600',
            ].join(' ')}
          >
            {isRunning ? (
              <span
                role="status"
                aria-label="Running…"
                className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"
              />
            ) : (
              <Play size={11} aria-hidden="true" />
            )}
            Run
          </button>
        </div>

        {/* Output — ~45% */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 p-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Output
          </span>
          <pre
            data-testid="strip-output"
            aria-label="Preview output"
            className={[
              'flex-1 overflow-hidden rounded border bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200',
              'line-clamp-3 max-h-[4.5rem]',
              outputFlash
                ? 'border-blue-400 ring-2 ring-blue-400 transition-all duration-300'
                : 'border-slate-700',
            ].join(' ')}
          >
            {outputText || (
              <span className="text-slate-600">
                {isRunning ? 'Running…' : 'No output yet'}
              </span>
            )}
          </pre>
        </div>

        {/* Status + controls — ~25% */}
        <div className="flex w-[25%] shrink-0 flex-col justify-between gap-1 p-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Status
            </span>
            <StatusLine status={status} />
          </div>

          <div className="flex flex-col gap-1.5">
            {/* Auto-preview toggle */}
            <label
              className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400"
              data-testid="strip-auto-preview-label"
            >
              <input
                type="checkbox"
                checked={autoPreview}
                onChange={(e) => onAutoPreviewChange(e.target.checked)}
                data-testid="strip-auto-preview-toggle"
                className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
              />
              Auto-preview
            </label>

            {/* Advanced Testing link */}
            <Link
              to={testingPageUrl}
              data-testid="strip-advanced-testing-link"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              Open Advanced Testing
              <ExternalLink size={10} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
