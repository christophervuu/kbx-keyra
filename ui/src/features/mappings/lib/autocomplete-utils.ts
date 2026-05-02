/**
 * Autocomplete utilities for the raw DSL editor.
 *
 * Provides:
 * - `detectAutocompleteContext` — scans cursor position to determine what kind of
 *   autocomplete is relevant (source path, constant, external, or function name).
 * - `flattenSchemaPaths` — converts a `ParsedSchema` tree to a flat list of dot-notation paths.
 * - `filterSuggestions` — case-insensitive prefix filter over `AutocompleteItem[]`.
 */

import type { AutocompleteItem } from '@/lib/data/dsl-functions';
import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

export type { AutocompleteItem };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutocompleteContext {
  readonly kind: 'source-path' | 'constant' | 'external' | 'function' | 'none';
  /** The text already typed inside the current position (used for prefix filtering) */
  readonly prefix: string;
  /** Start offset in the expression string where the insert should replace from */
  readonly insertStart: number;
  /** End offset in the expression string where the insert should replace to (exclusive) */
  readonly insertEnd: number;
}

export interface SchemaPathEntry {
  readonly path: string;
  readonly type: string;
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Internal: string-aware scanner
// ---------------------------------------------------------------------------

interface StringScanState {
  readonly insideString: boolean;
  /** Index of the opening `"` if insideString is true, otherwise -1 */
  readonly stringStart: number;
}

/**
 * Scan expression from position 0 up to (but not including) `upTo`,
 * tracking whether the cursor lands inside an open string literal.
 * Handles `\"` escape sequences inside strings.
 */
function scanStringState(expression: string, upTo: number): StringScanState {
  let insideString = false;
  let stringStart = -1;

  for (let i = 0; i < upTo && i < expression.length; i++) {
    const ch = expression[i];
    if (!insideString) {
      if (ch === '"') {
        insideString = true;
        stringStart = i;
      }
    } else {
      if (ch === '\\') {
        // Skip the next character (escaped)
        i++;
      } else if (ch === '"') {
        insideString = false;
        stringStart = -1;
      }
    }
  }

  return { insideString, stringStart };
}

// ---------------------------------------------------------------------------
// detectAutocompleteContext
// ---------------------------------------------------------------------------

/**
 * Determines what kind of autocomplete should be shown at the given cursor position.
 *
 * Rules:
 * - Cursor inside `source("...` → kind: 'source-path'
 * - Cursor inside `item("...` or `parent("...` → kind: 'source-path'
 * - Cursor inside `constant("...` → kind: 'constant'
 * - Cursor inside `external("...` → kind: 'external'
 * - Otherwise → kind: 'function' with the current word as prefix
 * - Empty expression or no word context → kind: 'function', prefix: ''
 */
export function detectAutocompleteContext(
  expression: string,
  cursorPos: number,
): AutocompleteContext {
  const pos = Math.max(0, Math.min(cursorPos, expression.length));

  const { insideString, stringStart } = scanStringState(expression, pos);

  if (insideString && stringStart !== -1) {
    // Cursor is inside an open string literal.
    // Determine which function wraps it by examining what precedes the opening quote.
    const beforeQuote = expression.slice(0, stringStart).trimEnd();

    if (beforeQuote.endsWith('(')) {
      const beforeParen = beforeQuote.slice(0, -1);
      // Extract the function name immediately before the opening paren
      const fnMatch = /([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(beforeParen);

      if (fnMatch) {
        const fnName = fnMatch[1];
        const prefix = expression.slice(stringStart + 1, pos);
        const insertStart = stringStart + 1;
        const insertEnd = pos;

        if (fnName === 'source' || fnName === 'item' || fnName === 'parent') {
          return { kind: 'source-path', prefix, insertStart, insertEnd };
        }
        if (fnName === 'constant') {
          return { kind: 'constant', prefix, insertStart, insertEnd };
        }
        if (fnName === 'external') {
          return { kind: 'external', prefix, insertStart, insertEnd };
        }
      }
    }

    // Inside a string but not a recognized source-access function → no autocomplete
    return { kind: 'none', prefix: '', insertStart: pos, insertEnd: pos };
  }

  // Not inside a string → function name context.
  // Extract the partial identifier being typed immediately before the cursor.
  const textBefore = expression.slice(0, pos);
  const wordMatch = /([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(textBefore);
  const prefix = wordMatch ? wordMatch[1] : '';
  const insertStart = pos - prefix.length;
  const insertEnd = pos;

  return { kind: 'function', prefix, insertStart, insertEnd };
}

// ---------------------------------------------------------------------------
// flattenSchemaPaths
// ---------------------------------------------------------------------------

function flattenNode(node: SchemaTreeNode, result: SchemaPathEntry[]): void {
  result.push({
    path: node.path,
    type: node.type,
    description: node.description,
  });
  for (const child of node.children) {
    flattenNode(child, result);
  }
}

/**
 * Recursively flattens a `ParsedSchema` tree into a flat list of dot-notation paths.
 * Includes both leaf and intermediate nodes.
 */
export function flattenSchemaPaths(schema: ParsedSchema): SchemaPathEntry[] {
  const result: SchemaPathEntry[] = [];
  for (const node of schema.nodes) {
    flattenNode(node, result);
  }
  return result;
}

// ---------------------------------------------------------------------------
// filterSuggestions
// ---------------------------------------------------------------------------

/**
 * Filters autocomplete items to those whose label starts with `prefix`
 * (case-insensitive). An empty prefix returns all items unchanged.
 */
export function filterSuggestions(
  items: AutocompleteItem[],
  prefix: string,
): AutocompleteItem[] {
  if (prefix === '') return items;
  const lower = prefix.toLowerCase();
  return items.filter((item) => item.label.toLowerCase().startsWith(lower));
}
