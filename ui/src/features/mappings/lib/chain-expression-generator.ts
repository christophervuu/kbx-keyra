/**
 * chain-expression-generator.ts — FS-038 T-02
 *
 * Pure function that converts a ChainBuilderState into a valid DSL expression string.
 * This is the forward path: state → DSL.
 *
 * Entry point:
 *   generateExpressionFromChain(state: ChainBuilderState): string
 *
 * Returns empty string for incomplete states (no sourcePath, no staticValue, etc.).
 *
 * Chain composition:
 *   base value → step 1 wraps base → step 2 wraps step 1 → ... → final expression
 *
 * @pure — no side effects, no hooks, deterministic output for a given input.
 */

import type {
  ArgumentSlotRef,
  ChainBranch,
  ChainBuilderState,
  ChainValueMapEntry,
  ConditionLogicStep,
  ConditionOperand,
  ConditionOperatorType,
  ElseIfStep,
  LogicStep,
  StaticValueBranch,
  TransformLogicStep,
  ValueMapLogicStep,
} from './chain-builder-state';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escapes and double-quotes a string for DSL output.
 */
function quoteString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Converts a StaticValueBranch to its DSL literal representation.
 *   string  → "quoted"
 *   number  → 42
 *   boolean → true / false
 *   null    → null
 */
function staticValueToDsl(value: StaticValueBranch): string {
  switch (value.type) {
    case 'string':
      return quoteString(value.value);
    case 'number':
      return String(value.value);
    case 'boolean':
      return value.value ? 'true' : 'false';
    case 'null':
      return 'null';
  }
}

/**
 * Converts a raw literal string to its DSL representation using heuristic
 * type detection (matches the engine's literal parsing behaviour).
 *
 *   "true" / "false"         → bare boolean
 *   parseable finite number  → bare number
 *   everything else          → quoted string
 */
function literalToDsl(value: string): string {
  if (value === 'true' || value === 'false') return value;
  if (value === 'null') return 'null';
  const trimmed = value.trim();
  const asNumber = Number(trimmed);
  if (trimmed !== '' && isFinite(asNumber)) return String(asNumber);
  return quoteString(value);
}

/**
 * Generates DSL for a single ArgumentSlotRef (additional arg beyond implicit first).
 */
function generateArgSlot(slot: ArgumentSlotRef): string {
  switch (slot.mode) {
    case 'source':
      return slot.path ? `source(${quoteString(slot.path)})` : '';
    case 'literal':
      return literalToDsl(slot.value);
  }
}

/**
 * Generates DSL for a ConditionOperand.
 * `currentValueExpr` is the accumulated expression at the point of the condition step.
 */
function generateConditionOperand(
  operand: ConditionOperand,
  currentValueExpr: string,
): string {
  switch (operand.kind) {
    case 'currentValue':
      return currentValueExpr;
    case 'source':
      return operand.path ? `source(${quoteString(operand.path)})` : '';
    case 'literal':
      return literalToDsl(operand.value);
  }
}

/**
 * Generates the condition predicate DSL for a single condition step.
 * Handles all ConditionOperatorType values.
 */
function generateConditionPredicate(
  operator: ConditionOperatorType,
  leftExpr: string,
  rightOperand: ConditionOperand,
  currentValueExpr: string,
): string {
  const right = generateConditionOperand(rightOperand, currentValueExpr);

  switch (operator) {
    case 'isTruthy':
      return leftExpr;
    case 'isFalsy':
      return `not(${leftExpr})`;
    case 'isNull':
      return `isNull(${leftExpr})`;
    case 'isNotNull':
      return `not(isNull(${leftExpr}))`;
    default:
      return `${operator}(${leftExpr}, ${right})`;
  }
}

/**
 * Generates DSL for a ChainBranch.
 * Used for then/else branches in conditions and output values in value maps.
 */
function generateChainBranch(branch: ChainBranch): string {
  switch (branch.kind) {
    case 'static':
      return staticValueToDsl(branch.value);
    case 'source': {
      if (!branch.path) return '';
      let expr = `source(${quoteString(branch.path)})`;
      for (const step of branch.steps) {
        expr = generateTransformStep(step, expr);
      }
      return expr;
    }
    case 'expression':
      return branch.raw;
  }
}

/**
 * Generates DSL for a single TransformLogicStep wrapping a previous expression.
 * Pattern: functionName(previousExpr, arg2, arg3, ...)
 */
