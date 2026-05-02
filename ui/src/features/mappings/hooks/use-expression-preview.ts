/**
 * useExpressionPreview — Parses and evaluates a DSL expression against sample data.
 *
 * Debounces evaluation by 300ms. Returns null result when expression is empty
 * or sourceData is null. Catches evaluation errors and surfaces them as
 * `error: string`.
 *
 * @see ExpressionPreview component — consumes this hook's output
 * @see T-10 / AE-08
 */

import { useEffect, useRef, useState } from 'react';
import { evaluateExpression } from '@/lib/engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseExpressionPreviewOptions {
  /** The DSL expression string to evaluate. */
  readonly expression: string;
  /** Source data to evaluate against. Pass null for no-data state. */
  readonly sourceData: unknown;
  /** Mapping constants (key → value). Defaults to empty object. */
  readonly constants?: Record<string, unknown>;
  /** External source data map. Defaults to empty object. */
  readonly externalSources?: Record<string, unknown>;
}

export interface ExpressionPreviewState {
  /** Evaluated result value — null if no data, empty expression, or error. */
  readonly result: unknown | null;
  /** Error message when evaluation fails — null on success. */
  readonly error: string | null;
  /** True while the 300ms debounce is pending or evaluation is running. */
  readonly isEvaluating: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;

/**
 * Returns the evaluated result of a DSL expression with 300ms debounce.
 *
 * Short-circuits immediately (no debounce) when expression is empty or sourceData
 * is null — returns `{ result: null, error: null, isEvaluating: false }`.
 */
export function useExpressionPreview({
  expression,
  sourceData,
  constants = {},
  externalSources = {},
}: UseExpressionPreviewOptions): ExpressionPreviewState {
  const [result, setResult] = useState<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Short-circuit: no data or no expression — immediate null result
    if (expression.trim() === '' || sourceData === null || sourceData === undefined) {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setResult(null);
      setError(null);
      setIsEvaluating(false);
      return;
    }

    // Start debounce window
    setIsEvaluating(true);

    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const { value, error: evalError } = evaluateExpression(
        expression,
        sourceData,
        constants,
        externalSources,
      );
      setResult(value);
      setError(evalError);
      setIsEvaluating(false);
      debounceRef.current = null;
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expression, sourceData]);

  return { result, error, isEvaluating };
}
