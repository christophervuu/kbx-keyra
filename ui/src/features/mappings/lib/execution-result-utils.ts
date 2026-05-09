import type { PreviewExecutionState } from '@/lib/types/domain';
import type { DiffResult, DiffSummary } from '@/lib/types/diff';

// ---------------------------------------------------------------------------
// ExecutionVerdict
// ---------------------------------------------------------------------------

/**
 * Coarse verdict derived from execution state and optional diff result.
 *
 * - `idle`      — no execution has run yet
 * - `executing` — execution is in progress
 * - `pass`      — execution succeeded, no error diagnostics, diff matches (or no diff)
 * - `fail`      — execution succeeded but has error diagnostics or diff mismatch
 * - `error`     — execution failed (engine error or timeout)
 */
export type ExecutionVerdict = 'pass' | 'fail' | 'error' | 'idle' | 'executing';

/**
 * Derive a pass/fail/error verdict from execution state and an optional diff result.
 *
 * Logic:
 * - idle → 'idle'
 * - executing → 'executing'
 * - error | timeout → 'error'
 * - success:
 *   - any diagnostic with severity === 'error' → 'fail'
 *   - diffResult provided and !diffResult.isEqual → 'fail'
 *   - otherwise → 'pass'
 *
 * AE-06: when no expected output is provided (diffResult is undefined/null),
 * the verdict is 'pass' as long as there are no error diagnostics.
 */
export function deriveExecutionVerdict(
  state: PreviewExecutionState,
  diffResult?: DiffResult | null,
): ExecutionVerdict {
  if (state.status === 'idle') return 'idle';
  if (state.status === 'executing') return 'executing';
  if (state.status === 'error' || state.status === 'timeout') return 'error';

  // state.status === 'success'
  const diagnostics = state.result.diagnostics ?? [];
  const hasErrorDiagnostic = diagnostics.some((d) => d.severity === 'error');
  if (hasErrorDiagnostic) return 'fail';

  if (diffResult != null && !diffResult.isEqual) return 'fail';

  return 'pass';
}

// ---------------------------------------------------------------------------
// formatDiffSummary
// ---------------------------------------------------------------------------

const CATEGORY_SHORT: Record<string, string> = {
  missing_field: 'missing',
  extra_field: 'extra',
  value_mismatch: 'value',
  type_mismatch: 'type',
  null_mismatch: 'null',
  structural_mismatch: 'structural',
};

/**
 * Generate a human-readable summary string from a `DiffSummary`.
 *
 * Examples:
 * - `{ total: 0 }` → "" (empty — isEqual is true)
 * - `{ total: 3, byCategory: { missing_field: 1, value_mismatch: 2, ... } }` → "3 mismatches: 1 missing, 2 value"
 * - `{ total: 1, byCategory: { type_mismatch: 1, ... } }` → "1 mismatch: 1 type"
 */
export function formatDiffSummary(summary: DiffSummary): string {
  if (summary.total === 0) return '';

  const parts = Object.entries(summary.byCategory)
    .filter(([, count]) => count > 0)
    .map(([cat, count]) => `${count} ${CATEGORY_SHORT[cat] ?? cat}`);

  const label = summary.total === 1 ? 'mismatch' : 'mismatches';
  return `${summary.total} ${label}${parts.length > 0 ? ': ' + parts.join(', ') : ''}`;
}
