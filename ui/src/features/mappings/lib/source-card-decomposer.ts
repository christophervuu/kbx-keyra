/**
 * source-card-decomposer.ts
 *
 * Parses a DSL expression string back into a SourceCardValueModeState for
 * the FS-029 Source Card builder (T-08), extended by FS-030 to support
 * multi-step transform chains.
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
 *   chainFn(…chainFn(source("path"), …)…, …)   [2+ chainable steps]
 *     → SourceWithTransform with multi-step InlineTransform (FS-030)
 *
 *   fn(source("path"), literal, literal, ...)
 *     where fn is a recognised single-input transform (1-step chain)
 *     → SourceWithTransform { variant: 'sourceWithTransform', sourcePath, transform }
 *
 *   fn(arg1, arg2, ...)
 *     → FunctionCall { variant: 'functionCall', node: { functionName, slots } }
 *
 * Argument slot decomposition (recursive):
 *   source("path")                  → { mode: 'source', path }
 *   chainFn(…source("path")…)       → { mode: 'source', path, transform: InlineTransform }
 *   fn(arg1, arg2, ...) (general)   → { mode: 'expression', node: ArgumentFormNode }
 *   StringLiteral                   → { mode: 'literal', value: string }
 *   NumberLiteral                   → { mode: 'literal', value: String(number) }
 *   BooleanLiteral                  → { mode: 'literal', value: 'true'|'false' }
 *
 * Round-trip guarantee:
 *   generateExpressionFromSourceCardState(decomposeToSourceCardState(expr)) === expr
 *   for all supported expression patterns.
 */

import type {
  ArgumentFormNode,
  ArgumentSlot,
  InlineTransform,
  SourceCardValueModeState,
  TransformChainStep,
} from './expression-builder-state';
import {
  makeSourceSlot,
  makeSourceSlotWithTransform,
  makeLiteralSlot,
  makeExpressionSlot,
} from './expression-builder-state';

import { parse, defaultRegistry } from '@/lib/engine';
import type { AstNode } from '@/lib/engine';

// ---------------------------------------------------------------------------
// Heuristic: single-input transform functions (FS-029 backward compat)
//
// A function is treated as a SourceWithTransform candidate (single-step) when:
//   - Its first argument is source("path")
//   - It is in this set (conceptually takes a "value" as first param)
//
// Multi-input functions (concat, add, coalesce, etc.) are always FunctionCall
// when they appear as a single-step chain.
// ---------------------------------------------------------------------------

const SINGLE_INPUT_TRANSFORMS = new Set([
  // String
  'upper', 'lower', 'trim', 'replace', 'replaceAll', 'length', 'substring',
  // Date
  'formatDate', 'dateDiffSeconds',
  // Math
  'round', 'abs',
  // Type conversion
  'cast',
  // Null handling
  'default',
]);

// ---------------------------------------------------------------------------
// FS-030: Chainable transforms set
//
// A function is chainable when its first parameter is the "value being
// transformed" and remaining parameters are configuration. This is a superset
// of SINGLE_INPUT_TRANSFORMS — it adds math functions (add, subtract,
// multiply, divide) and array single-input functions.
//
// Functions NOT in this set (multi-input, iterators, comparators, accessors):
// concat, coalesce, map, filter, find, array, merge, join, eq, neq, gt, gte,
// lt, lte, contains, isNull, not, and, or, if, valueMap, source, item,
// parent, constant, external, static.
// ---------------------------------------------------------------------------

