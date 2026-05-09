/**
 * pipeline-decomposer.ts
 *
 * Parses a DSL expression string and maps it back into an ExpressionBuilderState.
 * Auto-detects the expression mode (value pipeline, conditional, value map) from
 * the AST structure, enabling the UI to auto-switch to the appropriate builder tab.
 *
 * Depth limits:
 *  - Pipeline transform chain: max 5 levels
 *  - Conditional else-if nesting: max 5 levels (matches the form's 5 else-if cap)
 *
 * Failure cases:
 *  - Syntax errors in the expression
 *  - Unsupported function nesting patterns
 *  - Nesting depth beyond the configured limit
 *  - Expressions that don't fit any recognized mode
 */

import { parse, defaultRegistry } from '@/lib/engine';
import type { AstNode } from '@/lib/engine';
import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';
import type {
  BranchValue,
  ComparisonOperator,
  ConditionGroup,
  ConditionRow,
  ExpressionBuilderState,
  FallbackValue,
  Operand,
  PrimitiveValue,
  TransformParameterValue,
  TransformStep,
  ValueMapEntry,
} from './expression-builder-state';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PIPELINE_DEPTH = 5;
const MAX_CONDITIONAL_DEPTH = 5;

/**
 * Functions that are valid as single-input transform steps in a value pipeline.
 * These are functions where the first argument is the "value being transformed"
 * and additional arguments are configuration parameters.
 * Multi-input functions (concat, map, filter, etc.) are excluded.
 */
const TRANSFORM_FUNCTIONS = new Set([
  // String transforms
  'upper', 'lower', 'trim', 'replace', 'replaceAll', 'length', 'substring',
  // Date transforms
  'formatDate',
  // Math transforms
  'add', 'subtract', 'multiply', 'divide', 'round', 'abs',
  // Type conversion
  'cast',
  // Null handling (single-input)
  'default', 'coalesce',
  // Array single-input
  'flatten', 'first', 'count',
]);

