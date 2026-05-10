/**
 * chain-decomposer.ts — FS-038 T-03 / FS-039 T-03
 *
 * Two decomposers in one file:
 *
 *   decomposeToChainState(expression: string): DecomposeChainResult
 *     FS-038 decomposer — returns { success, state: ChainBuilderState }.
 *     Kept for backward compatibility during migration.
 *
 *   decomposeToChain(expression: string): DecomposeChainResult039
 *     FS-039 decomposer — returns { chain: ChainState } | { error: string }.
 *     Handles OperandValue types including 'currentValue' accumulator detection.
 *
 * currentValue detection strategy (FS-039):
 *   The decomposer walks the AST outside-in, unwrapping the outermost call
 *   first. It tracks `accumulatorExpr` — the expression string that would be
 *   produced by all steps processed so far. When it encounters a condition,
 *   it reconstructs the left operand's expression string and compares it to
 *   `accumulatorExpr`. A match → { kind: 'currentValue' }.
 *
 * @pure — no side effects, deterministic output for a given input.
 */

import { parse, defaultRegistry } from '@/lib/engine';
import type { AstNode } from '@/lib/engine';

import type {
  ArgumentSlotRef,
  ChainBranch,
  ChainBuilderState,
  ChainSource,
  ChainState,
  ChainStep,
  ChainValueMapEntry,
  ConditionClause,
  ConditionLogicStep,
  ConditionOperand,
  ConditionOperatorType,
  FS039ConditionStep,
  FS039TransformStep,
  FS039ValueMapEntry,
  FS039ValueMapStep,
  OperandValue,
  Predicate,
  StaticValueBranch,
  TransformLogicStep,
  ValueMapLogicStep,
} from './chain-builder-state';
import {
  createEmptyChain,
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
  for (const prop of mappingsNode.properties) {
    const outputValue = nodeToChainBranch(prop.value, originalExpression);
    mappings.push({ whenValue: prop.key, outputValue });
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

// ===========================================================================
// FS-039 Decomposer — decomposeToChain(expression: string)
//
// Inverse of generateChainExpression(). Parses a DSL expression and
// reconstructs a ChainState from it.
//
// Walk strategy (outside-in):
//   The generator wraps the accumulator from inside-out: the last step is the
//   outermost function call. The decomposer therefore walks outside-in:
//   it peels off the outermost call as the last step, recurses into the first
//   argument, and continues until it reaches the base (source/literal).
//
//   Steps are collected in reverse order (outermost first) and reversed at
//   the end so the resulting steps array is innermost-first (matching the
//   generator's application order).
//
// currentValue detection:
//   As the decomposer peels off steps, it tracks `accumulatorExpr` — the
//   expression string that would be produced by all steps processed so far
//   (i.e., all steps INSIDE the current one). When it encounters a condition,
//   it compares the predicate's left operand expression to `accumulatorExpr`.
//   A match → { kind: 'currentValue' }.
//
//   Because we walk outside-in, when we reach step N (0-indexed from inside),
//   the accumulator is the expression produced by steps 0..N-1. We reconstruct
//   this by re-generating the partial chain from the base up to that point.
//   In practice, for the common case (source → transforms → condition), the
//   accumulator at the condition step is the expression produced by all
//   preceding transforms applied to the source.
// ===========================================================================

// ---------------------------------------------------------------------------
// FS-039 result type
// ---------------------------------------------------------------------------

/** Result type for decomposeToChain(). */
export type DecomposeChainResult039 =
  | { readonly chain: ChainState }
  | { readonly error: string };

// ---------------------------------------------------------------------------
// FS-039 AST → OperandValue reconstruction
// ---------------------------------------------------------------------------

/**
 * Reconstructs an OperandValue from an AST node, using the accumulator
 * expression to detect the 'currentValue' case.
 *
 * Rules (in priority order):
 *   1. Node expression matches accumulatorExpr → { kind: 'currentValue' }
 *   2. source("path") → { kind: 'field', path }
 *   3. Bare literal → { kind: 'static', value }
 *   4. Fallback → { kind: 'expression', dsl: reconstructed }
 */
function nodeToOperandValue(
  node: AstNode,
  accumulatorExpr: string,
  originalExpression: string,
): OperandValue {
  // Reconstruct the node's expression string for accumulator comparison
  const nodeExpr = reconstructNodeExpr(node, originalExpression);

  // 1. Accumulator match → currentValue
  if (nodeExpr !== null && nodeExpr === accumulatorExpr) {
    return { kind: 'currentValue' };
  }

  // 2. source("path") → field
  if (isSourceCall(node)) {
    return { kind: 'field', path: extractSourcePath(node) };
  }

  // 3. Bare literal → static
  const staticVal = nodeToStaticValueBranch(node);
  if (staticVal !== null) {
    return { kind: 'static', value: staticVal };
  }

  // 4. Fallback → expression
  const dsl = nodeExpr ?? nodeToRawExpression(node, originalExpression);
  return { kind: 'expression', dsl };
}

/**
 * Reconstructs the DSL expression string for an AST node.
 *
 * For source("path") and literals, produces the canonical form.
 * For transform chains rooted at source("path"), reconstructs the chain.
 * For other nodes, uses the source span if available.
 * Returns null if reconstruction is not possible.
 */
function reconstructNodeExpr(node: AstNode, originalExpression: string): string | null {
  // source("path")
  if (isSourceCall(node)) {
    return `source("${extractSourcePath(node)}")`;
  }

  // Bare literals
  switch (node.type) {
    case 'StringLiteral':
      return `"${node.value}"`;
    case 'NumberLiteral':
      return String(node.value);
    case 'BooleanLiteral':
      return node.value ? 'true' : 'false';
    case 'NullLiteral':
      return 'null';
    default:
      break;
  }

  // Transform chain rooted at source("path") — reconstruct via generator logic
  if (node.type === 'FunctionCall' && CHAINABLE_TRANSFORMS.has(node.name)) {
    const chain = tryWalkTransformChain(node);
    if (chain !== null) {
      // Reconstruct by building the chain expression bottom-up
      let expr = `source("${chain.sourcePath}")`;
      for (const step of chain.steps) {
        const extraArgs = step.args
          .map((a) => (a.mode === 'source' ? `source("${a.path}")` : a.value))
          .filter(Boolean);
        expr = `${step.functionName}(${[expr, ...extraArgs].join(', ')})`;
      }
      return expr;
    }
  }

  // Use source span if available
  if (
    typeof (node as { start?: number }).start === 'number' &&
    typeof (node as { end?: number }).end === 'number'
  ) {
    const start = (node as { start: number }).start;
    const end = (node as { end: number }).end;
    return originalExpression.slice(start, end);
  }

  return null;
}

// ---------------------------------------------------------------------------
// FS-039 predicate decomposition
// ---------------------------------------------------------------------------

const FS039_BINARY_OPS = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith',
]);

