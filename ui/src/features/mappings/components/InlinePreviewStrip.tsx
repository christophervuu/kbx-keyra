import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Info, Play, XCircle } from 'lucide-react';
import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

import type { PreviewDiagnostic } from '../types';

import type { TestCase } from '@/lib/types/domain';

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
  /** href for the "Open Test Lab" link */
  testingPageUrl: string;
  /** Whether the strip is collapsed to its summary bar */
  isCollapsed: boolean;
  /** Toggle collapsed/expanded state */
  onToggleCollapse: () => void;
  /**
   * @deprecated Use ConnectedInlinePreviewStrip's draft-expression-change trigger instead.
   * Kept for backward compatibility. When provided, auto-preview fires on each change
   * (if autoRun is on and sourceData is non-empty).
   */
  lastApplyTimestamp?: number | null;
  /** Saved test cases available for loading into the source textarea */
  testCases?: readonly TestCase[];
  /** Fired when a test case is selected from the dropdown */
  onLoadTestCase?: (id: string) => void;
  /** Diagnostic entries from the last execution run */
  diagnostics?: readonly PreviewDiagnostic[];
  /** Total number of rules evaluated in the last run */
  ruleCount?: number;
  /** Execution duration in milliseconds (null = no run yet) */
  durationMs?: number | null;
  /** Callback to navigate to a specific rule in the target worklist */
  onNavigateToRule?: (ruleIndex: number) => void;
  /** Callback to save a test case */
  onSaveTestCase?: (input: {
    name: string;
    sourceData: string;
    expectedOutput?: unknown;
  }) => { success: boolean; error?: string };
  /** Callback to clear the source data textarea */
  onClearSource?: () => void;
  /** Whether auto-run is enabled */
  autoRun?: boolean;
  /** Callback to toggle auto-run state */
  onAutoRunChange?: (value: boolean) => void;
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
// StatusBar sub-component
// ---------------------------------------------------------------------------

type StatusBarState =
  | 'idle'
  | 'ready'
  | 'running'
  | 'success'
  | 'success-warnings'
  | 'error';

function deriveStatusBarState(
  sourceData: string,
  isRunning: boolean,
  status: { errors: number; warnings: number } | null,
): StatusBarState {
  if (isRunning) return 'running';
  if (!sourceData.trim()) return 'idle';
  if (status === null) return 'ready';
  if (status.errors > 0) return 'error';
  if (status.warnings > 0) return 'success-warnings';
  return 'success';
}

interface RunInfoInlineProps {
  sourceData: string;
  isRunning: boolean;
  status: { errors: number; warnings: number } | null;
  ruleCount?: number;
  durationMs?: number | null;
}

