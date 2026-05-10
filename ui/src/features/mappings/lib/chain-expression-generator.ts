/**
 * chain-expression-generator.ts — FS-038 T-02 / FS-039 T-02
 *
 * Two generators in one file:
 *
 *   generateExpressionFromChain(state: ChainBuilderState): string
 *     FS-038 generator — operates on ChainBuilderState (legacy chain model).
 *     Kept for backward compatibility during migration.
 *
 *   generateChainExpression(chain: ChainState): string
 *     FS-039 generator — operates on ChainState (unified chain model).
 *     Handles OperandValue types including the 'currentValue' kind which
 *     substitutes the accumulated chain expression at the point of the condition.
 *
 * Chain composition (both generators):
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
  // FS-039 types
  type ChainState,
  type ChainStep,
  type OperandValue,
  type Predicate,
  type ConditionClause,
  type FS039ConditionStep,
  type FS039ValueMapStep,
  type FS039TransformStep,
  type FS039ValueMapEntry,
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

// ===========================================================================
// FS-039 Generator — generateChainExpression(chain: ChainState): string
//
// Operates on the FS-039 ChainState model with OperandValue predicates.
// The key difference from the FS-038 generator is the 'currentValue' operand
// kind: when a condition predicate's left operand is { kind: 'currentValue' },
// the generator substitutes the accumulated chain expression at that point —
// NOT the final chain output.
//
// Accumulator tracking:
//   The generator maintains `accumulator` as it walks the steps array.
//   Before processing step N, accumulator = expression produced by steps 0..N-1.
//   When a condition step's predicate has left.kind === 'currentValue',
//   the generator uses the current accumulator value.
// ===========================================================================

/**
 * Generates a DSL expression string from a FS-039 ChainState.
 *
 * Returns empty string for:
 *   - source kind 'none' with no steps
 *   - field source with empty path
 *
 * @pure — no side effects, deterministic output for a given input.
 */
export function generateChainExpression(chain: ChainState): string {
  const baseExpr = generateChainSourceExpr(chain.source);
  if (baseExpr === '' && chain.steps.length === 0) return '';

  let accumulator = baseExpr;
  for (const step of chain.steps) {
    accumulator = applyChainStep(step, accumulator);
  }
  return accumulator;
}

// ---------------------------------------------------------------------------
// FS-039 internal helpers
// ---------------------------------------------------------------------------

/**
 * Generates the base expression for a ChainSource.
 */
function generateChainSourceExpr(source: ChainState['source']): string {
  switch (source.kind) {
    case 'none':
      return '';
    case 'field':
      return source.path ? `source(${quoteString(source.path)})` : '';
    case 'static':
      return staticValueToDsl(source.value);
  }
}

/**
 * Resolves an OperandValue to its DSL expression string.
 *
 * @param operand - The operand to resolve.
 * @param accumulatorExpr - The accumulated chain expression at this point.
 *   Used when operand.kind === 'currentValue'.
 */
function resolveOperandValue(operand: OperandValue, accumulatorExpr: string): string {
  switch (operand.kind) {
    case 'currentValue':
      // Substitute the accumulated chain expression at this step.
      // This is the core of the currentValue semantics: the condition tests
      // whatever the chain has produced up to (but not including) this step.
      return accumulatorExpr;
    case 'field':
      return operand.path ? `source(${quoteString(operand.path)})` : '';
    case 'static':
      return staticValueToDsl(operand.value);
    case 'expression':
      return operand.dsl;
  }
}

/**
 * Generates the DSL predicate expression for a single Predicate.
 *
 * @param predicate - The predicate to generate.
 * @param accumulatorExpr - The accumulated chain expression (for currentValue resolution).
 */
function generatePredicateExpr(predicate: Predicate, accumulatorExpr: string): string {
  const leftExpr = resolveOperandValue(predicate.left, accumulatorExpr);
  const rightExpr = resolveOperandValue(predicate.right, accumulatorExpr);
  const op = predicate.operator;

  switch (op) {
    case 'isTruthy':
      return leftExpr;
    case 'isFalsy':
      return `not(${leftExpr})`;
    case 'isNull':
      return `isNull(${leftExpr})`;
    case 'isNotNull':
      return `not(isNull(${leftExpr}))`;
    default:
      return `${op}(${leftExpr}, ${rightExpr})`;
  }
}