/**
 * Extracts the left operand node from a predicate AST node.
 * Returns null if the predicate structure is not recognized.
 */
function extractPredicateLeftOperand(predicateNode: AstNode): AstNode | null {
  if (predicateNode.type !== 'FunctionCall') return predicateNode; // bare expression = left operand

  // not(isNull(left)) → left
  if (
    predicateNode.name === 'not' &&
    predicateNode.arguments.length === 1 &&
    predicateNode.arguments[0]?.type === 'FunctionCall' &&
    predicateNode.arguments[0].name === 'isNull' &&
    predicateNode.arguments[0].arguments.length === 1
  ) {
    return predicateNode.arguments[0].arguments[0] ?? null;
  }

  // isNull(left) → left
  if (predicateNode.name === 'isNull' && predicateNode.arguments.length === 1) {
    return predicateNode.arguments[0] ?? null;
  }

  // not(left) → left
  if (predicateNode.name === 'not' && predicateNode.arguments.length === 1) {
    return predicateNode.arguments[0] ?? null;
  }

  // Binary: eq(left, right) → left
  if (FS039_BINARY_OPS.has(predicateNode.name) && predicateNode.arguments.length >= 1) {
    return predicateNode.arguments[0] ?? null;
  }

  // and(pred1, ...) → left of first predicate
  if (predicateNode.name === 'and' && predicateNode.arguments.length >= 1) {
    return extractPredicateLeftOperand(predicateNode.arguments[0]!);
  }

  return null;
}

/**
 * Decomposes a predicate AST node into a Predicate.
 *
 * Supported patterns:
 *   - eq(left, right) / neq / gt / gte / lt / lte / contains / startsWith
 *   - isNull(left)
 *   - not(isNull(left))  → isNotNull
 *   - not(left)          → isFalsy
 *   - left               → isTruthy (bare expression)
 *
 * The `accumulatorExpr` is used to detect 'currentValue' left operands.
 */