function RunInfoInline({
  sourceData,
  isRunning,
  status,
  ruleCount = 0,
  durationMs,
}: RunInfoInlineProps) {
  const state = deriveStatusBarState(sourceData, isRunning, status);

  const baseClass = 'inline-flex min-w-0 items-center gap-1.5 rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-xs';

  if (state === 'idle') {
    return (
      <div className={`${baseClass} text-slate-500`} data-testid="strip-status-bar">
        <span aria-hidden="true">●</span>
        <span className="truncate">Paste source JSON and click Run</span>
      </div>
    );
  }

  if (state === 'ready') {
    return (
      <div className={`${baseClass} text-slate-500`} data-testid="strip-status-bar">
        <span aria-hidden="true">●</span>
        <span className="truncate">Ready — click Run or enable Auto-run</span>
      </div>
    );
  }

  if (state === 'running') {
    return (
      <div className={`${baseClass} text-amber-400`} data-testid="strip-status-bar">
        <span
          role="status"
          aria-label="Running"
          className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"
        />
        <span className="truncate">Evaluating {ruleCount} rule{ruleCount !== 1 ? 's' : ''}…</span>
      </div>
    );
  }

  if (state === 'success') {
    const errors = status?.errors ?? 0;
    const warnings = status?.warnings ?? 0;
    const duration = durationMs != null ? `· ${durationMs}ms` : '';
    return (
      <div className={`${baseClass} text-green-400`} data-testid="strip-status-bar">
        <span aria-hidden="true">✓</span>
        <span className="truncate">
          {ruleCount} rule{ruleCount !== 1 ? 's' : ''} evaluated · {errors} error
          {errors !== 1 ? 's' : ''} · {warnings} warning{warnings !== 1 ? 's' : ''}
          {duration ? ` ${duration}` : ''}
        </span>
      </div>
    );
  }

  if (state === 'success-warnings') {
    const errors = status?.errors ?? 0;
    const warnings = status?.warnings ?? 0;
    const duration = durationMs != null ? `· ${durationMs}ms` : '';
    return (
      <div className={`${baseClass} text-amber-400`} data-testid="strip-status-bar">
        <span aria-hidden="true">⚠</span>
        <span className="truncate">
          {ruleCount} rule{ruleCount !== 1 ? 's' : ''} evaluated · {errors} error
          {errors !== 1 ? 's' : ''} · {warnings} warning{warnings !== 1 ? 's' : ''}
          {duration ? ` ${duration}` : ''}
        </span>
      </div>
    );
  }

  // error state
  const errors = status?.errors ?? 0;
  const warnings = status?.warnings ?? 0;
  return (
    <div className={`${baseClass} text-red-400`} data-testid="strip-status-bar">
      <span aria-hidden="true">✗</span>
      <span className="truncate">
        {errors} error{errors !== 1 ? 's' : ''} · {warnings} warning{warnings !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusLine sub-component (used in collapsed bar)
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
// TestCaseSelector sub-component
// ---------------------------------------------------------------------------

function TestCaseSelector({
  testCases,
  onLoadTestCase,
}: {
  testCases?: readonly TestCase[];
  onLoadTestCase?: (id: string) => void;
}) {
  const [value, setValue] = useState('');
  const hasTestCases = testCases && testCases.length > 0;

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) return;
    onLoadTestCase?.(id);
    // Reset to placeholder after selection
    setValue('');
  };

  return (
    <select
      aria-label="Load test case"
      data-testid="strip-test-case-selector"
      value={value}
      onChange={handleChange}
      className="h-6 rounded border border-slate-700 bg-slate-800 px-1.5 text-xs text-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {hasTestCases ? (
        <>
          <option value="" disabled>
            Load test case…
          </option>
          {testCases.map((tc) => (
            <option key={tc.id} value={tc.id}>
              {tc.name}
            </option>
          ))}
        </>
      ) : (
        <option value="" disabled>
          No saved test cases
        </option>
      )}
    </select>
  );
}

// ---------------------------------------------------------------------------
// SaveTestCaseModal sub-component
// ---------------------------------------------------------------------------

interface SaveTestCaseModalProps {
  sourceData: string;
  output: unknown | null;
  existingCount: number;
  saveError?: string | null;
  onSave: (input: { name: string; sourceData: string; expectedOutput?: unknown }) => void;
  onClose: () => void;
}

const MAX_PREVIEW_LINES = 10;

const EXPANDABLE_TEXT_THRESHOLD = 150;

/**
 * ExpandableText — renders text with wrap. For long text (>150 chars), shows
 * a collapsed preview with a "Show more" / "Show less" toggle (T-11 / AE-12).
 */
function ExpandableText({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > EXPANDABLE_TEXT_THRESHOLD;

  if (!isLong) {
    return <span className={['break-words', className ?? ''].filter(Boolean).join(' ')}>{text}</span>;
  }

  return (
    <span className={['break-words', className ?? ''].filter(Boolean).join(' ')}>
      {expanded ? text : `${text.slice(0, EXPANDABLE_TEXT_THRESHOLD)}…`}
      {' '}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        className="text-[10px] text-blue-400 hover:text-blue-300 focus:outline-none focus-visible:underline"
        data-testid={expanded ? 'diagnostic-show-less' : 'diagnostic-show-more'}
        aria-label={expanded ? 'Show less' : 'Show more'}
      >
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </span>
  );
}

function truncateForPreview(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= MAX_PREVIEW_LINES) return text;
  return lines.slice(0, MAX_PREVIEW_LINES).join('\n') + '\n…';
}

