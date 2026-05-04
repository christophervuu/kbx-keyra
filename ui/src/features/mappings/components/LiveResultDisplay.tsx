/**
 * LiveResultDisplay — shows evaluated expression output (FS-023 T-07, AE-07/08).
 *
 * Uses `useExpressionPreview` to evaluate the expression against sourceData.
 * Shows a "Load test data" prompt when sourceData is null.
 */

import { useExpressionPreview } from '../hooks/use-expression-preview';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveResultDisplayProps {
  /** The DSL expression to evaluate. */
  readonly expression: string;
  /** Source data to evaluate against. Pass null for no-data state. */
  readonly sourceData: unknown | null;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatResult(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LiveResultDisplay({ expression, sourceData, className }: LiveResultDisplayProps) {
  const { result, error, isEvaluating } = useExpressionPreview({
    expression,
    sourceData,
  });

  return (
    <div
      className={['space-y-1', className ?? ''].filter(Boolean).join(' ')}
      data-testid="live-result-display"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Result
      </span>

      <div
        className="min-h-[2.5rem] rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs leading-relaxed"
        data-testid="live-result-content"
      >
        {sourceData === null || sourceData === undefined ? (
          <span className="text-zinc-600 italic" data-testid="live-result-no-data">
            Load test data to see live results.
          </span>
        ) : isEvaluating ? (
          <span
            className="inline-block h-3 w-24 animate-pulse rounded bg-zinc-700"
            role="status"
            aria-label="Evaluating…"
            data-testid="live-result-loading"
          />
        ) : error !== null ? (
          <span className="text-red-400" data-testid="live-result-error">
            {error}
          </span>
        ) : result !== null ? (
          <span className="text-green-400" data-testid="live-result-value">
            {formatResult(result)}
          </span>
        ) : (
          <span className="text-zinc-600 italic" data-testid="live-result-no-data">
            Load test data to see live results.
          </span>
        )}
      </div>
    </div>
  );
}
