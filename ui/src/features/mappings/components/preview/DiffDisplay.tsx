import { useState, useMemo } from 'react';

import type { DiffEntry } from '@/lib/types/diff';
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
// Helpers
// ---------------------------------------------------------------------------

const MAX_VALUE_DISPLAY_LEN = 60;

function formatValue(value: unknown): string {
  const raw = JSON.stringify(value);
  if (raw.length > MAX_VALUE_DISPLAY_LEN) {
    return raw.slice(0, MAX_VALUE_DISPLAY_LEN) + '…';
  }
  return raw;
}

function entryDescription(entry: DiffEntry): string {
  switch (entry.type) {
    case 'added':
      return `"${entry.path}" is present in output but not in expected`;
    case 'removed':
      return `"${entry.path}" is expected but missing from output`;
    case 'changed':
      return `"${entry.path}": expected ${formatValue(entry.expected)} → got ${formatValue(entry.actual)}`;
  }
}

function entryRowClass(type: DiffEntry['type']): string {
  switch (type) {
    case 'added':
      return 'bg-green-900/30 border-l-2 border-green-500';
    case 'removed':
      return 'bg-red-900/30 border-l-2 border-red-500';
    case 'changed':
      return 'bg-amber-900/30 border-l-2 border-amber-500';
  }
}

function entryTextClass(type: DiffEntry['type']): string {
  switch (type) {
    case 'added':
      return 'text-green-400';
    case 'removed':
      return 'text-red-400';
    case 'changed':
      return 'text-amber-300';
  }
}

function entryTypeLabel(type: DiffEntry['type']): string {
  switch (type) {
    case 'added':
      return 'Added';
    case 'removed':
      return 'Removed';
    case 'changed':
      return 'Changed';
  }
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
 * entries (added / removed / changed).
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
                  <span className="text-base text-green-400" aria-hidden="true">
                    ✓
                  </span>
                  <p className="text-xs text-zinc-400">Output matches expected</p>
                </div>
              </div>
            ) : (
              <ul
                role="list"
                aria-label={`${diffResult.entries.length} difference${diffResult.entries.length === 1 ? '' : 's'}`}
                data-testid="diff-entries-list"
              >
                {diffResult.entries.map((entry, i) => (
                  <li
                    key={i}
                    className={`px-3 py-2 text-xs ${entryRowClass(entry.type)}`}
                    data-testid={`diff-entry-${i}`}
                    data-entry-type={entry.type}
                  >
                    <span
                      className={`mr-1.5 font-semibold ${entryTextClass(entry.type)}`}
                      aria-label={entryTypeLabel(entry.type)}
                    >
                      {entryTypeLabel(entry.type)}
                    </span>
                    <span className="text-zinc-300">{entryDescription(entry)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
