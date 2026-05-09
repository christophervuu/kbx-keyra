import { CheckCircle2, XCircle, AlertCircle, SkipForward, Clock, AlertTriangle } from 'lucide-react';

import type { TestRunResult } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SuiteSummaryRow {
  readonly testCaseId: string;
  readonly testCaseName: string;
  readonly result: TestRunResult;
}

export interface SuiteSummaryProps {
  /** All rows to display — one per test case that was run. */
  rows: readonly SuiteSummaryRow[];
  /** Called when the user clicks a test row to load its results. */
  onSelectTest: (testCaseId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function VerdictIcon({ status }: { status: TestRunResult['status'] }) {
  if (status === 'pass') {
    return <CheckCircle2 size={12} className="shrink-0 text-green-400" aria-hidden="true" />;
  }
  if (status === 'error') {
    return <AlertCircle size={12} className="shrink-0 text-amber-400" aria-hidden="true" />;
  }
  return <XCircle size={12} className="shrink-0 text-red-400" aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * SuiteSummary — inline suite results after batch execution.
 *
 * Renders a header with total/passed/failed/errored counts and a scrollable
 * list of per-test result rows. Clicking a row fires `onSelectTest` to load
 * that test's results into the standard Output/Diagnostics/Trace/Diff tabs.
 *
 * FS-035 T-06.
 */
export function SuiteSummary({ rows, onSelectTest }: SuiteSummaryProps) {
  const total = rows.length;
  const passed = rows.filter((r) => r.result.status === 'pass').length;
  const failed = rows.filter((r) => r.result.status === 'fail').length;
  const errored = rows.filter((r) => r.result.status === 'error').length;

  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden border-b border-slate-800 bg-slate-900/60"
      data-testid="suite-summary"
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center gap-3 border-b border-slate-800 px-3 py-1.5 text-xs"
        data-testid="suite-summary-header"
      >
        <span className="font-medium text-slate-300">
          {total} test{total === 1 ? '' : 's'}:
        </span>
        <span className="text-green-400" data-testid="suite-passed-count">
          {passed} passed
        </span>
        {failed > 0 && (
          <span className="text-red-400" data-testid="suite-failed-count">
            {failed} failed
          </span>
        )}
        {errored > 0 && (
          <span className="text-amber-400" data-testid="suite-errored-count">
            {errored} error{errored === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Result rows */}
      <ul
        role="list"
        aria-label="Suite test results"
        className="max-h-40 overflow-y-auto"
        data-testid="suite-summary-list"
      >
        {rows.map((row) => (
          <li key={row.testCaseId}>
            <button
              type="button"
              onClick={() => { onSelectTest(row.testCaseId); }}
              data-testid={`suite-row-${row.testCaseId}`}
              className={[
                'flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors',
                'hover:bg-slate-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
                'text-slate-300',
              ].join(' ')}
            >
              <VerdictIcon status={row.result.status} />
              <span className="min-w-0 flex-1 truncate text-left">{row.testCaseName}</span>
              <span
                className="flex shrink-0 items-center gap-1 text-slate-500"
                data-testid={`suite-row-duration-${row.testCaseId}`}
              >
                <Clock size={10} aria-hidden="true" />
                {row.result.durationMs}ms
              </span>
              {row.result.errorCount > 0 && (
                <span
                  className="flex shrink-0 items-center gap-0.5 text-red-400"
                  aria-label={`${row.result.errorCount} error${row.result.errorCount === 1 ? '' : 's'}`}
                  data-testid={`suite-row-errors-${row.testCaseId}`}
                >
                  <AlertTriangle size={10} aria-hidden="true" />
                  {row.result.errorCount}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
