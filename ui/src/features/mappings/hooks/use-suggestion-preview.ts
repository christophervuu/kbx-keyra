/**
 * useSuggestionPreview — evaluates a single DSL expression against source data.
 *
 * Debounces evaluation by 150ms. Returns null result when expression is empty
 * or sourceData is null. Catches evaluation errors and surfaces them as
 * `error: string`.
 *
 * Lighter-weight than `useExpressionPreview` (no constants/externalSources)
 * and uses a shorter 150ms debounce for snappier card-level feedback.
 */

import { useEffect, useRef, useState } from 'react';

import { evaluateExpression } from '@/lib/engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseSuggestionPreviewResult {
  /** Evaluated result value — null if no data, empty expression, or error. */
  result: unknown | null;
  /** Error message when evaluation fails — null on success. */
  error: string | null;
  /** True while the 150ms debounce is pending or evaluation is running. */
  isEvaluating: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 150;

/**
 * Evaluates `expression` against `sourceData` with a 150ms debounce.
 *
 * Short-circuits immediately (no debounce) when expression is empty or
 * sourceData is null — returns `{ result: null, error: null, isEvaluating: false }`.
 */
export function useSuggestionPreview(
  expression: string,
  sourceData: unknown | null,
): UseSuggestionPreviewResult {
  const [result, setResult] = useState<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Short-circuit: no data or no expression
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

    setIsEvaluating(true);

    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const { value, error: evalError } = evaluateExpression(expression, sourceData);
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
