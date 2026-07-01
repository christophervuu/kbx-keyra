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

import { useEffect, useMemo, useRef, useState } from 'react';

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

export interface UseSuggestionPreviewOptions {
  /** Optional enrichment payloads keyed by alias for external("alias") expressions. */
  externalSources?: Record<string, unknown>;
  /** Required enrichment aliases for the current preview context. */
  requiredEnrichmentAliases?: readonly string[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 150;
const EMPTY_EXTERNAL_SOURCES: Record<string, unknown> = {};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
}

/**
 * Evaluates `expression` against `sourceData` with a 150ms debounce.
 *
 * Short-circuits immediately (no debounce) when expression is empty or
 * sourceData is null — returns `{ result: null, error: null, isEvaluating: false }`.
 */
export function useSuggestionPreview(
  expression: string,
  sourceData: unknown | null,
  options: UseSuggestionPreviewOptions = {},
): UseSuggestionPreviewResult {
  const [completed, setCompleted] = useState<{
    signature: string | null;
    result: unknown | null;
    error: string | null;
  }>({ signature: null, result: null, error: null });
  const externalSources = options.externalSources ?? EMPTY_EXTERNAL_SOURCES;
  const requiredEnrichmentAliases = options.requiredEnrichmentAliases ?? [];
  const missingRequiredAliases = requiredEnrichmentAliases.filter((alias) => !(alias in externalSources));
  const missingRequiredAliasesError =
    missingRequiredAliases.length > 0
      ? `Missing required enrichment sample${missingRequiredAliases.length === 1 ? '' : 's'}: ${missingRequiredAliases.join(', ')}`
      : null;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evaluationSignature = useMemo(
    () => `${expression}\n${stableStringify(sourceData)}\n${stableStringify(externalSources)}`,
    [expression, sourceData, externalSources],
  );

  useEffect(() => {
    // Short-circuit: no data or no expression
    if (expression.trim() === '' || sourceData === null || sourceData === undefined) {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      return;
    }

    if (missingRequiredAliasesError !== null) {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      return;
    }

    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const { value, error: evalError } = evaluateExpression(expression, sourceData, {}, externalSources);
      setCompleted({
        signature: evaluationSignature,
        result: value,
        error: evalError,
      });
      debounceRef.current = null;
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [expression, sourceData, externalSources, missingRequiredAliasesError, evaluationSignature]);

  if (expression.trim() === '' || sourceData === null || sourceData === undefined) {
    return { result: null, error: null, isEvaluating: false };
  }

  if (missingRequiredAliasesError !== null) {
    return { result: null, error: missingRequiredAliasesError, isEvaluating: false };
  }

  if (completed.signature !== evaluationSignature) {
    return { result: null, error: null, isEvaluating: true };
  }

  return {
    result: completed.result,
    error: completed.error,
    isEvaluating: false,
  };
}
