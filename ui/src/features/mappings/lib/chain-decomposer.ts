/**
 * chain-decomposer.ts — FS-038 T-03
 *
 * Parses a DSL expression string and returns the equivalent ChainBuilderState,
 * or a failure reason. This is the reverse path: DSL → state.
 *
 * Entry point:
 *   decomposeToChainState(expression: string): DecomposeChainResult
 *
 * Result type:
 *   { success: true; state: ChainBuilderState }
 *   | { success: false; reason: string }
 *
 * Decomposition strategy:
 *   1. Parse expression → AST (fail on syntax error)
 *   2. source("path")          → source entry, direct copy
 *   3. Bare literal            → static entry
 *   4. static("value")         → static entry (backward compat)
 *   5. if(...)                 → source entry + condition logic step
 *   6. valueMap(...)           → source entry + value map logic step
 *   7. chainFn(…source(…)…)    → source entry + transform step(s)
 *   8. Anything else           → failure with reason
 *
 * Backward compatibility:
 *   - AE-14: upper(source("x"))                → source + [upper]
 *   - AE-15: if(eq(source("tier"), "gold"), …) → source + condition step
 *   - AE-16: valueMap(source("code"), {…}, …)  → source + value map step
 *   - static("value")                          → static entry
 *
 * @pure — no side effects, deterministic output for a given input.
 */

import { parse, defaultRegistry } from '@/lib/engine';
import type { AstNode } from '@/lib/engine';

import type {
  ArgumentSlotRef,
  ChainBranch,
  ChainBuilderState,
  ChainValueMapEntry,
  ConditionLogicStep,
  ConditionOperand,
  ConditionOperatorType,
  LogicStep,
  StaticValueBranch,
  TransformLogicStep,
  ValueMapLogicStep,
} from './chain-builder-state';
import {
  createEmptyChainState,
} from './chain-builder-state';
import { CHAINABLE_TRANSFORMS } from './transform-chain-utils';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type DecomposeChainResult =
  | { readonly success: true; readonly state: ChainBuilderState }
  | { readonly success: false; readonly reason: string };

// ---------------------------------------------------------------------------
// Internal helpers — AST predicates
// ---------------------------------------------------------------------------

function isSourceCall(node: AstNode): boolean {
  return (
    node.type === 'FunctionCall' &&
    node.name === 'source' &&
    node.arguments.length === 1 &&
    node.arguments[0]?.type === 'StringLiteral'
  );
}

function extractSourcePath(node: AstNode): string {
  if (
    node.type === 'FunctionCall' &&
    node.name === 'source' &&
    node.arguments[0]?.type === 'StringLiteral'
  ) {
    return node.arguments[0].value;
  }
  return '';
}

function isBareLiteral(node: AstNode): boolean {
  return (
    node.type === 'StringLiteral' ||
    node.type === 'NumberLiteral' ||
    node.type === 'BooleanLiteral' ||
    node.type === 'NullLiteral'
  );
}

function nodeToStaticValueBranch(node: AstNode): StaticValueBranch | null {
  switch (node.type) {
    case 'StringLiteral':
      return { type: 'string', value: node.value };
    case 'NumberLiteral':
      return { type: 'number', value: node.value };
    case 'BooleanLiteral':
      return { type: 'boolean', value: node.value };
    case 'NullLiteral':
      return { type: 'null' };
    default:
      return null;
  }
}

/**
 * Converts a literal AST node to a raw string for use in ArgumentSlotRef.
 */
