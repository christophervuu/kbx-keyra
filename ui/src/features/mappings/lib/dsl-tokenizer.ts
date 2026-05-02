/**
 * DSL Tokenizer — regex-based visual tokenizer for syntax highlighting.
 *
 * This tokenizer is for visual display ONLY. It does not produce an AST and
 * does not perform semantic validation. The engine's `parse()` handles real
 * validation (T-04).
 *
 * Tokens are classified from the raw expression string and returned as an
 * array of `DslToken` objects, each with a `type`, `text`, `start`, and `end`.
 * Together they cover the entire input string with no gaps (unknown tokens
 * fill any unrecognized characters).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DslTokenType =
  | 'function-name'
  | 'string-literal'
  | 'number-literal'
  | 'boolean-literal'
  | 'null-literal'
  | 'punctuation'
  | 'comma'
  | 'brace'
  | 'colon'
  | 'whitespace'
  | 'unknown';

export interface DslToken {
  readonly type: DslTokenType;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenizes a DSL expression string into an array of `DslToken` objects.
 *
 * Token classification priority (in order of attempt at each position):
 * 1. Whitespace
 * 2. Double-quoted string literal (handles `\"` escapes)
 * 3. Identifier followed by `(` → function-name
 * 4. `true` / `false` (must be followed by non-word char or end) → boolean-literal
 * 5. `null` (must be followed by non-word char or end) → null-literal
 * 6. Number (integer or decimal, optional leading minus) → number-literal
 * 7. `(` / `)` → punctuation
 * 8. `,` → comma
 * 9. `{` / `}` → brace
 * 10. `:` → colon
 * 11. Bare identifier (e.g. unknown keyword) → unknown
 * 12. Single-character catch-all → unknown
 *
 * Returns an empty array for an empty expression.
 */
export function tokenizeDsl(expression: string): DslToken[] {
  if (expression === '') {
    return [];
  }

  const tokens: DslToken[] = [];
  let pos = 0;
  const len = expression.length;

  while (pos < len) {
    const ch = expression[pos];

    // 1. Whitespace (space, tab, newline, carriage return)
    if (/\s/.test(ch)) {
      const start = pos;
      while (pos < len && /\s/.test(expression[pos])) {
        pos += 1;
      }
      tokens.push({ type: 'whitespace', text: expression.slice(start, pos), start, end: pos });
      continue;
    }

    // 2. String literal — starts with `"`
    if (ch === '"') {
      const start = pos;
      pos += 1; // consume opening quote
      while (pos < len) {
        if (expression[pos] === '\\' && pos + 1 < len) {
          pos += 2; // skip escaped character
          continue;
        }
        if (expression[pos] === '"') {
          pos += 1; // consume closing quote
          break;
        }
        pos += 1;
      }
      // If we ran out of input without finding closing quote, still emit as string-literal
      tokens.push({ type: 'string-literal', text: expression.slice(start, pos), start, end: pos });
      continue;
    }

    // 3. Identifier — could be function-name, boolean, null, or unknown keyword
    if (/[a-zA-Z_]/.test(ch)) {
      const start = pos;
      while (pos < len && /\w/.test(expression[pos])) {
        pos += 1;
      }
      const word = expression.slice(start, pos);

      // Check what follows the identifier
      let skipWhitespacePos = pos;
      while (skipWhitespacePos < len && expression[skipWhitespacePos] === ' ') {
        skipWhitespacePos += 1;
      }
      const nextNonSpace = expression[skipWhitespacePos];

      if (nextNonSpace === '(') {
        // function-name
        tokens.push({ type: 'function-name', text: word, start, end: pos });
      } else if (word === 'true' || word === 'false') {
        tokens.push({ type: 'boolean-literal', text: word, start, end: pos });
      } else if (word === 'null') {
        tokens.push({ type: 'null-literal', text: word, start, end: pos });
      } else {
        tokens.push({ type: 'unknown', text: word, start, end: pos });
      }
      continue;
    }

    // 4. Number literal — digits, optional leading minus, optional decimal
    if (/\d/.test(ch) || (ch === '-' && pos + 1 < len && /\d/.test(expression[pos + 1]))) {
      const start = pos;
      if (ch === '-') {
        pos += 1; // consume leading minus
      }
      while (pos < len && /\d/.test(expression[pos])) {
        pos += 1;
      }
      // Optional decimal part
      if (pos < len && expression[pos] === '.' && pos + 1 < len && /\d/.test(expression[pos + 1])) {
        pos += 1; // consume '.'
        while (pos < len && /\d/.test(expression[pos])) {
          pos += 1;
        }
      }
      tokens.push({ type: 'number-literal', text: expression.slice(start, pos), start, end: pos });
      continue;
    }

    // 5-10. Single-character tokens
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'punctuation', text: ch, start: pos, end: pos + 1 });
      pos += 1;
      continue;
    }

    if (ch === ',') {
      tokens.push({ type: 'comma', text: ch, start: pos, end: pos + 1 });
      pos += 1;
      continue;
    }

    if (ch === '{' || ch === '}') {
      tokens.push({ type: 'brace', text: ch, start: pos, end: pos + 1 });
      pos += 1;
      continue;
    }

    if (ch === ':') {
      tokens.push({ type: 'colon', text: ch, start: pos, end: pos + 1 });
      pos += 1;
      continue;
    }

    // 11. Catch-all — single unknown character
    tokens.push({ type: 'unknown', text: ch, start: pos, end: pos + 1 });
    pos += 1;
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Bracket matching
// ---------------------------------------------------------------------------

