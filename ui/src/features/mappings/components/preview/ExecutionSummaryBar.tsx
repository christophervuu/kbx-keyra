import type { PreviewExecutionState } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExecutionSummaryBarProps {
  state: PreviewExecutionState;
  className?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({ color }: { color: string }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`}
      aria-hidden="true"
    />
  );
}

function InlineSpinner() {
  return (
    <span
      role="status"
      aria-label="Executing…"
      className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"
    />
  );
}

function SeverityBadge({
  count,
  label,
  colorClass,
  testId,
}: {
  count: number;
  label: string;
  colorClass: string;
  testId?: string;
}) {
  if (count === 0) return null;
  return (
    <span
      className={`rounded px-1 py-0.5 text-[10px] font-bold leading-none ${colorClass}`}
      aria-label={`${count} ${label}${count === 1 ? '' : 's'}`}
      data-testid={testId}
    >
      {count}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ExecutionSummaryBar — compact sticky bar showing at-a-glance execution status.
 *
 * Renders between the top bar and the result panel area. Displays status,
 * duration, rule stats, and diagnostic severity counts derived from
 * `PreviewExecutionState`. Pure component — no side effects.
 */
export function ExecutionSummaryBar({ state, className = '' }: ExecutionSummaryBarProps) {
  return (
    <div
      className={`flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900/80 px-3 py-1 text-xs text-slate-400 backdrop-blur-sm ${className}`}
      data-testid="execution-summary-bar"
      aria-live="polite"
      aria-atomic="true"
    >
      {state.status === 'idle' && (
        <span className="text-slate-500" data-testid="summary-idle">
          No results yet
        </span>
      )}

      {state.status === 'executing' && (
        <>
          <InlineSpinner />
          <span data-testid="summary-executing">Executing…</span>
        </>
      )}

      {state.status === 'success' && (() => {
        const { result } = state;
        const stats = result.stats;
        const diagnostics = result.diagnostics ?? [];

        const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
        const warnCount = diagnostics.filter((d) => d.severity === 'warning').length;
        const infoCount = diagnostics.filter((d) => d.severity === 'info').length;

        return (
          <>
            <StatusDot color="bg-green-500" />
            <span className="font-medium text-green-400" data-testid="summary-success">
              Success
            </span>

            {stats !== undefined && (
              <>
                <span
                  className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400"
                  data-testid="summary-duration"
                >
                  {stats.durationMs}ms
                </span>

                <span className="text-slate-500" data-testid="summary-rule-stats">
                  {stats.rulesEvaluated} rule{stats.rulesEvaluated === 1 ? '' : 's'}:{' '}
                  <span className="text-green-400">{stats.rulesSucceeded} passed</span>
                  {stats.rulesFailed > 0 && (
                    <>
                      {', '}
                      <span className="text-red-400">{stats.rulesFailed} failed</span>
                    </>
                  )}
                </span>
              </>
            )}

            {(errorCount > 0 || warnCount > 0 || infoCount > 0) && (
              <span className="flex items-center gap-1" data-testid="summary-diagnostics">
                <SeverityBadge
                  count={errorCount}
                  label="error"
                  colorClass="bg-red-500/20 text-red-400"
                  testId="summary-diag-error"
                />
                <SeverityBadge
                  count={warnCount}
                  label="warning"
                  colorClass="bg-amber-500/20 text-amber-400"
                  testId="summary-diag-warning"
                />
                <SeverityBadge
                  count={infoCount}
                  label="info"
                  colorClass="bg-blue-500/20 text-blue-400"
                  testId="summary-diag-info"
                />
              </span>
            )}
          </>
        );
      })()}

      {state.status === 'error' && (
        <>
          <StatusDot color="bg-red-500" />
          <span className="font-medium text-red-400" data-testid="summary-error">
            Error
          </span>
          <span className="truncate text-slate-500" data-testid="summary-error-message">
            {state.error}
          </span>
        </>
      )}

      {state.status === 'timeout' && (
        <>
          <StatusDot color="bg-amber-500" />
          <span className="font-medium text-amber-400" data-testid="summary-timeout">
            Timeout
          </span>
        </>
      )}
    </div>
  );
}
