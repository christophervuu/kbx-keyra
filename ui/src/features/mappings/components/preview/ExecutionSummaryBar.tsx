import { CheckCircle2, XCircle, AlertTriangle, Clock, Layers } from 'lucide-react';

import type { PreviewExecutionState } from '@/lib/types/domain';
import type { DiffResult } from '@/lib/types/diff';
import { deriveExecutionVerdict } from '../../lib/execution-result-utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExecutionSummaryBarProps {
  state: PreviewExecutionState;
  /** Optional diff result — when provided and not equal, verdict becomes 'fail'. */
  diffResult?: DiffResult | null;
  /**
   * Human-readable diff summary label (e.g. "2 mismatches: 1 type, 1 value").
   * Wired by T-04. Rendered as an additional badge when provided.
   */
  diffSummaryLabel?: string;
  /** Mapping version number — rendered as "v{n}" badge. */
  mappingVersion?: number;
  /** Environment label — defaults to "Local". */
  environmentLabel?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

function ContextBadge({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <span
      className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400"
      data-testid={testId}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ExecutionSummaryBar — compact sticky bar showing at-a-glance execution status.
 *
 * Renders between the top bar and the result panel area. Hidden when idle.
 * Displays verdict (pass/fail/error), duration, diagnostics, rules summary,
 * and version/environment context (FS-035 T-03).
 */
export function ExecutionSummaryBar({
  state,
  diffResult,
  diffSummaryLabel,
  mappingVersion,
  environmentLabel = 'Local',
  className = '',
}: ExecutionSummaryBarProps) {
  const verdict = deriveExecutionVerdict(state, diffResult);

  // Hidden before first execution
  if (verdict === 'idle') return null;

  // Background tint by verdict
  const bgClass =
    verdict === 'executing'
      ? 'bg-slate-900/80'
      : verdict === 'pass'
        ? 'bg-green-950/60'
        : verdict === 'fail'
          ? 'bg-red-950/60'
          : 'bg-amber-950/60'; // error

  return (
    <div
      className={`flex shrink-0 items-center gap-3 border-b border-slate-800 px-3 py-1 text-xs text-slate-400 backdrop-blur-sm ${bgClass} ${className}`}
      data-testid="execution-summary-bar"
      aria-live="polite"
      aria-atomic="true"
    >
      {/* Executing */}
      {verdict === 'executing' && (
        <>
          <InlineSpinner />
          <span data-testid="summary-executing">Executing…</span>
        </>
      )}

      {/* Pass */}
      {verdict === 'pass' && (
        <>
          <CheckCircle2 size={13} className="shrink-0 text-green-400" aria-hidden="true" />
          <span className="font-medium text-green-400" data-testid="summary-verdict-pass">
            Passed
          </span>
        </>
      )}

      {/* Fail */}
      {verdict === 'fail' && (
        <>
          <XCircle size={13} className="shrink-0 text-red-400" aria-hidden="true" />
          <span className="font-medium text-red-400" data-testid="summary-verdict-fail">
            Failed
          </span>
        </>
      )}

      {/* Error */}
      {verdict === 'error' && (
        <>
          <AlertTriangle size={13} className="shrink-0 text-amber-400" aria-hidden="true" />
          <span className="font-medium text-amber-400" data-testid="summary-verdict-error">
            Error
          </span>
          {state.status === 'error' && (
            <span className="truncate text-slate-500" data-testid="summary-error-message">
              {state.error}
            </span>
          )}
          {state.status === 'timeout' && (
            <span className="text-slate-500" data-testid="summary-timeout-message">
              Execution timed out
            </span>
          )}
        </>
      )}

      {/* Stats — only when success */}
      {state.status === 'success' && (() => {
        const { result } = state;
        const stats = result.stats;
        const diagnostics = result.diagnostics ?? [];

        const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
        const warnCount = diagnostics.filter((d) => d.severity === 'warning').length;
        const infoCount = diagnostics.filter((d) => d.severity === 'info').length;

        return (
          <>
            {/* Duration */}
            {stats !== undefined && (
              <span
                className="flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400"
                data-testid="summary-duration"
              >
                <Clock size={10} aria-hidden="true" />
                {stats.durationMs}ms
              </span>
            )}

            {/* Diagnostics severity badges */}
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

            {/* Rules summary */}
            {stats !== undefined && (
              <span className="flex items-center gap-1 text-slate-500" data-testid="summary-rule-stats">
                <Layers size={10} aria-hidden="true" />
                <span className={stats.rulesFailed === 0 ? 'text-green-400' : 'text-amber-400'}>
                  {stats.rulesSucceeded}/{stats.rulesEvaluated}
                </span>
                {' '}rule{stats.rulesEvaluated === 1 ? '' : 's'}
              </span>
            )}

            {/* Diff summary label (wired by T-04) */}
            {diffSummaryLabel !== undefined && (
              <span
                className="rounded bg-red-900/40 px-1.5 py-0.5 text-[10px] text-red-300"
                data-testid="summary-diff-label"
              >
                {diffSummaryLabel}
              </span>
            )}
          </>
        );
      })()}

      {/* Spacer */}
      <span className="flex-1" aria-hidden="true" />

      {/* Context: version + environment */}
      {mappingVersion !== undefined && (
        <ContextBadge testId="summary-version">v{mappingVersion}</ContextBadge>
      )}
      <ContextBadge testId="summary-environment">{environmentLabel}</ContextBadge>
    </div>
  );
}
