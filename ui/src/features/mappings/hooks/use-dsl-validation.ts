/**
 * `useDslValidation` — debounced DSL expression validation hook.
 *
 * Calls engine `parse()` with `{ registry: defaultRegistry }` after a 300ms debounce,
 * maps returned diagnostics to `ErrorDecoration[]` with character positions,
 * and exposes parse result + derived state for the raw editor.
 *
 * Position mapping strategy:
 * - KEYRA-E001 / KEYRA-E004 (syntax errors) → `ast: null`, fallback = underline full expression
 * - KEYRA-E002 / KEYRA-E003 (unknown function, arity) → AST is available; walk to find the
 *   `FunctionCallNode` whose name matches `diagnostic.location.function` and use its `start`/`end`
 * - All other diagnostics without char info → fallback to full expression
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { defaultRegistry, parse } from '@/lib/engine';
import type { AstNode, Diagnostic, ParseResult } from '@/lib/engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ErrorDecoration {
  /** Start character offset in the expression string (inclusive) */
  readonly start: number;
  /** End character offset in the expression string (exclusive) */
  readonly end: number;
  readonly message: string;
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
}

export interface UseDslValidationResult {
  /** Last parse result, or null if expression is empty or parsing hasn't run yet */
  readonly parseResult: ParseResult | null;
  /** All diagnostics from the last parse, or empty when expression is empty */
  readonly diagnostics: readonly Diagnostic[];
  /** True when the expression is syntactically valid or empty */
  readonly isValid: boolean;
  /** True during the 300ms debounce window (parse hasn't run yet after a change) */
  readonly isValidating: boolean;
  /** Error/warning positions for overlay rendering */
  readonly errorDecorations: readonly ErrorDecoration[];
}

// ---------------------------------------------------------------------------
// AST walker
// ---------------------------------------------------------------------------

/**
 * Walk the AST to find the first `FunctionCallNode` with the given name.
 * Returns its character range, or null if not found.
 */
function findFunctionNodePosition(
  node: AstNode,
  name: string,
): { start: number; end: number } | null {
  if (node.type === 'FunctionCall') {
    if (node.name === name) {
      return { start: node.start, end: node.end };
    }
    for (const arg of node.arguments) {
      const found = findFunctionNodePosition(arg, name);
      if (found !== null) return found;
    }
    return null;
  }

  if (node.type === 'ObjectTemplate') {
    for (const prop of node.properties) {
      const found = findFunctionNodePosition(prop.value, name);
      if (found !== null) return found;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Diagnostic → ErrorDecoration mapping
// ---------------------------------------------------------------------------

export function mapDiagnosticsToDecorations(
  parseResult: ParseResult,
  expression: string,
): ErrorDecoration[] {
  const fullRange = { start: 0, end: expression.length };

  return parseResult.diagnostics.map((d): ErrorDecoration => {
    // Attempt AST-based position resolution for function-related diagnostics
    let range = fullRange;
    if (parseResult.ast !== null && d.location?.function !== undefined) {
      const found = findFunctionNodePosition(parseResult.ast, d.location.function);
      if (found !== null) {
        range = found;
      }
    }

    return {
      start: range.start,
      end: range.end,
      message: d.message,
      code: d.code,
      severity: d.severity,
    };
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;

/**
 * Validates a DSL expression string using the engine parser with the default function registry.
 *
 * @param expression - The DSL expression to validate
 */
export function useDslValidation(expression: string): UseDslValidationResult {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearTimer();

    if (expression === '') {
      setParseResult(null);
      setIsValidating(false);
      return;
    }

    setIsValidating(true);

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      try {
        const result = parse(expression, { registry: defaultRegistry });
        setParseResult(result);
      } catch {
        // Engine errors must not crash the UI
        setParseResult({ success: false, ast: null, diagnostics: [] });
      }
      setIsValidating(false);
    }, DEBOUNCE_MS);

    return clearTimer;
  }, [expression, clearTimer]);

  // Derived state
  const isValid = expression === '' || (parseResult?.success === true);
  const diagnostics: readonly Diagnostic[] = parseResult?.diagnostics ?? [];
  const errorDecorations: readonly ErrorDecoration[] =
    parseResult !== null ? mapDiagnosticsToDecorations(parseResult, expression) : [];

  return {
    parseResult,
    diagnostics,
    isValid,
    isValidating,
    errorDecorations,
  };
}
