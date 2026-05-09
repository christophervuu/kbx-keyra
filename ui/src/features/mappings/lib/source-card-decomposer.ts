/**
 * source-card-decomposer.ts
 *
 * Parses a DSL expression string back into a SourceCardValueModeState for
 * the FS-029 Source Card builder (T-08).
 *
 * Entry point:
 *   decomposeToSourceCardState(expression) → SourceCardValueModeState | null
 *
 * Returns null for:
 *   - Syntax errors
 *   - Expressions that cannot be represented in the new builder model
 *     (e.g. bare literals at root, ObjectTemplate, unsupported nesting)
 *
 * Decomposition rules:
 *
 *   source("path")
 *     → DirectCopy { variant: 'directCopy', sourcePath: path }
 *
 *   fn(source("path"), literal, literal, ...)
 *     where fn is a recognised single-input transform
 *     → SourceWithTransform { variant: 'sourceWithTransform', sourcePath, transform }
 *
 *   fn(arg1, arg2, ...)
 *     → FunctionCall { variant: 'functionCall', node: { functionName, slots } }
 *
 * Argument slot decomposition (recursive):
 *   source("path")                  → { mode: 'source', path }
 *   fn(source("path"), ...)         → { mode: 'source', path, transform: InlineTransform }
 *   fn(arg1, arg2, ...) (general)   → { mode: 'expression', node: ArgumentFormNode }
 *   StringLiteral                   → { mode: 'literal', value: string }
 *   NumberLiteral                   → { mode: 'literal', value: String(number) }
 *   BooleanLiteral                  → { mode: 'literal', value: 'true'|'false' }
 *
 * Round-trip guarantee:
 *   generateExpressionFromSourceCardState(decomposeToSourceCardState(expr)) === expr
 *   for all supported expression patterns.
 */

import { parse, defaultRegistry } from '@/lib/engine';
import type { AstNode } from '@/lib/engine';

import type {
  ArgumentFormNode,
  ArgumentSlot,
  InlineTransform,
  SourceCardValueModeState,
} from './expression-builder-state';
import {
  makeSourceSlot,
  makeSourceSlotWithTransform,
  makeLiteralSlot,
  makeExpressionSlot,
} from './expression-builder-state';

// ---------------------------------------------------------------------------
// Heuristic: single-input transform functions
//
// A function is treated as a SourceWithTransform candidate when:
//   - Its first argument is source("path")
//   - It is in this set (conceptually takes a "value" as first param)
//
// Multi-input functions (concat, add, coalesce, etc.) are always FunctionCall.
// ---------------------------------------------------------------------------

