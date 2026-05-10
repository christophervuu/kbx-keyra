import type { Diagnostic, TraceEntry } from '@keyra/engine';
import type { FailureExplanation } from '../types';

/**
 * Pattern-matches on a `Diagnostic` (and optional correlated `TraceEntry`) to
 * produce a plain-language explanation for common mapping failure cases.
 *
 * Matching strategy:
 * 1. Code-based matches are authoritative and checked first.
 * 2. Message-text fallbacks are used only where no stable code pattern exists.
 * 3. Patterns are ordered from most specific to least specific.
 *
 * Returns `null` when no pattern matches.
 */
export function explainDiagnostic(
  diagnostic: Diagnostic,
  traceEntry?: TraceEntry,
): FailureExplanation | null {
  const code = diagnostic.code ?? '';
  const message = diagnostic.message ?? '';
  const lowerMessage = message.toLowerCase();
  const hasNullOutput = traceEntry?.outputValue === null;

  // ---------------------------------------------------------------------------
  // 1. Null output with source resolution failure (most specific)
  // ---------------------------------------------------------------------------
  if (
    hasNullOutput &&
    (code.includes('SOURCE') ||
      lowerMessage.includes('source') ||
      lowerMessage.includes('not found') ||
      lowerMessage.includes('undefined'))
  ) {
    return {
      summary:
        'This field produced null because the source path resolved to no value. Check that the source field name matches your input data.',
      suggestion:
        'Verify the source path exists in your test data, or use default() to provide a fallback value.',
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Type mismatch (code-based first, then message fallback)
  // ---------------------------------------------------------------------------
  if (
    code.includes('TYPE_MISMATCH') ||
    code.includes('TYPE') ||
    lowerMessage.includes('type mismatch')
  ) {
    return {
      summary: 'The expression returned a different type than the target field expects.',
      suggestion:
        'Consider wrapping with cast() to convert the value, or review the transform chain output type.',
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Missing / unresolved source path
  // ---------------------------------------------------------------------------
  if (
    code.includes('SOURCE') ||
    code.includes('PATH') ||
    (lowerMessage.includes('source') &&
      (lowerMessage.includes('not found') || lowerMessage.includes('undefined'))) ||
    (lowerMessage.includes('path') && lowerMessage.includes('not found'))
  ) {
    return {
      summary:
        'The source path referenced in this expression was not found in the input data.',
      suggestion:
        'Check for typos in the source() path argument and verify the field exists in your test data.',
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Unresolved / unknown function
  // ---------------------------------------------------------------------------
  if (
    code.includes('FUNC') ||
    code.includes('UNKNOWN_FUNCTION') ||
    lowerMessage.includes('unknown function') ||
    lowerMessage.includes('unresolved function') ||
    lowerMessage.includes('is not a function') ||
    lowerMessage.includes('function not found')
  ) {
    return {
      summary: 'The function name in this expression is not recognized by the DSL.',
      suggestion:
        'Check spelling against the DSL function reference panel, or verify the function name is correct.',
    };
  }

  // ---------------------------------------------------------------------------
  // 5. General null output (no specific source error)
  // ---------------------------------------------------------------------------
  if (hasNullOutput) {
    return {
      summary:
        'This field evaluated to null. This may indicate a missing source value or an expression that doesn\'t produce output for the given input.',
      suggestion:
        'Try running with different test data, or check the expression logic.',
    };
  }

  // ---------------------------------------------------------------------------
  // 6. No match
  // ---------------------------------------------------------------------------
  return null;
}
