import { useState, useMemo } from 'react';
import {
  MinusCircle,
  PlusCircle,
  ArrowRightLeft,
  Braces,
  CircleSlash,
  Layers,
  CheckCircle2,
} from 'lucide-react';

import type { DiffEntry, DiffSummary } from '@/lib/types/diff';
import type { PreviewExecutionState } from '@/lib/types/domain';
import { computeDiff } from '@/lib/utils/json-diff';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DiffDisplayProps {
  state: PreviewExecutionState;
  /**
   * Initial expected output JSON string (e.g. loaded from a test case).
   * Changing this after mount has no effect — use a React `key` to reset.
   */
  initialExpectedOutput?: string;
  /**
   * Called when the expected output raw value changes.
   * Passes the raw string when JSON is valid, null when invalid or empty.
   */
  onExpectedRawChange?: (raw: string | null) => void;
}

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

type CategoryMeta = {
  label: string;
  rowClass: string;
  textClass: string;
  Icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
};

const CATEGORY_META: Record<DiffEntry['type'], CategoryMeta> = {
  missing_field: {
    label: 'Missing Field',
    rowClass: 'bg-red-900/30 border-l-2 border-red-500',
    textClass: 'text-red-400',
    Icon: MinusCircle,
  },
  extra_field: {
    label: 'Extra Field',
    rowClass: 'bg-amber-900/30 border-l-2 border-amber-500',
    textClass: 'text-amber-400',
    Icon: PlusCircle,
  },
  value_mismatch: {
    label: 'Value Mismatch',
    rowClass: 'bg-amber-900/30 border-l-2 border-amber-500',
    textClass: 'text-amber-400',
    Icon: ArrowRightLeft,
  },
  type_mismatch: {
    label: 'Type Mismatch',
    rowClass: 'bg-red-900/30 border-l-2 border-red-500',
    textClass: 'text-red-400',
    Icon: Braces,
  },
  null_mismatch: {
    label: 'Null Mismatch',
    rowClass: 'bg-amber-900/30 border-l-2 border-amber-500',
    textClass: 'text-amber-400',
    Icon: CircleSlash,
  },
  structural_mismatch: {
    label: 'Structural Mismatch',
    rowClass: 'bg-red-900/30 border-l-2 border-red-500',
    textClass: 'text-red-400',
    Icon: Layers,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_VALUE_DISPLAY_LEN = 60;

function formatValue(value: unknown): string {
  const raw = JSON.stringify(value);
  if (raw === undefined) return 'undefined';
  if (raw.length > MAX_VALUE_DISPLAY_LEN) {
    return raw.slice(0, MAX_VALUE_DISPLAY_LEN) + '…';
  }
  return raw;
}

// ---------------------------------------------------------------------------
// DiffSummaryHeader
// ---------------------------------------------------------------------------

const CATEGORY_SHORT_LABELS: Record<DiffEntry['type'], string> = {
  missing_field: 'missing',
  extra_field: 'extra',
  value_mismatch: 'value',
  type_mismatch: 'type',
  null_mismatch: 'null',
  structural_mismatch: 'structural',
};

interface DiffSummaryHeaderProps {
  summary: DiffSummary;
}

function DiffSummaryHeader({ summary }: DiffSummaryHeaderProps) {
  const parts = (Object.entries(summary.byCategory) as [DiffEntry['type'], number][])
    .filter(([, count]) => count > 0)
    .map(([cat, count]) => `${count} ${CATEGORY_SHORT_LABELS[cat]}`);

  return (
    <div
      className="shrink-0 border-b border-zinc-700 bg-zinc-900 px-3 py-2"
      data-testid="diff-summary-header"
      aria-live="polite"
    >
      <p className="text-xs text-zinc-400">
        <span className="font-semibold text-zinc-200">
          {summary.total} {summary.total === 1 ? 'mismatch' : 'mismatches'}
        </span>
        {parts.length > 0 && (
          <span className="ml-1 text-zinc-500">— {parts.join(', ')}</span>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiffEntryRow
// ---------------------------------------------------------------------------

interface DiffEntryRowProps {
  entry: DiffEntry;
  index: number;
}

function DiffEntryRow({ entry, index }: DiffEntryRowProps) {
  const meta = CATEGORY_META[entry.type];
  const { Icon } = meta;

  return (
    <li
      className={`px-3 py-2.5 text-xs ${meta.rowClass}`}
      data-testid={`diff-entry-${index}`}
      data-entry-type={entry.type}
    >
      {/* Category badge */}
      <div className={`mb-1 flex items-center gap-1 font-semibold ${meta.textClass}`}>
        <Icon size={12} aria-hidden={true} />
        <span aria-label={meta.label}>{meta.label}</span>
      </div>

      {/* Path */}
      <p className="mb-1 truncate font-mono text-zinc-300" title={entry.path}>
        {entry.path}
      </p>

      {/* Type annotation for type/null/structural mismatches */}
      {(entry.type === 'type_mismatch' ||
        entry.type === 'null_mismatch' ||
        entry.type === 'structural_mismatch') &&
        entry.actualType !== undefined &&
        entry.expectedType !== undefined && (
          <p className="mb-1 text-zinc-500">
            <span className="text-zinc-400">{entry.actualType}</span>
            {' → '}
            <span className="text-zinc-400">{entry.expectedType}</span>
            <span className="ml-1 text-zinc-600">(actual → expected)</span>
          </p>
        )}

      {/* Value display */}
      <div className="flex flex-col gap-0.5">
        {entry.type === 'missing_field' ? (
          <p className="text-zinc-400">
            <span className="text-zinc-600">expected </span>
            <span className="font-mono text-zinc-300">{formatValue(entry.expected)}</span>
          </p>
        ) : entry.type === 'extra_field' ? (
          <p className="text-zinc-400">
            <span className="text-zinc-600">actual </span>
            <span className="font-mono text-zinc-300">{formatValue(entry.actual)}</span>
          </p>
        ) : (
          <>
            <p className="text-zinc-400">
              <span className="text-zinc-600">actual </span>
              <span className="font-mono text-zinc-300">{formatValue(entry.actual)}</span>
            </p>
            <p className="text-zinc-400">
              <span className="text-zinc-600">expected </span>
              <span className="font-mono text-zinc-300">{formatValue(entry.expected)}</span>
            </p>
          </>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// ExpectedInput sub-component
// ---------------------------------------------------------------------------

interface ExpectedInputProps {
  value: string;
  onChange: (raw: string) => void;
  error: string | null;
}

function ExpectedInput({ value, onChange, error }: ExpectedInputProps) {
  return (
    <div className="shrink-0 border-b border-zinc-700 px-2 py-2">
      <label className="mb-1 block text-xs text-zinc-500" htmlFor="diff-expected-input">
        Expected output
      </label>
      <textarea
        id="diff-expected-input"
        data-testid="diff-expected-input"
        value={value}
        onChange={(e) => { onChange(e.target.value); }}
        placeholder="Paste expected output JSON..."
        rows={4}
        aria-invalid={error !== null ? true : undefined}
        aria-describedby={error !== null ? 'diff-expected-error' : undefined}
        className={[
          'w-full resize-none rounded bg-zinc-800 px-2 py-1.5 font-mono text-xs text-zinc-300',
          'placeholder:text-zinc-600 focus:outline-none focus-visible:ring-1',
          error !== null
            ? 'ring-1 ring-red-500 focus-visible:ring-red-500'
            : 'focus-visible:ring-blue-500',
        ].join(' ')}
      />
      {error !== null && (
        <p
          id="diff-expected-error"
          data-testid="diff-expected-error"
          role="alert"
          className="mt-1 text-xs text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Diff tab content for the Preview Panel.
 *
 * Lets the user enter expected JSON output and compares it against the actual
 * execution result using `computeDiff`. Renders color-coded structural diff
 * entries with categorized mismatch types and a summary header (FS-035 T-02).
 */
export function DiffDisplay({ state, initialExpectedOutput, onExpectedRawChange }: DiffDisplayProps) {
  const [expectedRaw, setExpectedRaw] = useState(initialExpectedOutput ?? '');
  const [expectedError, setExpectedError] = useState<string | null>(null);
  const [expectedParsed, setExpectedParsed] = useState<unknown>(() => {
    if (initialExpectedOutput !== undefined && initialExpectedOutput.trim() !== '') {
      try { return JSON.parse(initialExpectedOutput); } catch { /* ignore */ }
    }
    return null;
  });

  function handleExpectedChange(raw: string) {
    setExpectedRaw(raw);
    if (raw.trim() === '') {
      setExpectedError(null);
      setExpectedParsed(null);
      onExpectedRawChange?.(null);
      return;
    }
    try {
      setExpectedParsed(JSON.parse(raw));
      setExpectedError(null);
      onExpectedRawChange?.(raw);
    } catch (err) {
      setExpectedError(err instanceof Error ? err.message : 'Invalid JSON');
      setExpectedParsed(null);
      onExpectedRawChange?.(null);
    }
  }

  const actual = state.status === 'success' ? state.result.output : null;

  const diffResult = useMemo(() => {
    if (actual === null || expectedParsed === null) return null;
    return computeDiff(actual, expectedParsed);
  }, [actual, expectedParsed]);

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="diff-display">
      {/* Expected output input */}
      <ExpectedInput
        value={expectedRaw}
        onChange={handleExpectedChange}
        error={expectedError}
      />

      {/* Result area */}
      <div className="min-h-0 flex-1 overflow-auto">
        {/* No execution yet */}
        {state.status === 'idle' && (
          <div
            className="flex h-full items-center justify-center p-4"
            data-testid="diff-no-execution"
          >
            <p className="text-xs text-zinc-500">Run a mapping first to compare output</p>
          </div>
        )}

        {/* Executing */}
        {state.status === 'executing' && (
          <div
            className="flex h-full items-center justify-center p-4"
            data-testid="diff-executing"
          >
            <p className="text-xs text-zinc-500">Executing…</p>
          </div>
        )}

        {/* Timeout */}
        {state.status === 'timeout' && (
          <div className="p-3" data-testid="diff-timeout">
            <p className="text-xs text-amber-400">
              Execution timed out — no output to compare
            </p>
          </div>
        )}

        {/* Error */}
        {state.status === 'error' && (
          <div className="p-3" data-testid="diff-error">
            <p className="text-xs text-red-400">
              Execution failed — no output to compare
            </p>
          </div>
        )}

        {/* Success — but no expected defined */}
        {state.status === 'success' && expectedParsed === null && expectedError === null && (
          <div
            className="flex h-full items-center justify-center p-4"
            data-testid="diff-no-expected"
          >
            <p className="text-xs text-zinc-500">Enter expected output to compare</p>
          </div>
        )}

        {/* Success — expected invalid JSON (error shown in input, no result here) */}
        {state.status === 'success' && expectedError !== null && (
          <div
            className="flex h-full items-center justify-center p-4"
            data-testid="diff-invalid-expected"
          >
            <p className="text-xs text-zinc-500">Fix expected output JSON to compare</p>
          </div>
        )}

        {/* Diff result */}
        {diffResult !== null && (
          <>
            {diffResult.isEqual ? (
              <div
                className="flex h-full items-center justify-center p-4"
                data-testid="diff-equal"
              >
                <div className="flex flex-col items-center gap-1">
                  <CheckCircle2
                    size={20}
                    className="text-green-400"
                    aria-hidden={true}
                  />
                  <p className="text-xs text-zinc-400">Output matches expected</p>
                </div>
              </div>
            ) : (
              <>
                <DiffSummaryHeader summary={diffResult.summary} />
                <ul
                  role="list"
                  aria-label={`${diffResult.entries.length} difference${diffResult.entries.length === 1 ? '' : 's'}`}
                  data-testid="diff-entries-list"
                >
                  {diffResult.entries.map((entry, i) => (
                    <DiffEntryRow key={i} entry={entry} index={i} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