/** Comparison operators recognized in condition rows. */
const COMPARISON_OPERATORS = new Set<string>(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'isNull']);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PipelineDecompositionResult =
  | { readonly success: true; readonly state: ExpressionBuilderState }
  | { readonly success: false; readonly reason: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(reason: string): PipelineDecompositionResult {
  return { success: false, reason };
}

function ok(state: ExpressionBuilderState): PipelineDecompositionResult {
  return { success: true, state };
}

/** Extract a primitive value from a literal AST node. */
function literalValue(node: AstNode): PrimitiveValue | undefined {
  switch (node.type) {
    case 'StringLiteral':
      return node.value;
    case 'NumberLiteral':
      return node.value;
    case 'BooleanLiteral':
      return node.value;
    case 'NullLiteral':
      return null;
    default:
      return undefined;
  }
}

/** Serialize an AST node back to a DSL string (best-effort, for expression branch values). */
function nodeToExpressionString(node: AstNode): string {
  switch (node.type) {
    case 'StringLiteral':
      return `"${node.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    case 'NumberLiteral':
      return String(node.value);
    case 'BooleanLiteral':
      return node.value ? 'true' : 'false';
    case 'NullLiteral':
      return 'null';
    case 'FunctionCall': {
      const args = node.arguments.map(nodeToExpressionString).join(', ');
      return `${node.name}(${args})`;
    }
    case 'ObjectTemplate': {
      const props = node.properties
        .map((p) => `"${p.key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}": ${nodeToExpressionString(p.value)}`)
        .join(', ');
      return `{${props}}`;
    }
  }
}

/** Resolve a branch value from an AST node. */
function nodeToBranchValue(node: AstNode): BranchValue {
  // Static string literal
  if (node.type === 'StringLiteral') {
    return { kind: 'static', value: node.value, valueType: 'string' };
  }
  if (node.type === 'NumberLiteral') {
    return { kind: 'static', value: String(node.value), valueType: 'number' };
  }
  if (node.type === 'BooleanLiteral') {
    return { kind: 'static', value: node.value ? 'true' : 'false', valueType: 'boolean' };
  }
  if (node.type === 'NullLiteral') {
    return { kind: 'static', value: '', valueType: 'null' };
  }
  // source("path")
  if (
    node.type === 'FunctionCall' &&
    node.name === 'source' &&
    node.arguments.length === 1 &&
    node.arguments[0].type === 'StringLiteral'
  ) {
    return { kind: 'source', value: (node.arguments[0] as Extract<AstNode, { type: 'StringLiteral' }>).value };
  }
  // static("value") — treat as static branch
  if (
    node.type === 'FunctionCall' &&
    node.name === 'static' &&
    node.arguments.length === 1
  ) {
    const inner = node.arguments[0];
    if (inner.type === 'StringLiteral') {
      return { kind: 'static', value: inner.value, valueType: 'string' };
    }
    if (inner.type === 'NumberLiteral') {
      return { kind: 'static', value: String(inner.value), valueType: 'number' };
    }
    if (inner.type === 'BooleanLiteral') {
      return { kind: 'static', value: inner.value ? 'true' : 'false', valueType: 'boolean' };
    }
    if (inner.type === 'NullLiteral') {
      return { kind: 'static', value: '', valueType: 'null' };
    }
  }
  // Nested if() — conditional branch
  if (node.type === 'FunctionCall' && node.name === 'if') {
    const nested = decomposeConditional(node, 0);
    if (nested.success) {
      return { kind: 'conditional', value: nested.state };
    }
  }
  // Attempt pipeline decomposition for transform chains (T-03)
  // e.g. upper(source("tier")) → { kind: 'pipeline', state: { mode: 'value', sources: [...], transforms: [...] } }
  if (node.type === 'FunctionCall' && TRANSFORM_FUNCTIONS.has(node.name)) {
    const pipelineResult = decomposeValuePipeline(node as FunctionCallNode);
    if (pipelineResult.success && pipelineResult.state.mode === 'value') {
      return { kind: 'pipeline', state: pipelineResult.state };
    }
  }
  // Fallback: raw expression string
  return { kind: 'expression', value: nodeToExpressionString(node) };
}

/** Resolve an operand from an AST node (left/right side of a comparison). */
function nodeToOperand(node: AstNode): Operand {
  if (
    node.type === 'FunctionCall' &&
    node.name === 'source' &&
    node.arguments.length === 1 &&
    node.arguments[0].type === 'StringLiteral'
  ) {
    return { kind: 'source', value: (node.arguments[0] as Extract<AstNode, { type: 'StringLiteral' }>).value };
  }
  // String literals → static (will be re-quoted by generator)
  if (node.type === 'StringLiteral') {
    return { kind: 'static', value: node.value };
  }
  // Number/boolean/null literals → expression (verbatim DSL, no extra quoting)
  if (node.type === 'NumberLiteral' || node.type === 'BooleanLiteral' || node.type === 'NullLiteral') {
    return { kind: 'expression', value: nodeToExpressionString(node) };
  }
  // Attempt pipeline decomposition for transform chains on left operand (T-03)
  // e.g. length(source("name")) → { kind: 'pipeline', pipelineState: { ... } }
  if (node.type === 'FunctionCall' && TRANSFORM_FUNCTIONS.has(node.name)) {
    const pipelineResult = decomposeValuePipeline(node as FunctionCallNode);
    if (pipelineResult.success && pipelineResult.state.mode === 'value') {
      return {
        kind: 'pipeline',
        value: nodeToExpressionString(node),
        pipelineState: pipelineResult.state,
      };
    }
  }
  return { kind: 'expression', value: nodeToExpressionString(node) };
}

// ---------------------------------------------------------------------------
// Condition decomposition
// ---------------------------------------------------------------------------

function decomposeConditionNode(
  node: AstNode,
): { success: true; result: ConditionRow | ConditionGroup } | { success: false; reason: string } {
  // Direct boolean condition: if(source("flag"), then, else)
  if (
    node.type === 'FunctionCall' &&
    node.name === 'source' &&
    node.arguments.length === 1 &&
    node.arguments[0].type === 'StringLiteral'
  ) {
    const left = nodeToOperand(node);
    const row: ConditionRow = {
      leftOperand: left,
      comparison: 'isTruthy',
      rightOperand: { kind: 'static', value: '' },
    };
    return { success: true, result: row };
  }

  // Direct boolean condition from a supported inline pipeline expression.
  if (node.type === 'FunctionCall' && TRANSFORM_FUNCTIONS.has(node.name)) {
    const left = nodeToOperand(node);
    if (left.kind === 'pipeline') {
      const row: ConditionRow = {
        leftOperand: left,
        comparison: 'isTruthy',
        rightOperand: { kind: 'static', value: '' },
      };
      return { success: true, result: row };
    }
  }

  if (node.type !== 'FunctionCall') {
    return { success: false, reason: `Expected a condition function, got ${node.type}` };
  }

  const name = node.name;

  // and/or → ConditionGroup
  if (name === 'and' || name === 'or') {
    if (node.arguments.length < 2) {
      return { success: false, reason: `'${name}' requires at least 2 arguments` };
    }
    const conditions: Array<ConditionRow | ConditionGroup> = [];
    for (const arg of node.arguments) {
      const inner = decomposeConditionNode(arg);
      if (!inner.success) return inner;
      conditions.push(inner.result);
    }
    return { success: true, result: { operator: name, conditions } };
  }

  // isNull → unary ConditionRow
  if (name === 'isNull') {
    if (node.arguments.length < 1) {
      return { success: false, reason: `'isNull' requires 1 argument` };
    }
    const left = nodeToOperand(node.arguments[0]);
    const row: ConditionRow = {
      leftOperand: left,
      comparison: 'isNull',
      rightOperand: { kind: 'static', value: '' },
    };
    return { success: true, result: row };
  }

  // not(isNull(...)) → isNotNull
  if (name === 'not' && node.arguments.length === 1) {
    const inner = node.arguments[0];
    if (inner.type === 'FunctionCall' && inner.name === 'isNull' && inner.arguments.length === 1) {
      const left = nodeToOperand(inner.arguments[0]);
      const row: ConditionRow = {
        leftOperand: left,
        comparison: 'isNotNull',
        rightOperand: { kind: 'static', value: '' },
      };
      return { success: true, result: row };
    }

    // not(<boolean-operand>) → isFalsy
    const left = nodeToOperand(inner);
    if (left.kind === 'source' || left.kind === 'expression' || left.kind === 'pipeline') {
      const row: ConditionRow = {
        leftOperand: left,
        comparison: 'isFalsy',
        rightOperand: { kind: 'static', value: '' },
      };
      return { success: true, result: row };
    }
  }

  // Binary comparison operators
  if (COMPARISON_OPERATORS.has(name)) {
    if (node.arguments.length < 2) {
      return { success: false, reason: `'${name}' requires 2 arguments` };
    }
    const left = nodeToOperand(node.arguments[0]);
    const right = nodeToOperand(node.arguments[1]);
    const row: ConditionRow = {
      leftOperand: left,
      comparison: name as ComparisonOperator,
      rightOperand: right,
    };
    return { success: true, result: row };
  }

  return {
    success: false,
    reason: `Function '${name}' is not supported as a condition in the guided builder.`,
  };
}

/** Wrap a single ConditionRow or ConditionGroup into a ConditionGroup. */
function wrapAsGroup(item: ConditionRow | ConditionGroup): ConditionGroup {
  if ('operator' in item) return item;
  return { operator: 'and', conditions: [item] };
}

// ---------------------------------------------------------------------------
// Conditional mode decomposition
// ---------------------------------------------------------------------------

type FunctionCallNode = Extract<AstNode, { type: 'FunctionCall' }>;

function decomposeConditional(
  node: FunctionCallNode,
  depth: number,
): PipelineDecompositionResult {
  if (depth > MAX_CONDITIONAL_DEPTH) {
    return fail('Conditional expression nests too deeply (more than 5 else-if levels) for the guided builder.');
  }

  if (node.arguments.length !== 3) {
    return fail(`'if' requires exactly 3 arguments.`);
  }

  const [condNode, thenNode, elseNode] = node.arguments;

  const condResult = decomposeConditionNode(condNode);
  if (!condResult.success) return fail(condResult.reason);

  const condition = wrapAsGroup(condResult.result);
  const thenBranch = nodeToBranchValue(thenNode);

  // Detect else-if: else branch is another if()
  let elseBranch: BranchValue;
  if (elseNode.type === 'FunctionCall' && elseNode.name === 'if') {
    const nested = decomposeConditional(elseNode, depth + 1);
    if (!nested.success) return nested;
    elseBranch = { kind: 'conditional', value: nested.state };
  } else {
    elseBranch = nodeToBranchValue(elseNode);
  }

  return ok({ mode: 'conditional', condition, thenBranch, elseBranch });
}

// ---------------------------------------------------------------------------
// Value Map mode decomposition
// ---------------------------------------------------------------------------

function decomposeValueMap(node: FunctionCallNode): PipelineDecompositionResult {
  if (node.arguments.length < 2) {
    return fail(`'valueMap' requires at least 2 arguments.`);
  }

  const [sourceNode, mappingsNode, fallbackNode] = node.arguments;

  // First arg must be source("path")
  if (
    sourceNode.type !== 'FunctionCall' ||
    sourceNode.name !== 'source' ||
    sourceNode.arguments.length !== 1 ||
    sourceNode.arguments[0].type !== 'StringLiteral'
  ) {
    return fail(`'valueMap' first argument must be source("path").`);
  }
  const inputSource = (sourceNode.arguments[0] as Extract<AstNode, { type: 'StringLiteral' }>).value;

  // Second arg must be ObjectTemplate
  if (mappingsNode.type !== 'ObjectTemplate') {
    return fail(`'valueMap' second argument must be an object literal mapping.`);
  }

  const mappings: ValueMapEntry[] = mappingsNode.properties.map((prop) => ({
    whenValue: prop.key,
    mapTo:
      prop.value.type === 'StringLiteral'
        ? prop.value.value
        : prop.value.type === 'NumberLiteral'
          ? String(prop.value.value)
          : prop.value.type === 'BooleanLiteral'
            ? (prop.value.value ? 'true' : 'false')
            : prop.value.type === 'NullLiteral'
              ? ''
              : nodeToExpressionString(prop.value),
    mapToType:
      prop.value.type === 'StringLiteral'
        ? 'string'
        : prop.value.type === 'NumberLiteral'
          ? 'number'
          : prop.value.type === 'BooleanLiteral'
            ? 'boolean'
            : prop.value.type === 'NullLiteral'
              ? 'null'
              : 'string',
  }));

  // Third arg: fallback (optional)
  let fallback: FallbackValue;
  if (!fallbackNode) {
    fallback = { kind: 'null' };
  } else if (fallbackNode.type === 'NullLiteral') {
    fallback = { kind: 'null' };
  } else if (fallbackNode.type === 'StringLiteral') {
    fallback = { kind: 'value', value: fallbackNode.value, valueType: 'string' };
  } else if (fallbackNode.type === 'NumberLiteral') {
    fallback = { kind: 'value', value: String(fallbackNode.value), valueType: 'number' };
  } else if (fallbackNode.type === 'BooleanLiteral') {
    fallback = { kind: 'value', value: fallbackNode.value ? 'true' : 'false', valueType: 'boolean' };
  } else if (
    fallbackNode.type === 'FunctionCall' &&
    fallbackNode.name === 'static' &&
    fallbackNode.arguments.length === 1
  ) {
    const inner = fallbackNode.arguments[0];
    if (inner.type === 'StringLiteral') {
      fallback = { kind: 'value', value: inner.value, valueType: 'string' };
    } else if (inner.type === 'NumberLiteral') {
      fallback = { kind: 'value', value: String(inner.value), valueType: 'number' };
    } else if (inner.type === 'BooleanLiteral') {
      fallback = { kind: 'value', value: inner.value ? 'true' : 'false', valueType: 'boolean' };
    } else if (inner.type === 'NullLiteral') {
      fallback = { kind: 'null' };
    } else {
      fallback = { kind: 'value', value: nodeToExpressionString(fallbackNode), valueType: 'string' };
    }
  } else {
    fallback = { kind: 'value', value: nodeToExpressionString(fallbackNode), valueType: 'string' };
  }

  return ok({ mode: 'valueMap', inputSource, mappings, fallback });
}

// ---------------------------------------------------------------------------
// Value pipeline decomposition
// ---------------------------------------------------------------------------

/** Resolve parameter values for a transform function from its additional AST arguments. */
function resolveTransformParameters(
  functionName: string,
  additionalArgs: readonly AstNode[],
): TransformParameterValue[] {
  const catalogEntry = DSL_FUNCTION_CATALOG.find((e) => e.name === functionName);
  // Parameters start at index 1 (index 0 is the auto-wired value/pipeline input)
  const paramDefs = catalogEntry ? catalogEntry.parameters.slice(1) : [];

  return additionalArgs.map((arg, i) => {
    const paramDef = paramDefs[i];
    const val = literalValue(arg);
    return {
      name: paramDef?.name ?? `arg${i + 1}`,
      value: val !== undefined ? val : nodeToExpressionString(arg),
      type: paramDef?.type ?? 'any',
    };
  });
}

function decomposeValuePipeline(node: FunctionCallNode): PipelineDecompositionResult {
  // Walk the chain: outermost call is the last transform, innermost is source()
  const transforms: TransformStep[] = [];
  let current: AstNode = node;
  let depth = 0;

  while (true) {
    if (depth > MAX_PIPELINE_DEPTH) {
      return fail('Expression pipeline nests too deeply (more than 5 levels) for the guided builder.');
    }

    if (current.type !== 'FunctionCall') {
      return fail(`Expected a function call in the pipeline chain, got ${current.type}.`);
    }

    const fn = current as FunctionCallNode;

    // Base case: source("path")
    if (fn.name === 'source') {
      if (fn.arguments.length !== 1 || fn.arguments[0].type !== 'StringLiteral') {
        return fail(`'source' must have exactly one string path argument.`);
      }
      const path = (fn.arguments[0] as Extract<AstNode, { type: 'StringLiteral' }>).value;
      // Reverse transforms so they are in pipeline order (innermost first = first applied)
      transforms.reverse();
      return ok({
        mode: 'value',
        inputType: 'source',
        sources: [{ path }],
        transforms,
      });
    }

    // Must be a recognized transform function
    if (!TRANSFORM_FUNCTIONS.has(fn.name)) {
      return fail(`Function '${fn.name}' is not supported as a transform step in the guided builder.`);
    }

    if (fn.arguments.length < 1) {
      return fail(`Transform function '${fn.name}' must have at least one argument.`);
    }

    const additionalArgs = fn.arguments.slice(1);
    const parameters = resolveTransformParameters(fn.name, additionalArgs);
    transforms.push({ functionName: fn.name, parameters });

    current = fn.arguments[0];
    depth++;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to decompose a DSL expression string into an ExpressionBuilderState.
 *
 * Auto-detects the mode (value, conditional, valueMap) from the AST structure.
 *
 * @returns `{ success: true, state }` if the expression maps to a supported mode,
 *   or `{ success: false, reason }` with a human-readable explanation otherwise.
 */
export function decomposeExpression(expression: string): PipelineDecompositionResult {
  if (expression.trim() === '') {
    return fail('Expression is empty.');
  }

  const result = parse(expression, defaultRegistry);
  if (!result.success || result.ast === null) {
    const msg = result.diagnostics[0]?.message ?? 'Syntax error';
    return fail(`Expression has syntax errors: ${msg}`);
  }

  const ast = result.ast;

  // Bare literals at root → static value state
  if (ast.type === 'StringLiteral') {
    return ok({ mode: 'value', inputType: 'static', sources: [], transforms: [], staticValue: { type: 'string', value: ast.value } });
  }
  if (ast.type === 'NumberLiteral') {
    return ok({ mode: 'value', inputType: 'static', sources: [], transforms: [], staticValue: { type: 'number', value: ast.value } });
  }
  if (ast.type === 'BooleanLiteral') {
    return ok({ mode: 'value', inputType: 'static', sources: [], transforms: [], staticValue: { type: 'boolean', value: ast.value } });
  }
  if (ast.type === 'NullLiteral') {
    return ok({ mode: 'value', inputType: 'static', sources: [], transforms: [], staticValue: { type: 'null' } });
  }

  if (ast.type !== 'FunctionCall') {
    return fail('Expression is not a function call and cannot be loaded into the guided builder.');
  }

  const root = ast as FunctionCallNode;

  switch (root.name) {
    case 'valueMap':
      return decomposeValueMap(root);

    case 'if':
      return decomposeConditional(root, 0);

    case 'source': {
      // Direct copy: source("path") with no transforms
      if (root.arguments.length !== 1 || root.arguments[0].type !== 'StringLiteral') {
        return fail(`'source' must have exactly one string path argument.`);
      }
      const path = (root.arguments[0] as Extract<AstNode, { type: 'StringLiteral' }>).value;
      return ok({ mode: 'value', inputType: 'source', sources: [{ path }], transforms: [] });
    }

    case 'static': {
      // static() wrapper — legacy / backward compat
      if (root.arguments.length !== 1) {
        return fail(`'static' must have exactly one argument.`);
      }
      const inner = root.arguments[0];
      if (inner.type === 'StringLiteral') {
        return ok({ mode: 'value', inputType: 'static', sources: [], transforms: [], staticValue: { type: 'string', value: inner.value } });
      }
      if (inner.type === 'NumberLiteral') {
        return ok({ mode: 'value', inputType: 'static', sources: [], transforms: [], staticValue: { type: 'number', value: inner.value } });
      }
      if (inner.type === 'BooleanLiteral') {
        return ok({ mode: 'value', inputType: 'static', sources: [], transforms: [], staticValue: { type: 'boolean', value: inner.value } });
      }
      if (inner.type === 'NullLiteral') {
        return ok({ mode: 'value', inputType: 'static', sources: [], transforms: [], staticValue: { type: 'null' } });
      }
      return fail(`'static' argument must be a literal value.`);
    }

    default: {
      // Attempt pipeline decomposition (transform wrapping source())
      if (TRANSFORM_FUNCTIONS.has(root.name)) {
        return decomposeValuePipeline(root);
      }
      return fail(
        `Expression uses unsupported nesting pattern. Function '${root.name}' cannot be the root of a guided builder expression.`,
      );
    }
  }
}