function decomposePredicateNode(
  node: AstNode,
  accumulatorExpr: string,
  originalExpression: string,
): Predicate {
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
    return {
      left: nodeToOperandValue(leftNode, accumulatorExpr, originalExpression),
      operator: 'isNotNull',
      right: { kind: 'currentValue' },
    };
  }

  // isNull(left) → isNull
  if (
    node.type === 'FunctionCall' &&
    node.name === 'isNull' &&
    node.arguments.length === 1
  ) {
    const leftNode = node.arguments[0]!;
    return {
      left: nodeToOperandValue(leftNode, accumulatorExpr, originalExpression),
      operator: 'isNull',
      right: { kind: 'currentValue' },
    };
  }

  // not(left) → isFalsy
  if (
    node.type === 'FunctionCall' &&
    node.name === 'not' &&
    node.arguments.length === 1
  ) {
    const leftNode = node.arguments[0]!;
    return {
      left: nodeToOperandValue(leftNode, accumulatorExpr, originalExpression),
      operator: 'isFalsy',
      right: { kind: 'currentValue' },
    };
  }

  // Binary comparison: eq(left, right), etc.
  if (
    node.type === 'FunctionCall' &&
    FS039_BINARY_OPS.has(node.name) &&
    node.arguments.length === 2
  ) {
    const [leftNode, rightNode] = node.arguments as [AstNode, AstNode];
    return {
      left: nodeToOperandValue(leftNode, accumulatorExpr, originalExpression),
      operator: node.name as ConditionOperatorType,
      right: nodeToOperandValue(rightNode, accumulatorExpr, originalExpression),
    };
  }

  // Bare expression → isTruthy
  return {
    left: nodeToOperandValue(node, accumulatorExpr, originalExpression),
    operator: 'isTruthy',
    right: { kind: 'currentValue' },
  };
}

/**
 * Decomposes a clause predicate node into an array of Predicates.
 *
 * Handles the and(pred1, pred2, ...) pattern for multi-predicate clauses.
 * A single predicate node is returned as a single-element array.
 */
function decomposeClausePredicates(
  node: AstNode,
  accumulatorExpr: string,
  originalExpression: string,
): Predicate[] {
  // and(pred1, pred2, ...) → multiple predicates
  if (
    node.type === 'FunctionCall' &&
    node.name === 'and' &&
    node.arguments.length >= 2
  ) {
    return node.arguments.map((arg) =>
      decomposePredicateNode(arg, accumulatorExpr, originalExpression),
    );
  }
  // Single predicate
  return [decomposePredicateNode(node, accumulatorExpr, originalExpression)];
}

// ---------------------------------------------------------------------------
// FS-039 ChainState decomposition (recursive)
// ---------------------------------------------------------------------------

/**
 * Decomposes an AST node into a ChainState.
 *
 * This is the recursive entry point for decomposing branch chains
 * (then/else branches in conditions, valueMap outputs).
 *
 * Returns an error string if the node cannot be represented as a ChainState.
 */
function decomposeNodeToChainState(
  node: AstNode,
  originalExpression: string,
): ChainState | string {
  // source("path") → field source, no steps
  if (isSourceCall(node)) {
    return {
      source: { kind: 'field', path: extractSourcePath(node) },
      steps: [],
    };
  }

  // Bare literal → static source, no steps
  const staticVal = nodeToStaticValueBranch(node);
  if (staticVal !== null) {
    return {
      source: { kind: 'static', value: staticVal },
      steps: [],
    };
  }

  // static("value") backward compat
  if (
    node.type === 'FunctionCall' &&
    node.name === 'static' &&
    node.arguments.length === 1
  ) {
    const inner = nodeToStaticValueBranch(node.arguments[0]!);
    if (inner !== null) {
      return {
        source: { kind: 'static', value: inner },
        steps: [],
      };
    }
  }

  // FunctionCall — walk outside-in to collect steps
  if (node.type === 'FunctionCall') {
    return decomposeCallNodeToChainState(node, originalExpression);
  }

  return `Cannot decompose node of type ${node.type} into a ChainState`;
}

/**
 * Decomposes a FunctionCall AST node into a ChainState by walking outside-in.
 *
 * Collects steps in reverse order (outermost first), then reverses them.
 * Tracks the accumulator expression at each step for currentValue detection.
 */