function SaveTestCaseModal({
  sourceData,
  output,
  existingCount,
  saveError,
  onSave,
  onClose,
}: SaveTestCaseModalProps) {
  const defaultName = `Test case ${existingCount + 1}`;
  const [name, setName] = useState(defaultName);
  const [includeExpected, setIncludeExpected] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus name input on open
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim() || defaultName;
    onSave({
      name: trimmedName,
      sourceData,
      ...(includeExpected && output !== null ? { expectedOutput: output } : {}),
    });
  };

  const sourcePreview = truncateForPreview(sourceData);

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="save-testcase-modal"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        aria-hidden="true"
        onClick={onClose}
        data-testid="save-testcase-backdrop"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-testcase-title"
        className="relative z-10 flex w-[420px] flex-col gap-4 rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl"
      >
        <h2
          id="save-testcase-title"
          className="text-sm font-semibold text-slate-200"
        >
          Save as test case
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Name input */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="save-testcase-name"
              className="text-xs font-medium text-slate-400"
            >
              Name <span className="text-red-400">*</span>
            </label>
            <input
              id="save-testcase-name"
              ref={nameInputRef}
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="save-testcase-name-input"
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Source JSON preview */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-400">Source JSON</span>
            <pre
              data-testid="save-testcase-source-preview"
              className="max-h-40 overflow-y-auto rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs text-slate-300"
            >
              {sourcePreview}
            </pre>
          </div>

          {/* Set as expected output checkbox */}
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={includeExpected}
              onChange={(e) => setIncludeExpected(e.target.checked)}
              disabled={output === null}
              data-testid="save-testcase-expected-checkbox"
              className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            />
            Set as expected output
            {output === null && (
              <span className="text-slate-600">(no output yet)</span>
            )}
          </label>

          {/* Actions */}
          {saveError && (
            <p
              role="alert"
              data-testid="save-testcase-error"
              className="text-xs text-red-400"
            >
              {saveError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              data-testid="save-testcase-cancel"
              className="rounded px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="save-testcase-confirm"
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * InlinePreviewStrip — compact bottom strip replacing the 4-tab BottomArea.
 *
 * Expanded layout:
 *   Toolbar row (PREVIEW label, test case selector, Clear, Auto-run toggle, Run, Test Lab link)
 *   Status bar (state-dependent single-line display)
 *   Three-pane content area:
 *     [Source JSON ~35%] [Output ~40%] [Diagnostics ~25%]
 *
 * Collapsed layout (~32px):
 *   "Preview" label | status summary | expand chevron
 *
 * Auto-preview: when autoRun is true and sourceData is non-empty, watches
 * `lastApplyTimestamp` and calls `onRun()` automatically on each change.
 * If autoRun is false or sourceData is empty, auto-run is silently skipped.
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
  lastApplyTimestamp,
  testCases,
  onLoadTestCase,
  diagnostics = [],
  ruleCount = 0,
  durationMs = null,
  onNavigateToRule,
  onSaveTestCase,
  onClearSource,
  autoRun = true,
  onAutoRunChange,
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

    if (!autoRun) return; // AE-08: no-op when auto-run is disabled
    if (!sourceData.trim()) return; // AE-14: no-op when source data is empty

    onRun();
  }, [lastApplyTimestamp, sourceData, onRun, autoRun]);

  // Flash output area briefly when output changes (only when auto-preview triggered it)
  const prevOutputRef = useRef<unknown>(null);
  useEffect(() => {
    if (output === prevOutputRef.current) return;
    prevOutputRef.current = output;
    if (output === null) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- transient visual feedback only when output changes
    setOutputFlash(true);
    const timer = setTimeout(() => setOutputFlash(false), 300);
    return () => clearTimeout(timer);
  }, [output]);

  const outputText = formatOutput(output);
  const canRun = !isRunning && sourceData.trim().length > 0;
  const canSave = sourceData.trim().length > 0;

  // Save modal state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveTestCase = (input: {
    name: string;
    sourceData: string;
    expectedOutput?: unknown;
  }) => {
    const result = onSaveTestCase?.(input) ?? { success: true };
    if (result.success) {
      setSaveError(null);
      setSaveModalOpen(false);
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 1500);
      return;
    }

    setSaveError(result.error ?? 'Unable to save test case');
  };

  // Format button state
  const [formatShake, setFormatShake] = useState(false);

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(sourceData);
      onSourceDataChange(JSON.stringify(parsed, null, 2));
    } catch {
      setFormatShake(true);
      setTimeout(() => setFormatShake(false), 400);
    }
  };

  // Copy button state
  type CopyState = 'idle' | 'copied' | 'failed';
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const handleCopy = () => {
    setCopyState('copied');
    navigator.clipboard.writeText(outputText).then(
      () => {
        setTimeout(() => setCopyState('idle'), 1500);
      },
      () => {
        setCopyState('failed');
        setTimeout(() => setCopyState('idle'), 1500);
      },
    );
  };

  const copyLabel =
    copyState === 'copied' ? 'Copied ✓' : copyState === 'failed' ? 'Copy failed' : 'Copy';

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
    <>
      {/* Shake keyframe for Format button invalid JSON feedback */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
      `}</style>
      <div
        className={`flex h-full flex-col border-t border-slate-800 bg-slate-950 ${className}`}
        data-testid="inline-preview-strip"
      >
      {/* Toolbar row */}
      <div
        className="flex h-8 shrink-0 items-center gap-2 border-b border-slate-800 px-3"
        data-testid="strip-toolbar"
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Preview
        </span>

        {/* Run button */}
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

        {/* Auto-run toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={autoRun}
          aria-label={autoRun ? 'Auto-run enabled' : 'Auto-run disabled'}
          data-testid="strip-autorun-toggle"
          onClick={() => onAutoRunChange?.(!autoRun)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        >
          <span
            className={[
              'inline-block h-2 w-2 rounded-full',
              autoRun ? 'bg-green-400' : 'bg-slate-600',
            ].join(' ')}
            aria-hidden="true"
          />
          <span className={autoRun ? 'text-slate-300' : 'text-slate-500'}>Auto</span>
        </button>

        {/* Test case selector */}
        <TestCaseSelector testCases={testCases} onLoadTestCase={onLoadTestCase} />

        {/* Save as test case button */}
        <button
          type="button"
          onClick={() => {
            setSaveError(null);
            setSaveModalOpen(true);
          }}
          disabled={!canSave}
          aria-disabled={!canSave}
          aria-label="Save as test case"
          data-testid="strip-save-testcase-button"
          className={[
            'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
            canSave
              ? 'text-slate-400 hover:text-slate-200'
              : 'cursor-not-allowed text-slate-600',
          ].join(' ')}
        >
          {savedFeedback ? 'Saved ✓' : '⊕ Save'}
        </button>

        {/* Run info */}
        <RunInfoInline
          sourceData={sourceData}
          isRunning={isRunning}
          status={status}
          ruleCount={ruleCount}
          durationMs={durationMs}
        />

        <span className="flex-1" aria-hidden="true" />

        <span className="text-slate-600" aria-hidden="true">|</span>

        {/* Open Test Lab link */}
        <Link
          to={testingPageUrl}
          data-testid="strip-test-lab-link"
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        >
          Open Test Lab
          <ExternalLink size={10} aria-hidden="true" />
        </Link>

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

      {/* Three-pane content area */}
      <div className="flex min-h-0 flex-1 divide-x divide-slate-800">
        {/* Source JSON pane — ~35% */}
        <div
          className="flex min-h-0 w-[35%] shrink-0 flex-col"
          data-testid="strip-source-pane"
        >
          {/* Pane header */}
          <div className="group flex h-6 shrink-0 items-center bg-slate-900 px-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Source JSON
            </span>
            <span className="flex-1" aria-hidden="true" />
            <button
              type="button"
              onClick={handleFormat}
              data-testid="strip-format-button"
              aria-label="Format JSON"
              style={formatShake ? { animation: 'shake 0.4s ease' } : undefined}
              className="text-[10px] uppercase tracking-wide text-slate-600 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              Format
            </button>
          </div>
          {/* Content */}
          <div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
            <textarea
              id="strip-source-input"
              data-testid="strip-source-input"
              value={sourceData}
              onChange={(e) => onSourceDataChange(e.target.value)}
              placeholder="Paste source JSON…"
              spellCheck={false}
              className="flex-1 resize-none rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Output pane — ~40% */}
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          data-testid="strip-output-pane"
        >
          {/* Pane header */}
          <div className="group flex h-6 shrink-0 items-center bg-slate-900 px-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Output
            </span>
            <span className="flex-1" aria-hidden="true" />
            <button
              type="button"
              onClick={handleCopy}
              disabled={output === null}
              data-testid="strip-copy-button"
              aria-label="Copy output"
              className="text-[10px] uppercase tracking-wide text-slate-600 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copyLabel}
            </button>
          </div>
          {/* Content */}
          <div className="flex min-h-0 flex-1 flex-col p-2">
            <pre
              data-testid="strip-output"
              aria-label="Preview output"
              className={[
                'flex-1 overflow-y-auto rounded border bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200',
                outputFlash
                  ? 'border-blue-400 ring-2 ring-blue-400 transition-all duration-300'
                  : 'border-slate-700',
              ].join(' ')}
            >
              {output !== null ? (
                outputText
              ) : (
                <span className="text-slate-600">
                  {isRunning
                    ? 'Running…'
                    : 'No output yet — run the mapping to see results'}
                </span>
              )}
            </pre>
          </div>
        </div>

        {/* Diagnostics pane — ~25% */}
        <div
          className="flex min-h-0 w-[25%] shrink-0 flex-col"
          data-testid="strip-diagnostics-pane"
        >
          {/* Pane header */}
          <div className="flex h-6 shrink-0 items-center bg-slate-900 px-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Diagnostics
            </span>
            {diagnostics.length > 0 && (
              <span
                className="ml-1.5 rounded bg-slate-700 px-1 py-0.5 text-[9px] font-medium text-slate-400"
                data-testid="diagnostics-count"
              >
                {diagnostics.length}
              </span>
            )}
          </div>
          {/* Content */}
          <div className="flex flex-1 flex-col overflow-y-auto">
            {diagnostics.length === 0 ? (
              <span className="p-2 text-xs text-slate-600" data-testid="strip-diagnostics-placeholder">
                Run to see diagnostics.
              </span>
            ) : (
              <ul className="flex flex-col" aria-label="Diagnostics">
                {diagnostics.map((d, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => onNavigateToRule?.(d.ruleIndex)}
                      data-testid={`diagnostic-entry-${i}`}
                      className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500"
                    >
                      {/* Severity icon */}
                      <span className="mt-0.5 shrink-0">
                        {d.severity === 'error' ? (
                          <XCircle
                            size={12}
                            className="text-red-400"
                            aria-label="Error"
                          />
                        ) : d.severity === 'warning' ? (
                          <AlertTriangle
                            size={12}
                            className="text-amber-400"
                            aria-label="Warning"
                          />
                        ) : (
                          <Info
                            size={12}
                            className="text-blue-400"
                            aria-label="Info"
                          />
                        )}
                      </span>
                      {/* Entry text */}
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex items-start gap-1">
                          <span className="shrink-0 font-mono text-[10px] text-slate-400">{d.code}</span>
                          <ExpandableText text={d.message} className="text-xs text-slate-300" />
                        </span>
                        <span className="break-words text-[10px] text-slate-500">{d.ruleName}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Save as test case modal */}
      {saveModalOpen && (
        <SaveTestCaseModal
          sourceData={sourceData}
          output={output}
          existingCount={testCases?.length ?? 0}
          saveError={saveError}
          onSave={handleSaveTestCase}
          onClose={() => {
            setSaveError(null);
            setSaveModalOpen(false);
          }}
        />
      )}
    </div>
    </>
  );
}