function nodeToLiteralString(node: AstNode): string | null {
  switch (node.type) {
    case 'StringLiteral':
      return node.value;
    case 'NumberLiteral':
      return String(node.value);
    case 'BooleanLiteral':
      return node.value ? 'true' : 'false';
    case 'NullLiteral':
      return 'null';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Chain walking — transform step extraction
// ---------------------------------------------------------------------------

/**
 * Attempts to walk a FunctionCall AST node as a transform chain rooted at
 * source("path"). Returns { sourcePath, steps } with steps ordered
 * innermost-first (first step applied to source, last step produces output).
 *
 * Returns null if:
 *   - Any function in the chain is not in CHAINABLE_TRANSFORMS
 *   - The base is not source("path")
 *   - Any additional argument cannot be converted to an ArgumentSlotRef
 *   - Nesting exceeds MAX_CHAIN_DEPTH
 */
const MAX_CHAIN_DEPTH = 20;

function tryWalkTransformChain(
  rootNode: AstNode,
): { sourcePath: string; steps: TransformLogicStep[] } | null {
  const stepsReversed: TransformLogicStep[] = [];
  let current: AstNode = rootNode;
  let depth = 0;

  while (depth < MAX_CHAIN_DEPTH) {
    depth++;

    // Base case: reached source("path")
    if (isSourceCall(current)) {
      return {
        sourcePath: extractSourcePath(current),
        steps: stepsReversed.reverse(),
      };
    }

    // Must be a FunctionCall
    if (current.type !== 'FunctionCall') return null;

    // Must be a chainable function
    if (!CHAINABLE_TRANSFORMS.has(current.name)) return null;

    // Must have at least one argument (the implicit first arg)
    if (current.arguments.length === 0) return null;

    // Convert additional args (slice(1)) to ArgumentSlotRef
    const extraArgNodes = current.arguments.slice(1);
    const extraArgs: ArgumentSlotRef[] = [];
    for (const argNode of extraArgNodes) {
      const slot = nodeToArgumentSlotRef(argNode);
      if (slot === null) return null;
      extraArgs.push(slot);
    }

    stepsReversed.push({
      kind: 'transform',
      functionName: current.name,
      args: extraArgs,
    });

    // Walk into the first argument
    current = current.arguments[0]!;
  }

  // Safety limit exceeded
  return null;
}

/**
 * Converts an AST node to an ArgumentSlotRef (for transform step additional args).
 * Only handles source("path") and literals — not nested function calls.
 */
function nodeToArgumentSlotRef(node: AstNode): ArgumentSlotRef | null {
  if (isSourceCall(node)) {
    return { mode: 'source', path: extractSourcePath(node) };
  }
  const literal = nodeToLiteralString(node);
  if (literal !== null) {
    return { mode: 'literal', value: literal };
  }
  // Nested function calls in additional args are not supported in the chain model
  return null;
}

// ---------------------------------------------------------------------------
// ChainBranch decomposition
// ---------------------------------------------------------------------------

/**
 * Attempts to decompose an AST node into a ChainBranch.
 *
 * Priority:
 *   1. source("path")                → { kind: 'source', path, steps: [] }
 *   2. chainFn(…source("path")…)     → { kind: 'source', path, steps: [...] }
 *   3. Bare literal                  → { kind: 'static', value }
 *   4. static("value")               → { kind: 'static', value }
 *   5. Anything else                 → { kind: 'expression', raw: reconstructed }
 *
 * For case 5, we reconstruct the raw DSL string from the original expression
 * by using the node's source span if available, or falling back to a
 * best-effort reconstruction.
 */
function nodeToChainBranch(node: AstNode, originalExpression: string): ChainBranch {
  // source("path") → source branch with no steps
  if (isSourceCall(node)) {
    return { kind: 'source', path: extractSourcePath(node), steps: [] };
  }

  // Chainable transform chain rooted at source("path")
  if (node.type === 'FunctionCall' && CHAINABLE_TRANSFORMS.has(node.name)) {
    const chain = tryWalkTransformChain(node);
    if (chain !== null) {
      return { kind: 'source', path: chain.sourcePath, steps: chain.steps };
    }
  }

  // Bare literal → static branch
  const staticValue = nodeToStaticValueBranch(node);
  if (staticValue !== null) {
    return { kind: 'static', value: staticValue };
  }

  // static("value") backward compat
  if (
    node.type === 'FunctionCall' &&
    node.name === 'static' &&
    node.arguments.length === 1
  ) {
    const inner = nodeToStaticValueBranch(node.arguments[0]!);
    if (inner !== null) {
      return { kind: 'static', value: inner };
    }
  }

  // Fallback: expression branch with raw DSL reconstructed from span
  const raw = nodeToRawExpression(node, originalExpression);
  return { kind: 'expression', raw };
}

/**
 * Reconstructs the raw DSL string for an AST node.
 * Uses the node's start/end span if available, otherwise falls back to
 * a best-effort string reconstruction.
 */
function nodeToRawExpression(node: AstNode, originalExpression: string): string {
  // Use source span if the engine provides it
  if (
    typeof (node as { start?: number }).start === 'number' &&
    typeof (node as { end?: number }).end === 'number'
  ) {
    const start = (node as { start: number }).start;
    const end = (node as { end: number }).end;
    return originalExpression.slice(start, end);
  }
  // Best-effort reconstruction for function calls
  if (node.type === 'FunctionCall') {
    return `${node.name}(…)`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Condition step decomposition
// ---------------------------------------------------------------------------

/**
 * Attempts to decompose an if(predicate, then, else) AST node into a
 * ConditionLogicStep. Returns null if the structure is unrecognizable.
 *
 * Supported predicate patterns:
 *   - eq(left, right), neq(left, right), gt, gte, lt, lte, contains, startsWith
 *   - isNull(left)
 *   - not(isNull(left))   → isNotNull
 *   - left                → isTruthy (bare expression)
 *   - not(left)           → isFalsy
 */
function tryDecomposeConditionStep(
  ifNode: { type: 'FunctionCall'; name: 'if'; arguments: readonly AstNode[] },
  originalExpression: string,
  currentValueExpr: string,
): ConditionLogicStep | null {
  if (ifNode.arguments.length !== 3) return null;

  const [predicateNode, thenNode, elseNode] = ifNode.arguments as [AstNode, AstNode, AstNode];

  const predicateResult = tryDecomposePredicate(predicateNode, originalExpression, currentValueExpr);
  if (predicateResult === null) return null;

  const { useCurrentValue, customLeftOperand, operator, rightOperand } = predicateResult;

  const thenBranch = nodeToChainBranch(thenNode, originalExpression);
  const elseBranch = nodeToChainBranch(elseNode, originalExpression);

  return {
    kind: 'condition',
    useCurrentValue,
    customLeftOperand,
    operator,
    rightOperand,
    thenBranch,
    elseBranch,
    elseIfSteps: [],
  };
}

interface PredicateResult {
  useCurrentValue: boolean;
  customLeftOperand?: ConditionOperand;
  operator: ConditionOperatorType;
  rightOperand: ConditionOperand;
}

const BINARY_COMPARISON_OPS = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith',
]);

function tryDecomposePredicate(
  node: AstNode,
  originalExpression: string,
  currentValueExpr: string,
): PredicateResult | null {
  // not(isNull(left)) → isNotNull
  if (
    node.type === 'FunctionCall' &&
    node.name === 'not' &&
    node.arguments.length === 1 &&
    node.arguments[0]?.type === 'FunctionCall' &&
    node.arguments[0].name === 'isNull' &&
    node.arguments[0].arguments.length === 1
  ) {
    const leftNode = node.arguments[0].arguments[0]!;
    const { useCurrentValue, customLeftOperand } = classifyLeftOperand(
      leftNode,
      currentValueExpr,
    );
    return {
      useCurrentValue,
      customLeftOperand,
      operator: 'isNotNull',
      rightOperand: { kind: 'currentValue' },
    };
  }

  // isNull(left) → isNull
  if (
    node.type === 'FunctionCall' &&
    node.name === 'isNull' &&
    node.arguments.length === 1
  ) {
    const leftNode = node.arguments[0]!;
    const { useCurrentValue, customLeftOperand } = classifyLeftOperand(
      leftNode,
      currentValueExpr,
    );
    return {
      useCurrentValue,
      customLeftOperand,
      operator: 'isNull',
      rightOperand: { kind: 'currentValue' },
    };
  }

  // not(left) → isFalsy
  if (
    node.type === 'FunctionCall' &&
    node.name === 'not' &&
    node.arguments.length === 1
  ) {
    const leftNode = node.arguments[0]!;
    const { useCurrentValue, customLeftOperand } = classifyLeftOperand(
      leftNode,
      currentValueExpr,
    );
    return {
      useCurrentValue,
      customLeftOperand,
      operator: 'isFalsy',
      rightOperand: { kind: 'currentValue' },
    };
  }

  // Binary comparison: eq(left, right), neq(left, right), etc.
  if (
    node.type === 'FunctionCall' &&
    BINARY_COMPARISON_OPS.has(node.name) &&
    node.arguments.length === 2
  ) {
    const [leftNode, rightNode] = node.arguments as [AstNode, AstNode];
    const { useCurrentValue, customLeftOperand } = classifyLeftOperand(
      leftNode,
      currentValueExpr,
    );
    const rightOperand = nodeToConditionOperand(rightNode, originalExpression);
    return {
      useCurrentValue,
      customLeftOperand,
      operator: node.name as ConditionOperatorType,
      rightOperand,
    };
  }

  // Bare expression → isTruthy
  const { useCurrentValue, customLeftOperand } = classifyLeftOperand(node, currentValueExpr);
  return {
    useCurrentValue,
    customLeftOperand,
    operator: 'isTruthy',
    rightOperand: { kind: 'currentValue' },
  };
}

/**
 * Classifies a left operand node as either "current value" or a custom operand.
 *
 * A node is considered "current value" when it matches the currentValueExpr
 * string exactly (by reconstructing the node's raw expression).
 * For source("path") nodes, we compare the path to the current value expression.
 */
function classifyLeftOperand(
  node: AstNode,
  currentValueExpr: string,
): { useCurrentValue: boolean; customLeftOperand?: ConditionOperand } {
  // If the node IS source("path") and the current value is source("path"),
  // treat it as current value.
  if (isSourceCall(node)) {
    const path = extractSourcePath(node);
    const reconstructed = `source("${path}")`;
    if (reconstructed === currentValueExpr) {
      return { useCurrentValue: true };
    }
    return {
      useCurrentValue: false,
      customLeftOperand: { kind: 'source', path },
    };
  }

  // For transform chains, reconstruct and compare
  if (node.type === 'FunctionCall' && CHAINABLE_TRANSFORMS.has(node.name)) {
    // We can't easily reconstruct the exact string, so treat as custom operand
    const chain = tryWalkTransformChain(node);
    if (chain !== null) {
      // If the chain produces the same source as the current value, treat as current value
      // (simplified heuristic — exact match would require expression reconstruction)
      return {
        useCurrentValue: false,
        customLeftOperand: { kind: 'source', path: chain.sourcePath },
      };
    }
  }

  // Literal → custom literal operand
  const literal = nodeToLiteralString(node);
  if (literal !== null) {
    return {
      useCurrentValue: false,
      customLeftOperand: { kind: 'literal', value: literal },
    };
  }

  // Default: treat as current value (best effort)
  return { useCurrentValue: true };
}

function nodeToConditionOperand(node: AstNode, _originalExpression: string): ConditionOperand {
  if (isSourceCall(node)) {
    return { kind: 'source', path: extractSourcePath(node) };
  }
  const literal = nodeToLiteralString(node);
  if (literal !== null) {
    return { kind: 'literal', value: literal };
  }
  return { kind: 'currentValue' };
}

// ---------------------------------------------------------------------------
// Value map step decomposition
// ---------------------------------------------------------------------------

/**
 * Attempts to decompose a valueMap(source, {mappings}, default) AST node
 * into a ValueMapLogicStep. Returns null if the structure is unrecognizable.
 */
function tryDecomposeValueMapStep(
  node: { type: 'FunctionCall'; name: 'valueMap'; arguments: readonly AstNode[] },
  originalExpression: string,
): { sourcePath: string; step: ValueMapLogicStep } | null {
  // valueMap requires exactly 3 arguments: source, object, default
  if (node.arguments.length !== 3) return null;

  const [sourceNode, mappingsNode, defaultNode] = node.arguments as [AstNode, AstNode, AstNode];

  // First arg must be source("path")
  if (!isSourceCall(sourceNode)) return null;
  const sourcePath = extractSourcePath(sourceNode);

  // Second arg must be an ObjectTemplate (key-value pairs)
  if (mappingsNode.type !== 'ObjectTemplate') return null;

  const mappings: ChainValueMapEntry[] = [];
  for (const entry of mappingsNode.entries) {
    const outputValue = nodeToChainBranch(entry.value, originalExpression);
    mappings.push({ whenValue: entry.key, outputValue });
  }

  const defaultValue = nodeToChainBranch(defaultNode, originalExpression);

  const step: ValueMapLogicStep = {
    kind: 'valueMap',
    mappings,
    defaultValue,
  };

  return { sourcePath, step };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decomposes a DSL expression string into a ChainBuilderState.
 *
 * Returns a success result with the equivalent ChainBuilderState, or a
 * failure result with a human-readable reason string.
 *
 * @pure — no side effects, deterministic output for a given input.
 */
export function decomposeToChainState(expression: string): DecomposeChainResult {
  const trimmed = expression.trim();

  if (trimmed === '') {
    return { success: true, state: createEmptyChainState() };
  }

  // Parse the expression
  const parseResult = parse(trimmed, defaultRegistry);
  if (!parseResult.success || parseResult.ast === null) {
    return {
      success: false,
      reason: `Parse error: ${(parseResult as { error?: string }).error ?? 'unknown error'}`,
    };
  }

  const ast = parseResult.ast;

  // ── Case 1: source("path") → direct source copy ──────────────────────────
  if (isSourceCall(ast)) {
    const path = extractSourcePath(ast);
    return {
      success: true,
      state: {
        entryType: 'source',
        sourcePath: path,
        logicSteps: [],
        expandedStepIndex: null,
      },
    };
  }

  // ── Case 2: Bare literal → static entry ──────────────────────────────────
  if (isBareLiteral(ast)) {
    const staticValue = nodeToStaticValueBranch(ast);
    if (staticValue !== null) {
      return {
        success: true,
        state: {
          entryType: 'static',
          staticValue,
          logicSteps: [],
          expandedStepIndex: null,
        },
      };
    }
  }

  // ── Case 3: static("value") → static entry (backward compat) ─────────────
  if (
    ast.type === 'FunctionCall' &&
    ast.name === 'static' &&
    ast.arguments.length === 1
  ) {
    const inner = nodeToStaticValueBranch(ast.arguments[0]!);
    if (inner !== null) {
      return {
        success: true,
        state: {
          entryType: 'static',
          staticValue: inner,
          logicSteps: [],
          expandedStepIndex: null,
        },
      };
    }
  }

  // ── Case 4: if(...) → source entry + condition logic step ─────────────────
  if (ast.type === 'FunctionCall' && ast.name === 'if') {
    // Extract the source from the condition's left operand
    const sourceResult = tryExtractSourceFromCondition(ast, trimmed);
    if (sourceResult !== null) {
      const { sourcePath, step } = sourceResult;
      return {
        success: true,
        state: {
          entryType: 'source',
          sourcePath,
          logicSteps: [step],
          expandedStepIndex: null,
        },
      };
    }
    return {
      success: false,
      reason: 'Could not extract source path from if() condition',
    };
  }

  // ── Case 5: valueMap(...) → source entry + value map logic step ───────────
  if (ast.type === 'FunctionCall' && ast.name === 'valueMap') {
    const result = tryDecomposeValueMapStep(ast as Parameters<typeof tryDecomposeValueMapStep>[0], trimmed);
    if (result !== null) {
      return {
        success: true,
        state: {
          entryType: 'source',
          sourcePath: result.sourcePath,
          logicSteps: [result.step],
          expandedStepIndex: null,
        },
      };
    }
    return {
      success: false,
      reason: 'Could not decompose valueMap() — unsupported structure',
    };
  }

  // ── Case 6: Transform chain → source entry + transform step(s) ───────────
  if (ast.type === 'FunctionCall' && CHAINABLE_TRANSFORMS.has(ast.name)) {
    const chain = tryWalkTransformChain(ast);
    if (chain !== null) {
      return {
        success: true,
        state: {
          entryType: 'source',
          sourcePath: chain.sourcePath,
          logicSteps: chain.steps,
          expandedStepIndex: null,
        },
      };
    }
  }

  // ── Fallback: unrecognizable expression ───────────────────────────────────
  return {
    success: false,
    reason: `Expression cannot be represented in the chain builder: ${trimmed.slice(0, 60)}${trimmed.length > 60 ? '…' : ''}`,
  };
}

/**
 * Attempts to extract a source path and condition step from an if() node.
 *
 * Strategy: look at the predicate's left operand for a source("path") reference.
 * The source path becomes the chain's base value.
 */
function tryExtractSourceFromCondition(
  ifNode: AstNode & { type: 'FunctionCall'; name: 'if' },
  originalExpression: string,
): { sourcePath: string; step: ConditionLogicStep } | null {
  if (ifNode.arguments.length !== 3) return null;

  const predicateNode = ifNode.arguments[0]!;

  // Find the source path from the predicate's left operand
  const sourcePath = tryExtractSourcePathFromPredicate(predicateNode);
  if (sourcePath === null) return null;

  // Reconstruct the current value expression for classifying left operands
  const currentValueExpr = `source("${sourcePath}")`;

  const step = tryDecomposeConditionStep(
    ifNode as Parameters<typeof tryDecomposeConditionStep>[0],
    originalExpression,
    currentValueExpr,
  );

  if (step === null) return null;
  return { sourcePath, step };
}

/**
 * Extracts the source path from a predicate node by finding the first
 * source("path") reference in the predicate's left operand.
 */
function tryExtractSourcePathFromPredicate(predicateNode: AstNode): string | null {
  // Direct source call: isTruthy pattern
  if (isSourceCall(predicateNode)) {
    return extractSourcePath(predicateNode);
  }

  // not(source("path")) → isFalsy
  if (
    predicateNode.type === 'FunctionCall' &&
    predicateNode.name === 'not' &&
    predicateNode.arguments.length === 1
  ) {
    const inner = predicateNode.arguments[0]!;
    // not(isNull(source("path")))
    if (
      inner.type === 'FunctionCall' &&
      inner.name === 'isNull' &&
      inner.arguments.length === 1 &&
      isSourceCall(inner.arguments[0]!)
    ) {
      return extractSourcePath(inner.arguments[0]!);
    }
    if (isSourceCall(inner)) return extractSourcePath(inner);
    // not(chainFn(source("path")))
    if (inner.type === 'FunctionCall' && CHAINABLE_TRANSFORMS.has(inner.name)) {
      const chain = tryWalkTransformChain(inner);
      if (chain) return chain.sourcePath;
    }
  }

  // isNull(source("path"))
  if (
    predicateNode.type === 'FunctionCall' &&
    predicateNode.name === 'isNull' &&
    predicateNode.arguments.length === 1 &&
    isSourceCall(predicateNode.arguments[0]!)
  ) {
    return extractSourcePath(predicateNode.arguments[0]!);
  }

  // Binary comparison: eq(source("path"), ...) or eq(chainFn(source("path")), ...)
  if (
    predicateNode.type === 'FunctionCall' &&
    BINARY_COMPARISON_OPS.has(predicateNode.name) &&
    predicateNode.arguments.length >= 1
  ) {
    const leftNode = predicateNode.arguments[0]!;
    if (isSourceCall(leftNode)) return extractSourcePath(leftNode);
    // Chain on left side
    if (leftNode.type === 'FunctionCall' && CHAINABLE_TRANSFORMS.has(leftNode.name)) {
      const chain = tryWalkTransformChain(leftNode);
      if (chain) return chain.sourcePath;
    }
  }

  return null;
}
