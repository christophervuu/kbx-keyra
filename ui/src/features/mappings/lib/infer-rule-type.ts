// ---------------------------------------------------------------------------
// Rule type inference
// ---------------------------------------------------------------------------

/**
 * Display labels for rule types inferred from expression syntax.
 * These are display-only labels, not semantic types.
 */
export type RuleTypeLabel =
  | 'Direct Copy'
  | 'Static Value'
  | 'Conditional'
  | 'Lookup'
  | 'Array'
  | 'Transform'
  | 'Not configured';

/**
 * Map from outermost DSL function name to display label.
 * Functions not in this map fall back to "Transform".
 */
const FUNCTION_LABEL_MAP: Record<string, RuleTypeLabel> = {
  source: 'Direct Copy',
  static: 'Static Value',
  if: 'Conditional',
  valueMap: 'Lookup',
  map: 'Array',
  filter: 'Array',
};

/**
 * Infers a human-readable rule type label from the rule expression.
 *
 * Logic:
 * - Empty/whitespace expression → "Not configured"
 * - Extract outermost function name (first identifier before opening paren)
 * - Map to display label using FUNCTION_LABEL_MAP
 * - Unknown functions → "Transform" (safe fallback)
 *
 * This is purely cosmetic — it does NOT run the full parser.
 */
export function inferRuleType(expression: string): RuleTypeLabel {
  const trimmed = expression.trim();

  if (trimmed === '') {
    return 'Not configured';
  }

  // Extract the first function name: sequence of word chars before '('
  const match = trimmed.match(/^([a-zA-Z_]\w*)\s*\(/);

  if (match === null) {
    // Expression doesn't start with a function call — treat as transform
    return 'Transform';
  }

  const functionName = match[1];
  return FUNCTION_LABEL_MAP[functionName] ?? 'Transform';
}