function decomposeCallNodeToChainState(
  rootNode: AstNode & { type: 'FunctionCall' },
  originalExpression: string,
): ChainState | string {
  // Collect (node, accumulatorExpr) pairs outside-in.
  // stepsOuterFirst[0] = outermost step (last in final array)
  const stepsOuterFirst: Array<{
    node: AstNode & { type: 'FunctionCall' };
    innerAccumulator: string;
  }> = [];

  let current: AstNode = rootNode;
  let depth = 0;

  // Phase 1: peel off steps outside-in
  while (depth < MAX_CHAIN_DEPTH) {
    depth++;

    if (current.type !== 'FunctionCall') break;

    const fn = current;

    if (fn.name === 'if' && fn.arguments.length === 3) {
      stepsOuterFirst.push({ node: fn, innerAccumulator: '' });
      // For if(), we cannot peel further through the predicate.
      // The base source must be found by scanning the predicate for source("path").
      // Set current to a sentinel that signals "find base from predicate".
      // We handle this in Phase 2 by checking the last pushed step.
      current = fn; // sentinel: same node, handled specially in Phase 2
      break;
    }

    if (fn.name === 'valueMap' && fn.arguments.length === 3) {
      stepsOuterFirst.push({ node: fn, innerAccumulator: '' });
      // First arg of valueMap IS the accumulator expression — peel into it
      current = fn.arguments[0]!;
      break;
    }

    if (CHAINABLE_TRANSFORMS.has(fn.name) && fn.arguments.length >= 1) {
      stepsOuterFirst.push({ node: fn, innerAccumulator: '' });
      current = fn.arguments[0]!;
      continue;
    }

    return `Expression uses unsupported function '${fn.name}' in chain position`;
  }

  if (depth >= MAX_CHAIN_DEPTH) {
    return 'Expression nests too deeply to decompose';
  }

  // Phase 2: determine the base source from `current`
  let baseSource: ChainSource;
  let prefixSteps: ChainStep[] = [];

  // Special case: if the last step pushed was an if() and current === that node,
  // we need to find the base by scanning the predicate for source("path").
  const lastStep = stepsOuterFirst[0]; // outermost = last pushed
  const isIfSentinel =
    lastStep !== undefined &&
    lastStep.node.name === 'if' &&
    current === lastStep.node;

  if (isIfSentinel) {
    // Find the source path from the predicate node.
    // Also check if the predicate's left operand is a transform chain —
    // if so, extract the prefix steps so the accumulator is computed correctly.
    const predicateNode = lastStep.node.arguments[0]!;
    const sourcePath = tryExtractSourcePathFromPredicate(predicateNode);
    if (sourcePath === null) {
      return 'Could not extract source path from if() condition predicate';
    }
    baseSource = { kind: 'field', path: sourcePath };

    // Check if the predicate's left operand is a transform chain
    // (e.g. if(eq(upper(source("name")), ...), ...) — accumulator = upper(source("name")))
    const leftOperandNode = extractPredicateLeftOperand(predicateNode);
    if (
      leftOperandNode !== null &&
      leftOperandNode.type === 'FunctionCall' &&
      CHAINABLE_TRANSFORMS.has(leftOperandNode.name)
    ) {
      const chain = tryWalkTransformChain(leftOperandNode);
      if (chain !== null && chain.sourcePath === sourcePath) {
        prefixSteps = chain.steps;
      }
    }
  } else if (isSourceCall(current)) {
    baseSource = { kind: 'field', path: extractSourcePath(current) };
  } else if (isBareLiteral(current)) {
    const sv = nodeToStaticValueBranch(current);
    if (sv === null) return 'Cannot decompose bare literal as chain source';
    baseSource = { kind: 'static', value: sv };
  } else if (
    current.type === 'FunctionCall' &&
    current.name === 'static' &&
    current.arguments.length === 1
  ) {
    const sv = nodeToStaticValueBranch(current.arguments[0]!);
    if (sv === null) return 'Cannot decompose static() as chain source';
    baseSource = { kind: 'static', value: sv };
  } else if (current.type === 'FunctionCall') {
    // The base is itself a function call (e.g. valueMap first arg is a transform chain).
    const innerResult = decomposeCallNodeToChainState(current, originalExpression);
    if (typeof innerResult === 'string') return innerResult;
    baseSource = innerResult.source;
    prefixSteps = [...innerResult.steps];
  } else {
    return `Cannot decompose node of type ${current.type} as chain base`;
  }

  // Phase 3: compute accumulator at each step position (innermost first)
  const stepsInnerFirst = [...stepsOuterFirst].reverse();

  let accumulator = generateChainSourceExprStr(baseSource);
  for (const s of prefixSteps) {
    accumulator = applyChainStepStr(s, accumulator);
  }

  for (const entry of stepsInnerFirst) {
    entry.innerAccumulator = accumulator;
    const fn = entry.node;
    if (CHAINABLE_TRANSFORMS.has(fn.name)) {
      const extraArgs = fn.arguments.slice(1)
        .map((a) => reconstructNodeExpr(a, originalExpression) ?? '');
      accumulator = `${fn.name}(${[accumulator, ...extraArgs.filter(Boolean)].join(', ')})`;
    }
    // condition/valueMap: accumulator doesn't advance (they produce a new value)
  }

  // Phase 4: build ChainStep[] from stepsInnerFirst
  const chainSteps: ChainStep[] = [...prefixSteps];
  for (const entry of stepsInnerFirst) {
    const step = buildChainStep(entry.node, entry.innerAccumulator, originalExpression);
    if (typeof step === 'string') return step;
    chainSteps.push(step);
  }

  return {
    source: baseSource,
    steps: chainSteps,
  };
}

