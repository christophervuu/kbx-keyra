/**
 * ast-decomposer.ts
 *
 * Converts a raw DSL expression string into a BuilderState that can
 * populate the GuidedBuilder UI (Editor → Builder mode transition).
 *
 * Rules:
 *  - Uses `parse()` to get the AST. Syntax errors → failure.
 *  - Every FunctionCall node's name must be in BUILDER_SUPPORTED_FUNCTIONS.
 *  - Function call nesting depth must not exceed 3.
 *  - If both conditions hold for the entire tree → success + BuilderState.
 *  - Otherwise → failure + user-friendly reason.
 *
 * Depth counting:
 *  source("x")                          = 1 level
 *  upper(source("x"))                   = 2 levels
 *  if(gt(source("x"), 10), ...)         = 3 levels  (gt is depth 2, source is depth 3)
 *  if(gt(concat(source("x"), ...), 10)) = 4 levels  → too deep
 */

import { parse, defaultRegistry } from '@/lib/engine';
import type { AstNode } from '@/lib/engine';
import type { BuilderArgument, BuilderState, ObjectTemplateField } from './expression-generator';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BUILDER_SUPPORTED_FUNCTIONS = new Set([
  'source',
  'static',
  'item',
  'parent',
  'concat',
  'cast',
  'default',
  'coalesce',
  'if',
  'valueMap',
  'formatDate',
  'map',
  'filter',
  'upper',
  'lower',
  'trim',
  'add',
  'subtract',
  'multiply',
  'divide',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
]);

const MAX_NESTING_DEPTH = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecompositionResult {
  readonly success: boolean;
  /** Populated when success = true */
  readonly builderState?: BuilderState;
  /** Populated when success = false */
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Validation pass: walk tree checking supported functions + depth
// ---------------------------------------------------------------------------

interface ValidationFailure {
  readonly kind: 'unsupported-function' | 'too-deep';
  readonly functionName?: string;
}

function validateNode(node: AstNode, depth: number): ValidationFailure | null {
  if (node.type !== 'FunctionCall') {
    return null; // Literals and object templates checked separately
  }

  if (!BUILDER_SUPPORTED_FUNCTIONS.has(node.name)) {
    return { kind: 'unsupported-function', functionName: node.name };
  }

  if (depth > MAX_NESTING_DEPTH) {
    return { kind: 'too-deep' };
  }

  for (const arg of node.arguments) {
    const failure = validateTree(arg, depth + 1);
    if (failure) return failure;
  }

  return null;
}

function validateTree(node: AstNode, depth: number): ValidationFailure | null {
  switch (node.type) {
    case 'FunctionCall':
      return validateNode(node, depth);
    case 'ObjectTemplate':
      for (const prop of node.properties) {
        const failure = validateTree(prop.value, depth);
        if (failure) return failure;
      }
      return null;
    default:
      // StringLiteral, NumberLiteral, BooleanLiteral, NullLiteral — always OK
      return null;
  }
}

// ---------------------------------------------------------------------------
// Conversion pass: AST node → BuilderArgument
// ---------------------------------------------------------------------------

function nodeToArg(node: AstNode): BuilderArgument {
  switch (node.type) {
    case 'StringLiteral':
      return { kind: 'literal', value: node.value };
    case 'NumberLiteral':
      return { kind: 'literal', value: node.value };
    case 'BooleanLiteral':
      return { kind: 'literal', value: node.value };
    case 'NullLiteral':
      return { kind: 'literal', value: null };

    case 'FunctionCall': {
      // Accessor shortcuts → typed kinds
      if (node.name === 'source' && node.arguments.length === 1) {
        const a = node.arguments[0];
        if (a.type === 'StringLiteral') return { kind: 'source', value: a.value };
      }
      if (node.name === 'item' && node.arguments.length === 1) {
        const a = node.arguments[0];
        if (a.type === 'StringLiteral') return { kind: 'item', value: a.value };
      }
      if (node.name === 'parent' && node.arguments.length === 1) {
        const a = node.arguments[0];
        if (a.type === 'StringLiteral') return { kind: 'parent', value: a.value };
      }
      // Any other function → nested-function
      return {
        kind: 'nested-function',
        value: nodeToBuilderState(node),
      };
    }

    case 'ObjectTemplate': {
      const fields: ObjectTemplateField[] = node.properties.map((prop) => ({
        key: prop.key,
        value: nodeToArg(prop.value),
      }));
      return { kind: 'object-template', fields };
    }
  }
}

function nodeToBuilderState(node: { name: string; arguments: readonly AstNode[] }): BuilderState {
  return {
    functionName: node.name,
    arguments: node.arguments.map(nodeToArg),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to decompose a DSL expression string into a BuilderState.
 *
 * @returns `{ success: true, builderState }` if the expression is within the
 *   supported subset, or `{ success: false, reason }` otherwise.
 */
export function decomposeExpression(expression: string): DecompositionResult {
  // Empty expression → trivially decomposable into an empty builder
  if (expression.trim() === '') {
    return { success: true, builderState: { functionName: '', arguments: [] } };
  }

  // Parse
  const result = parse(expression, defaultRegistry);
  if (!result.success || result.ast === null) {
    const msg = result.diagnostics[0]?.message ?? 'Syntax error';
    return { success: false, reason: `Expression has syntax errors: ${msg}` };
  }

  const ast = result.ast;

  // Validate: supported functions + depth
  const failure = validateTree(ast, 1);
  if (failure) {
    if (failure.kind === 'too-deep') {
      return {
        success: false,
        reason: 'Expression nests too deeply (more than 3 levels) for the guided builder.',
      };
    }
    return {
      success: false,
      reason: `Expression uses function '${failure.functionName ?? ''}' which is not supported in the guided builder.`,
    };
  }

  // Convert root node to BuilderState
  if (ast.type !== 'FunctionCall') {
    // Root is a bare literal — unlikely in practice but handle gracefully
    return {
      success: false,
      reason: 'Expression is not a function call and cannot be loaded into the guided builder.',
    };
  }

  const builderState = nodeToBuilderState(ast);
  return { success: true, builderState };
}