export const CHAINABLE_TRANSFORMS = new Set([
  // String
  'upper', 'lower', 'trim', 'replace', 'replaceAll', 'length', 'substring',
  // Date
  'formatDate', 'dateDiffSeconds',
  // Math
  'add', 'subtract', 'multiply', 'divide', 'round', 'abs',
  // Type conversion
  'cast',
  // Null handling
  'default',
  // Array single-input
  'flatten', 'first', 'count',
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
 * FS-030: Attempts to decompose a FunctionCall AST node as a transform chain
 * rooted at a source("path") call.
 *
 * Walks from outermost to innermost through first arguments of chainable
 * functions until reaching source("path"). Records each function as a
 * TransformChainStep (with its additional args as slots).
 *
 * Returns { sourcePath, steps } with steps ordered innermost-first
 * (first step applied to source, last step produces final output).
 *
 * Returns null if:
 *   - Any function in the chain is not in CHAINABLE_TRANSFORMS
 *   - The base is not source("path")
 *   - Any additional argument cannot be converted to a slot
 *   - Nesting exceeds the safety limit (20 levels)
 */
function tryDecomposeChain(
  rootNode: { type: 'FunctionCall'; name: string; arguments: readonly AstNode[] },
): { sourcePath: string; steps: TransformChainStep[] } | null {
  const stepsReversed: TransformChainStep[] = [];
  let current: AstNode = rootNode;
  let depth = 0;
  const MAX_DEPTH = 20;

  while (depth < MAX_DEPTH) {
    depth++;

    // Base case: reached source("path")
    if (isSourceCall(current)) {
      return { sourcePath: extractSourcePath(current), steps: stepsReversed.reverse() };
    }

    // Must be a FunctionCall
    if (current.type !== 'FunctionCall') return null;

    // Must be a chainable function
    if (!CHAINABLE_TRANSFORMS.has(current.name)) return null;

    // Must have at least one argument (the implicit first arg)
    if (current.arguments.length === 0) return null;

    // Convert additional args (slice(1)) to slots
    const extraArgNodes = current.arguments.slice(1);
    const extraArgs: ArgumentSlot[] = [];
    for (const argNode of extraArgNodes) {
      const slot = nodeToSlot(argNode);
      if (slot === null) return null;
      extraArgs.push(slot);
    }

    stepsReversed.push({ functionName: current.name, args: extraArgs });

    // Walk into the first argument
    current = current.arguments[0]!;
  }

  // Safety limit exceeded
  return null;
}

/**
 * Decomposes an AST node into an ArgumentSlot.
 *
 * Handles:
 *   - source("path")                    → source slot (no transform)
 *   - chainFn(…source("path")…) chain   → source slot with multi-step InlineTransform (FS-030)
 *   - fn(source("path"), ...) single    → source slot with single-step InlineTransform
 *   - fn(arg1, arg2, ...) general       → expression slot (ArgumentFormNode)
 *   - Literals                          → literal slot
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

  // Function call — attempt chain decomposition first, then fall back
  if (node.type === 'FunctionCall') {
    // FS-030: attempt chain decomposition
    if (CHAINABLE_TRANSFORMS.has(node.name)) {
      const chain = tryDecomposeChain(node);
      if (chain !== null) {
        const { sourcePath, steps } = chain;

        if (steps.length >= 2) {
          // Multi-step chain → source slot with chain transform
          const transform: InlineTransform = { steps };
          return makeSourceSlotWithTransform(sourcePath, transform);
        }

        if (steps.length === 1 && SINGLE_INPUT_TRANSFORMS.has(steps[0]!.functionName)) {
          // Single-step chain in SINGLE_INPUT_TRANSFORMS → source slot with single-step transform
          const transform: InlineTransform = { steps };
          return makeSourceSlotWithTransform(sourcePath, transform);
        }
        // Single-step chain NOT in SINGLE_INPUT_TRANSFORMS → fall through to expression slot
      }
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

  // ── Case 2: Transform chain → SourceWithTransform (FS-030) ──
  // Attempt chain decomposition for any chainable root function.
  if (CHAINABLE_TRANSFORMS.has(ast.name)) {
    const chain = tryDecomposeChain(ast);
    if (chain !== null) {
      const { sourcePath, steps } = chain;

      if (steps.length >= 2) {
        // Multi-step chain → always SourceWithTransform
        const transform: InlineTransform = { steps };
        return { variant: 'sourceWithTransform', sourcePath, transform };
      }

      if (steps.length === 1 && SINGLE_INPUT_TRANSFORMS.has(steps[0]!.functionName)) {
        // Single-step chain in SINGLE_INPUT_TRANSFORMS → SourceWithTransform (backward compat)
        const transform: InlineTransform = { steps };
        return { variant: 'sourceWithTransform', sourcePath, transform };
      }
      // Single-step chain NOT in SINGLE_INPUT_TRANSFORMS → fall through to FunctionCall
    }
  }

  // ── Case 3: fn(arg1, arg2, ...) → FunctionCall ──
  const node = nodesToArgumentFormNode(ast);
  if (node === null) return null;
  return { variant: 'functionCall', node };
}