const SINGLE_INPUT_TRANSFORMS = new Set([
  // String
  'upper', 'lower', 'trim', 'replace', 'replaceAll', 'length', 'substring',
  // Date
  'formatDate',
  // Math
  'round', 'abs',
  // Type conversion
  'cast',
  // Null handling
  'default',
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the AST node is source("path") — a bare source accessor.
 */
function isSourceCall(node: AstNode): node is { type: 'FunctionCall'; name: 'source'; arguments: readonly AstNode[] } {
  return (
    node.type === 'FunctionCall' &&
    node.name === 'source' &&
    node.arguments.length === 1 &&
    node.arguments[0].type === 'StringLiteral'
  );
}

/**
 * Extracts the path string from a source("path") node.
 * Caller must ensure isSourceCall(node) is true.
 */
function extractSourcePath(node: AstNode): string {
  if (node.type === 'FunctionCall' && node.arguments[0]?.type === 'StringLiteral') {
    return node.arguments[0].value;
  }
  return '';
}

/**
 * Converts a literal AST node to its string representation for a literal slot.
 * Returns null for non-literal nodes.
 */
function nodeToLiteralValue(node: AstNode): string | null {
  switch (node.type) {
    case 'StringLiteral':
      return node.value;
    case 'NumberLiteral':
      return String(node.value);
    case 'BooleanLiteral':
      return node.value ? 'true' : 'false';
    default:
      return null;
  }
}

/**
 * Decomposes an AST node into an ArgumentSlot.
 *
 * Handles:
 *   - source("path")              → source slot (no transform)
 *   - fn(source("path"), ...)     → source slot with InlineTransform
 *   - fn(arg1, arg2, ...) general → expression slot (ArgumentFormNode)
 *   - Literals                    → literal slot
 *
 * Returns null for unsupported node types (ObjectTemplate, NullLiteral).
 */
function nodeToSlot(node: AstNode): ArgumentSlot | null {
  // Bare source accessor
  if (isSourceCall(node)) {
    return makeSourceSlot(extractSourcePath(node));
  }

  // Literal values
  const literalValue = nodeToLiteralValue(node);
  if (literalValue !== null) {
    return makeLiteralSlot(literalValue);
  }

  // Function call — could be a transform wrapping a source, or a general expression
  if (node.type === 'FunctionCall') {
    const firstArg = node.arguments[0];

    // fn(source("path"), ...extraArgs) → source slot with InlineTransform
    // Only for known single-input transform functions.
    if (SINGLE_INPUT_TRANSFORMS.has(node.name) && firstArg !== undefined && isSourceCall(firstArg)) {
      const sourcePath = extractSourcePath(firstArg);
      const extraArgs = node.arguments.slice(1);
      const transformArgs: ArgumentSlot[] = [];

      for (const arg of extraArgs) {
        const slot = nodeToSlot(arg);
        if (slot === null) return null;
        transformArgs.push(slot);
      }

      const transform: InlineTransform = {
        functionName: node.name,
        args: transformArgs,
      };
      return makeSourceSlotWithTransform(sourcePath, transform);
    }

    // General function call → expression slot (recursive)
    const innerNode = nodesToArgumentFormNode(node);
    if (innerNode === null) return null;
    return makeExpressionSlot(innerNode);
  }

  // NullLiteral, ObjectTemplate — not representable
  return null;
}

/**
 * Converts a FunctionCall AST node into an ArgumentFormNode by decomposing
 * each argument into a slot. Returns null if any argument fails.
 */
function nodesToArgumentFormNode(
  node: { name: string; arguments: readonly AstNode[] },
): ArgumentFormNode | null {
  const slots: ArgumentSlot[] = [];
  for (const arg of node.arguments) {
    const slot = nodeToSlot(arg);
    if (slot === null) return null;
    slots.push(slot);
  }
  return { functionName: node.name, slots };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decomposes a DSL expression string into a SourceCardValueModeState.
 *
 * Returns null for:
 *   - Empty or whitespace-only expressions
 *   - Syntax errors
 *   - Bare literals at root (not representable as a builder state)
 *   - Expressions containing unsupported node types (ObjectTemplate, NullLiteral)
 */
export function decomposeToSourceCardState(
  expression: string,
): SourceCardValueModeState | null {
  const trimmed = expression.trim();
  if (trimmed === '') return null;

  // Parse the expression
  const result = parse(trimmed, defaultRegistry);
  if (!result.success || result.ast === null) return null;

  const ast = result.ast;

  // Root must be a function call
  if (ast.type !== 'FunctionCall') return null;

  // ── Case 1: source("path") → DirectCopy ──
  if (isSourceCall(ast)) {
    const path = extractSourcePath(ast);
    return { variant: 'directCopy', sourcePath: path };
  }

  // ── Case 2: fn(source("path"), ...args) → SourceWithTransform ──
  // Condition: function is a recognised single-input transform AND
  //            first argument is source("path")
  const firstArg = ast.arguments[0];
  if (
    SINGLE_INPUT_TRANSFORMS.has(ast.name) &&
    firstArg !== undefined &&
    isSourceCall(firstArg)
  ) {
    const sourcePath = extractSourcePath(firstArg);
    const extraArgs = ast.arguments.slice(1);
    const transformArgs: ArgumentSlot[] = [];

    for (const arg of extraArgs) {
      const slot = nodeToSlot(arg);
      if (slot === null) return null;
      transformArgs.push(slot);
    }

    const transform: InlineTransform = {
      functionName: ast.name,
      args: transformArgs,
    };
    return { variant: 'sourceWithTransform', sourcePath, transform };
  }

  // ── Case 3: fn(arg1, arg2, ...) → FunctionCall ──
  const node = nodesToArgumentFormNode(ast);
  if (node === null) return null;
  return { variant: 'functionCall', node };
}