/**
 * Generates the DSL predicate expression for a ConditionClause.
 * Multiple predicates are AND-combined: and(pred1, pred2, ...).
 * A single predicate is emitted directly without wrapping.
 */
function generateClausePredicateExpr(clause: ConditionClause, accumulatorExpr: string): string {
  const predicateExprs = clause.predicates.map((p) => generatePredicateExpr(p, accumulatorExpr));
  if (predicateExprs.length === 0) return '';
  if (predicateExprs.length === 1) return predicateExprs[0];
  return `and(${predicateExprs.join(', ')})`;
}

/**
 * Generates DSL for a FS-039 ConditionStep.
 *
 * Structure:
 *   Single IF clause:  if(predicate, thenExpr, elseExpr)
 *   With ELSE-IF:      if(pred1, then1, if(pred2, then2, elseExpr))
 *
 * The accumulator is passed to predicate resolution so 'currentValue'
 * operands substitute the chain value at this point.
 */
function generateFS039ConditionStep(step: FS039ConditionStep, accumulatorExpr: string): string {
  // Build the else expression first (innermost)
  let elseExpr = generateChainExpression(step.elseBranch);

  // Fold ELSE-IF clauses from the inside out (reverse order)
  // conditions[0] = IF, conditions[1..] = ELSE-IF
  const elseIfClauses = step.conditions.slice(1);
  for (let i = elseIfClauses.length - 1; i >= 0; i--) {
    const clause = elseIfClauses[i];
    const clausePredicate = generateClausePredicateExpr(clause, accumulatorExpr);
    const clauseThen = generateChainExpression(clause.thenBranch);
    elseExpr = `if(${clausePredicate}, ${clauseThen}, ${elseExpr})`;
  }

  // Build the IF clause (conditions[0])
  const ifClause = step.conditions[0];
  if (!ifClause) return elseExpr; // degenerate: no IF clause, return else
  const ifPredicate = generateClausePredicateExpr(ifClause, accumulatorExpr);
  const ifThen = generateChainExpression(ifClause.thenBranch);

  return `if(${ifPredicate}, ${ifThen}, ${elseExpr})`;
}

/**
 * Generates DSL for a FS-039 ValueMapStep.
 *
 * Pattern: valueMap(accumulator, {"key1": val1, "key2": val2}, defaultExpr)
 */
function generateFS039ValueMapStep(step: FS039ValueMapStep, accumulatorExpr: string): string {
  const validMappings = step.mappings.filter((m) => m.whenValue.trim().length > 0);
  let entriesStr: string;
  if (validMappings.length === 0) {
    entriesStr = '{}';
  } else {
    const pairs = validMappings.map((m: FS039ValueMapEntry) => {
      const key = quoteString(m.whenValue);
      const value = generateChainExpression(m.outputChain);
      return `${key}: ${value}`;
    });
    entriesStr = `{${pairs.join(', ')}}`;
  }
  const defaultExpr = generateChainExpression(step.defaultValue);
  return `valueMap(${accumulatorExpr}, ${entriesStr}, ${defaultExpr})`;
}

/**
 * Generates DSL for a FS-039 TransformStep wrapping the accumulator.
 * Pattern: functionName(accumulator, arg2, arg3, ...)
 */
function generateFS039TransformStep(step: FS039TransformStep, accumulatorExpr: string): string {
  if (!step.functionName) return accumulatorExpr;
  const extraArgs = step.args.map(generateArgSlot).filter(Boolean);
  const allArgs = [accumulatorExpr, ...extraArgs];
  return `${step.functionName}(${allArgs.join(', ')})`;
}

/**
 * Applies a single FS-039 ChainStep to the accumulated expression.
 * Passes the current accumulator to each step so 'currentValue' operands
 * resolve correctly.
 */
function applyChainStep(step: ChainStep, accumulatorExpr: string): string {
  switch (step.kind) {
    case 'transform':
      return generateFS039TransformStep(step, accumulatorExpr);
    case 'condition':
      return generateFS039ConditionStep(step, accumulatorExpr);
    case 'valueMap':
      return generateFS039ValueMapStep(step, accumulatorExpr);
  }
}
