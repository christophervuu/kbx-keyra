/**
 * ValidationSummaryRow.tsx — FS-051 T-04
 *
 * Shared pinned bar that shows error, warning, and incomplete counts for a
 * builder panel. Renders nothing when all counts are zero.
 *
 * Used by both ArrayBuilder (extracted from inline T-11 implementation) and
 * ScalarFieldBuilder (added in T-04).
 */

import { AlertCircle, AlertTriangle, Circle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationSummaryRowProps {
  readonly errorCount: number;
  readonly warningCount: number;
  readonly incompleteCount: number;
  /** data-testid applied to the root element. Defaults to "validation-summary-row". */
  readonly testId?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ValidationSummaryRow({
  errorCount,
  warningCount,
  incompleteCount,
  testId = 'validation-summary-row',
}: ValidationSummaryRowProps) {
  if (errorCount === 0 && warningCount === 0 && incompleteCount === 0) {
    return null;
  }

  return (
    <div
      data-testid={testId}
      className="shrink-0 flex items-center gap-3 border-b border-slate-700 bg-slate-900/40 px-4 py-2"
    >
      {errorCount > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
          <AlertCircle size={10} aria-hidden="true" />
          {errorCount} error{errorCount !== 1 ? 's' : ''}
        </span>
      )}
      {warningCount > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
          <AlertTriangle size={10} aria-hidden="true" />
          {warningCount} warning{warningCount !== 1 ? 's' : ''}
        </span>
      )}
      {incompleteCount > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
          <Circle size={10} aria-hidden="true" />
          {incompleteCount} incomplete
        </span>
      )}
    </div>
  );
}