function generateTransformStep(step: TransformLogicStep, previousExpr: string): string {
  if (!step.functionName) return previousExpr;
  const extraArgs = step.args.map(generateArgSlot).filter(Boolean);
  const allArgs = [previousExpr, ...extraArgs];
  return `${step.functionName}(${allArgs.join(', ')})`;
}

/**
 * Generates DSL for a ConditionLogicStep wrapping a previous expression.
 * Pattern: if(predicate, thenExpr, elseExpr)
 *
 * With elseIf steps, nests them in the else slot:
 *   if(pred1, then1, if(pred2, then2, else))
 */
function generateConditionStep(step: ConditionLogicStep, previousExpr: string): string {
  const leftExpr = step.useCurrentValue
    ? previousExpr
    : step.customLeftOperand
      ? generateConditionOperand(step.customLeftOperand, previousExpr)
      : previousExpr;

  const predicate = generateConditionPredicate(
    step.operator,
    leftExpr,
    step.rightOperand,
    previousExpr,
  );

  const thenExpr = generateChainBranch(step.thenBranch);

  // Build else expression — fold elseIf steps from the inside out
  let elseExpr = generateChainBranch(step.elseBranch);

  if (step.elseIfSteps && step.elseIfSteps.length > 0) {
    // Process elseIf steps in reverse so innermost is built first
    const reversed = [...step.elseIfSteps].reverse();
    for (const elseIf of reversed) {
      const elseIfLeft = elseIf.useCurrentValue
        ? previousExpr
        : elseIf.customLeftOperand
          ? generateConditionOperand(elseIf.customLeftOperand, previousExpr)
          : previousExpr;

      const elseIfPredicate = generateConditionPredicate(
        elseIf.operator,
        elseIfLeft,
        elseIf.rightOperand,
        previousExpr,
      );
      const elseIfThen = generateChainBranch(elseIf.thenBranch);
      elseExpr = `if(${elseIfPredicate}, ${elseIfThen}, ${elseExpr})`;
    }
  }

  return `if(${predicate}, ${thenExpr}, ${elseExpr})`;
}

/**
 * Generates DSL for a ValueMapLogicStep wrapping a previous expression.
 * Pattern: valueMap(previousExpr, {"key": value, ...}, defaultExpr)
 */
function generateValueMapStep(step: ValueMapLogicStep, previousExpr: string): string {
  const entries = generateValueMapEntries(step.mappings);
  const defaultExpr = generateChainBranch(step.defaultValue);
  return `valueMap(${previousExpr}, ${entries}, ${defaultExpr})`;
}

/**
 * Generates the object literal DSL for value map entries.
 * Pattern: {"key1": value1, "key2": value2}
 */
function generateValueMapEntries(mappings: readonly ChainValueMapEntry[]): string {
  const validMappings = mappings.filter((m) => m.whenValue.trim().length > 0);
  if (validMappings.length === 0) return '{}';
  const pairs = validMappings.map((m) => {
    const key = quoteString(m.whenValue);
    const value = generateChainBranch(m.outputValue);
    return `${key}: ${value}`;
  });
  return `{${pairs.join(', ')}}`;
}

/**
 * Applies a single LogicStep to the accumulated expression.
 */
function applyLogicStep(step: LogicStep, currentExpr: string): string {
  switch (step.kind) {
    case 'transform':
      return generateTransformStep(step, currentExpr);
    case 'condition':
      return generateConditionStep(step, currentExpr);
    case 'valueMap':
      return generateValueMapStep(step, currentExpr);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a valid DSL expression string from a ChainBuilderState.
 *
 * Returns empty string for:
 *   - source entry with no sourcePath (or empty/whitespace-only path)
 *   - static entry with no staticValue
 *   - external entry (placeholder — always returns empty string)
 *
 * Logic steps are applied sequentially, each wrapping the previous expression.
 *
 * @pure — no side effects, deterministic output for a given input.
 */
export function generateExpressionFromChain(state: ChainBuilderState): string {
  // Determine base expression from entry type
  let baseExpr: string;

  switch (state.entryType) {
    case 'source': {
      if (!state.sourcePath || state.sourcePath.trim().length === 0) return '';
      baseExpr = `source(${quoteString(state.sourcePath)})`;
      break;
    }
    case 'static': {
      if (!state.staticValue) return '';
      baseExpr = staticValueToDsl(state.staticValue);
      break;
    }
    case 'external': {
      // Placeholder — not yet implemented
      return '';
    }
  }

  // Apply logic steps sequentially
  let expression = baseExpr;
  for (const step of state.logicSteps) {
    expression = applyLogicStep(step, expression);
  }

  return expression;
}