/**
 * Given a cursor position within an expression string, finds the matching
 * bracket pair for the `(` or `)` at or immediately before the cursor.
 *
 * Checks the character AT the cursor position first, then the character
 * immediately before the cursor (so clicking after `)` also triggers matching).
 *
 * Returns `[openPos, closePos]` as character offsets into the expression,
 * or `null` if the cursor is not on/adjacent to a bracket or no match found.
 */
export function findMatchingBracket(
  expression: string,
  cursorPos: number,
): [number, number] | null {
  // Candidates: character at cursor, then character before cursor
  const candidates: number[] = [];
  if (cursorPos < expression.length) {
    candidates.push(cursorPos);
  }
  if (cursorPos > 0) {
    candidates.push(cursorPos - 1);
  }

  for (const pos of candidates) {
    const ch = expression[pos];

    if (ch === '(') {
      const match = findClosingParen(expression, pos);
      if (match !== null) {
        return [pos, match];
      }
    }

    if (ch === ')') {
      const match = findOpeningParen(expression, pos);
      if (match !== null) {
        return [match, pos];
      }
    }
  }

  return null;
}

function findClosingParen(expression: string, openPos: number): number | null {
  let depth = 0;
  for (let i = openPos; i < expression.length; i += 1) {
    const ch = expression[i];
    if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    } else if (ch === '"') {
      i = skipStringLiteral(expression, i) - 1; // -1 because loop will i+=1
    }
  }
  return null;
}

function findOpeningParen(expression: string, closePos: number): number | null {
  let depth = 0;
  for (let i = closePos; i >= 0; i -= 1) {
    const ch = expression[i];
    if (ch === ')') {
      depth += 1;
    } else if (ch === '(') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
    // Note: scanning backwards through strings is harder; we skip that complexity
    // since the tokenizer rendering handles display and mismatches are visually apparent
  }
  return null;
}

/**
 * Returns the index after the closing `"` of a string literal starting at `start`.
 * Handles `\"` escapes. If the string is unclosed, returns `expression.length`.
 */
function skipStringLiteral(expression: string, start: number): number {
  let i = start + 1; // skip opening quote
  while (i < expression.length) {
    if (expression[i] === '\\' && i + 1 < expression.length) {
      i += 2;
      continue;
    }
    if (expression[i] === '"') {
      return i + 1;
    }
    i += 1;
  }
  return expression.length;
}
