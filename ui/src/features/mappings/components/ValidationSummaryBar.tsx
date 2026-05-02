import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

import type { ValidationSummary } from '../hooks/use-engine-validation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationSummaryBarProps {
  summary: ValidationSummary;
  coveragePercent: number;
  isValidating: boolean;
  schemasLoaded: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Summary bar displayed above the rule list showing aggregated validation counts
 * and coverage percentage.
 */
export function ValidationSummaryBar({
  summary,
  coveragePercent,
  isValidating,
  schemasLoaded,
}: ValidationSummaryBarProps) {
  if (!schemasLoaded) {
    return (
      <div
        className="flex items-center gap-2 border-b border-slate-700 bg-slate-900/80 px-3 py-2"
        data-testid="validation-summary-bar"
      >
        <Info size={14} className="text-slate-500" aria-hidden="true" />
        <span className="text-xs text-slate-400">
          Attach source and target schemas to enable validation
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-700 bg-slate-900/80 px-3 py-2"
      data-testid="validation-summary-bar"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`${summary.total} rules: ${summary.valid} valid, ${summary.warnings} warnings, ${summary.errors} errors, ${coveragePercent}% coverage`}
    >
      {/* Total rules */}
      <span className="text-xs font-medium text-slate-300">
        {summary.total} {summary.total === 1 ? 'rule' : 'rules'}
      </span>

      {/* Valid count */}
      <span className="inline-flex items-center gap-1 text-xs text-green-400">
        <CheckCircle2 size={12} aria-hidden="true" />
        {summary.valid} valid
      </span>

      {/* Warning count */}
      {summary.warnings > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-amber-400">
          <AlertTriangle size={12} aria-hidden="true" />
          {summary.warnings} {summary.warnings === 1 ? 'warning' : 'warnings'}
        </span>
      )}

      {/* Error count */}
      {summary.errors > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-red-400">
          <XCircle size={12} aria-hidden="true" />
          {summary.errors} {summary.errors === 1 ? 'error' : 'errors'}
        </span>
      )}

      {/* Coverage */}
      <span className="text-xs text-slate-400">{coveragePercent}% coverage</span>

      {/* Validating indicator */}
      {isValidating && (
        <span className="text-xs text-slate-500 italic">Validating\u2026</span>
      )}
    </div>
  );
}