/**
 * Builds a single ChainStep from a FunctionCall node.
 *
 * @param fn - The FunctionCall node representing this step.
 * @param accumulatorExpr - The expression produced by all inner steps (before this one).
 * @param originalExpression - The full original expression string (for span extraction).
 */
function buildChainStep(
  fn: AstNode & { type: 'FunctionCall' },
  accumulatorExpr: string,
  originalExpression: string,
): ChainStep | string {
  // Transform step
  if (CHAINABLE_TRANSFORMS.has(fn.name)) {
    const extraArgNodes = fn.arguments.slice(1);
    const args: ArgumentSlotRef[] = [];
    for (const argNode of extraArgNodes) {
      const slot = nodeToArgumentSlotRef(argNode);
      if (slot === null) {
        const raw = reconstructNodeExpr(argNode, originalExpression) ?? '';
        args.push({ mode: 'literal', value: raw });
      } else {
        args.push(slot);
      }
    }
    const step: FS039TransformStep = {
      kind: 'transform',
      functionName: fn.name,
      args,
    };
    return step;
  }

  // Condition step: if(predicate, then, else)
  if (fn.name === 'if' && fn.arguments.length === 3) {
    return buildConditionStep(fn, accumulatorExpr, originalExpression);
  }

  // ValueMap step: valueMap(accumulator, {mappings}, default)
  if (fn.name === 'valueMap' && fn.arguments.length === 3) {
    return buildValueMapStep(fn, accumulatorExpr, originalExpression);
  }

  return `Unsupported function '${fn.name}' in chain step position`;
}

/**
 * Builds an FS039ConditionStep from an if() FunctionCall node.
 *
 * Handles nested if() in the else branch as ELSE-IF clauses.
 */
function buildConditionStep(
  ifNode: AstNode & { type: 'FunctionCall'; name: 'if' },
  accumulatorExpr: string,
  originalExpression: string,
): FS039ConditionStep | string {
  const conditions: ConditionClause[] = [];
  let currentNode: AstNode & { type: 'FunctionCall'; name: 'if' } = ifNode;

  while (true) {
    if (currentNode.arguments.length !== 3) {
      return 'if() must have exactly 3 arguments';
    }
    const [predicateNode, thenNode, elseNode] = currentNode.arguments as [AstNode, AstNode, AstNode];

    const predicates = decomposeClausePredicates(predicateNode, accumulatorExpr, originalExpression);

    const thenResult = decomposeNodeToChainState(thenNode, originalExpression);
    if (typeof thenResult === 'string') return thenResult;

    conditions.push({ predicates, thenBranch: thenResult });

    // Check if else branch is another if() → ELSE-IF
    if (
      elseNode.type === 'FunctionCall' &&
      elseNode.name === 'if' &&
      elseNode.arguments.length === 3
    ) {
      currentNode = elseNode as AstNode & { type: 'FunctionCall'; name: 'if' };
      continue;
    }

    const elseResult = decomposeNodeToChainState(elseNode, originalExpression);
    if (typeof elseResult === 'string') return elseResult;

    return {
      kind: 'condition',
      conditions,
      elseBranch: elseResult,
    };
  }
}

