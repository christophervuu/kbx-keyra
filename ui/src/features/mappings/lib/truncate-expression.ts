// ---------------------------------------------------------------------------
// truncateExpression
// ---------------------------------------------------------------------------
//
// Formats a DSL expression for display in a compact row summary.
//
// Rules (max 60 chars by default):
//   1. If the full expression fits within maxLen, return it unchanged.
//   2. Otherwise, always show the outermost function name.
//   3. Always show the first argument (primary source path) if it fits.
//   4. Truncate remaining arguments with `…`.
//   5. Object templates inside map() show as `{…}`.
//   6. If no function call is detected, truncate with trailing `…`.
//
// Examples:
//   source("firstName")                    → "source("firstName")"  (≤60, full)
//   concat(source("firstName"), " ", …)    → "concat(source("firstName"), …)"
//   map(source("items"), {field: …})       → "map(source("items"), {…})"

const ELLIPSIS = '\u2026';

/**
 * Extracts the outermost function name and its arguments from a DSL expression.
 * Returns null if the expression is not a function call.
 */
function parseFunctionCall(expr: string): { name: string; args: string[] } | null {
  const parenIdx = expr.indexOf('(');
  if (parenIdx === -1) return null;

  const name = expr.slice(0, parenIdx).trim();
  if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return null;

  // Find the matching closing paren
  let depth = 0;
  let start = parenIdx;
  let end = -1;
  for (let i = parenIdx; i < expr.length; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;

  const argsStr = expr.slice(parenIdx + 1, end);
  const args = splitTopLevelArgs(argsStr);
  return { name, args };
}

/**
 * Splits a comma-separated argument string at the top level (not inside parens/brackets/braces).
 */
function splitTopLevelArgs(argsStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of argsStr) {
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

/**
 * Normalizes an argument for display — object templates become `{…}`.
 */
function normalizeArg(arg: string): string {
  const trimmed = arg.trim();
  if (trimmed.startsWith('{')) return `{${ELLIPSIS}}`;
  return trimmed;
}

/**
 * Truncates a DSL expression for compact display.
 *
 * @param expr   The full DSL expression string.
 * @param maxLen Maximum display length (default 60).
 * @returns      A display string ≤ maxLen characters (approximately).
 */
export function truncateExpression(expr: string, maxLen = 60): string {
  if (!expr) return expr;
  if (expr.length <= maxLen) return expr;

  const parsed = parseFunctionCall(expr);
  if (!parsed) {
    // Not a function call — plain truncation
    return expr.slice(0, maxLen) + ELLIPSIS;
  }

  const { name, args } = parsed;

  if (args.length === 0) {
    // No args — just show name()
    const candidate = `${name}()`;
    return candidate.length <= maxLen ? candidate : name.slice(0, maxLen) + ELLIPSIS;
  }

  // Always include first arg (normalized)
  const firstArg = normalizeArg(args[0]);
  const hasMore = args.length > 1;

  const full = hasMore
    ? `${name}(${firstArg}, ${ELLIPSIS})`
    : `${name}(${firstArg})`;

  if (full.length <= maxLen) return full;

  // First arg itself is too long — truncate it
  const overhead = `${name}(, ${ELLIPSIS})`.length; // name + wrapper chars
  const available = maxLen - overhead;
  if (available > 3) {
    const truncatedArg = firstArg.slice(0, available) + ELLIPSIS;
    return `${name}(${truncatedArg}, ${ELLIPSIS})`;
  }

  // Fallback: just show function name with ellipsis
  return `${name}(${ELLIPSIS})`;
}