/**
 * Builds an FS039ValueMapStep from a valueMap() FunctionCall node.
 *
 * Pattern: valueMap(accumulator, {"key": value, ...}, default)
 */
function buildValueMapStep(
  node: AstNode & { type: 'FunctionCall'; name: 'valueMap' },
  _accumulatorExpr: string,
  originalExpression: string,
): FS039ValueMapStep | string {
  const [_sourceNode, mappingsNode, defaultNode] = node.arguments as [AstNode, AstNode, AstNode];

  if (mappingsNode.type !== 'ObjectTemplate') {
    return 'valueMap() second argument must be an object template';
  }

  const mappings: FS039ValueMapEntry[] = [];
  for (const prop of mappingsNode.properties) {
    const outputResult = decomposeNodeToChainState(prop.value, originalExpression);
    if (typeof outputResult === 'string') return outputResult;
    mappings.push({ whenValue: prop.key, outputChain: outputResult });
  }

  const defaultResult = decomposeNodeToChainState(defaultNode, originalExpression);
  if (typeof defaultResult === 'string') return defaultResult;

  return {
    kind: 'valueMap',
    mappings,
    defaultValue: defaultResult,
  };
}

// ---------------------------------------------------------------------------
// FS-039 expression reconstruction helpers (mirrors generator logic)
// ---------------------------------------------------------------------------

/** Generates the base expression string for a ChainSource. */
function generateChainSourceExprStr(source: ChainSource): string {
  switch (source.kind) {
    case 'none':
      return '';
    case 'field':
      return source.path ? `source("${source.path}")` : '';
    case 'static': {
      const sv = source.value;
      switch (sv.type) {
        case 'string': return `"${sv.value}"`;
        case 'number': return String(sv.value);
        case 'boolean': return sv.value ? 'true' : 'false';
        case 'null': return 'null';
      }
    }
  }
}

/** Applies a single ChainStep to an accumulator expression string. */
function applyChainStepStr(step: ChainStep, accumulator: string): string {
  switch (step.kind) {
    case 'transform': {
      if (!step.functionName) return accumulator;
      const extraArgs = step.args
        .map((a) => (a.mode === 'source' ? `source("${a.path}")` : a.value))
        .filter(Boolean);
      return `${step.functionName}(${[accumulator, ...extraArgs].join(', ')})`;
    }
    case 'condition':
    case 'valueMap':
      // For accumulator tracking purposes, these produce a new value
      return accumulator;
  }
}

// ---------------------------------------------------------------------------
// FS-039 Public API
// ---------------------------------------------------------------------------

/**
 * Decomposes a DSL expression string into a FS-039 ChainState.
 *
 * Returns `{ chain: ChainState }` on success, or `{ error: string }` if the
 * expression cannot be represented as a chain.
 *
 * Supports:
 *   - source("path")                     → field source, no steps
 *   - Bare literals                      → static source, no steps
 *   - upper(source("path"))              → field source + transform step
 *   - default(upper(source("x")), "N/A") → field source + 2 transform steps
 *   - if(eq(source("x"), "v"), t, e)     → field source + condition step
 *   - valueMap(source("x"), {...}, d)    → field source + value map step
 *   - Nested if() in else branch         → condition step with ELSE-IF clauses
 *   - and(pred1, pred2) predicates       → multi-predicate condition clause
 *
 * currentValue detection:
 *   When a condition predicate's left operand expression matches the
 *   accumulated chain expression at that step, it is decomposed as
 *   { kind: 'currentValue' }. This is the most common case and enables
 *   round-trip fidelity with generateChainExpression().
 *
 * @pure — no side effects, deterministic output for a given input.
 */
export function decomposeToChain(expression: string): DecomposeChainResult039 {
  const trimmed = expression.trim();

  if (trimmed === '') {
    return { chain: createEmptyChain() };
  }

  const parseResult = parse(trimmed, defaultRegistry);
  if (!parseResult.success || parseResult.ast === null) {
    const msg =
      parseResult.diagnostics[0]?.message ??
      (parseResult as { error?: string }).error ??
      'unknown parse error';
    return { error: `Parse error: ${msg}` };
  }

  const ast = parseResult.ast;
  const result = decomposeNodeToChainState(ast, trimmed);

  if (typeof result === 'string') {
    return { error: result };
  }

  return { chain: result };
}
