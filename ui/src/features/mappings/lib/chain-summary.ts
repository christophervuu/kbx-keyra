/**
 * chain-summary.ts — FS-039 T-07
 *
 * Pure functions for generating human-readable summary text for chain steps
 * and chain sources. Used by ChainStepCard to render collapsed step headers.
 *
 * Summary text is truncated at ~80 characters with an ellipsis.
 *
 * Summary patterns (from spec section 10):
 *   Source (field)  → source("customer.name")
 *   Source (static) → "hello" / 42 / true
 *   Transform       → upper() / default("N/A") / cast("number")
 *   Condition       → If {predicate summary} then {branch summary} else {branch summary}
 *   Value Map       → Map {N} values, default: {default summary}
 */

import type {
  ChainState,
  ChainStep,
  ChainSource,
  FS039TransformStep,
  FS039ConditionStep,
  FS039ValueMapStep,
  ConditionClause,
  Predicate,
  OperandValue,
  StaticValueBranch,
} from './chain-builder-state';
import {
  isFS039TransformStep,
  isFS039ConditionStep,
  isFS039ValueMapStep,
  isFieldSource,
  isStaticSource,
  isNoneSource,
} from './chain-builder-state';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SUMMARY_LENGTH = 80;

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

function truncate(text: string, max = MAX_SUMMARY_LENGTH): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

// ---------------------------------------------------------------------------
// Static value summary
// ---------------------------------------------------------------------------

function summarizeStaticValue(value: StaticValueBranch): string {
  if (value.type === 'null') return 'null';
  if (value.type === 'boolean') return String(value.value);
  if (value.type === 'number') return String(value.value);
  // string
  return `"${String(value.value)}"`;
}

// ---------------------------------------------------------------------------
// Source summary
// ---------------------------------------------------------------------------

/**
 * Returns a short human-readable summary for a chain source.
 *
 * Examples:
 *   field  → source("customer.name")
 *   static → "hello" / 42 / true
 *   none   → (no source)
 */
export function summarizeSource(source: ChainSource): string {
  if (isFieldSource(source)) {
    return `source("${source.path}")`;
  }
  if (isStaticSource(source)) {
    return summarizeStaticValue(source.value);
  }
  return '(no source)';
}

// ---------------------------------------------------------------------------
// Operand summary (for condition predicates)
// ---------------------------------------------------------------------------

function summarizeOperand(operand: OperandValue): string {
  switch (operand.kind) {
    case 'currentValue':
      return 'current value';
    case 'field':
      return `source("${operand.path}")`;
    case 'static':
      return summarizeStaticValue(operand.value);
    case 'expression':
      return operand.dsl || '(expression)';
  }
}

// ---------------------------------------------------------------------------
// Operator label
// ---------------------------------------------------------------------------

const OPERATOR_LABELS: Record<string, string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  isTruthy: 'is truthy',
  isFalsy: 'is falsy',
  isNull: 'is null',
  isNotNull: 'is not null',
};

function operatorLabel(op: string): string {
  return OPERATOR_LABELS[op] ?? op;
}

// ---------------------------------------------------------------------------
// Predicate summary
// ---------------------------------------------------------------------------

function summarizePredicate(predicate: Predicate): string {
  const op = operatorLabel(predicate.operator);
  const left = summarizeOperand(predicate.left);
  // Unary operators (isNull, isNotNull, isTruthy, isFalsy) don't show right operand
  const unary = ['isNull', 'isNotNull', 'isTruthy', 'isFalsy'].includes(predicate.operator);
  if (unary) {
    return `${left} ${op}`;
  }
  const right = summarizeOperand(predicate.right);
  return `${left} ${op} ${right}`;
}

// ---------------------------------------------------------------------------
// Condition clause summary
// ---------------------------------------------------------------------------

function summarizeClause(clause: ConditionClause): string {
  if (clause.predicates.length === 0) return '(empty condition)';
  if (clause.predicates.length === 1) {
    return summarizePredicate(clause.predicates[0]!);
  }
  // Multiple predicates: AND-combined
  return clause.predicates.map(summarizePredicate).join(' AND ');
}

// ---------------------------------------------------------------------------
// Chain summary (for branch summaries inside conditions/value maps)
// ---------------------------------------------------------------------------

/**
 * Returns a short summary of a chain's output.
 * For simple chains (source only, no steps), returns the source summary.
 * For chains with steps, returns the last step's summary.
 */
export function summarizeChain(chain: ChainState): string {
  if (chain.steps.length === 0) {
    return summarizeSource(chain.source);
  }
  const lastStep = chain.steps[chain.steps.length - 1]!;
  return summarizeStep(lastStep);
}

// ---------------------------------------------------------------------------
// Step summary
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable summary string for a single chain step.
 *
 * Truncated at ~80 characters with an ellipsis.
 */
export function summarizeStep(step: ChainStep): string {
  if (isFS039TransformStep(step)) {
    return truncate(summarizeTransformStep(step));
  }
  if (isFS039ConditionStep(step)) {
    return truncate(summarizeConditionStep(step));
  }
  if (isFS039ValueMapStep(step)) {
    return truncate(summarizeValueMapStep(step));
  }
  return '(unknown step)';
}

// ---------------------------------------------------------------------------
// Transform step summary
// ---------------------------------------------------------------------------

function summarizeTransformStep(step: FS039TransformStep): string {
  if (!step.functionName) return '(no function selected)';

  // Build args summary from additional args (beyond implicit first)
  if (step.args.length === 0) {
    return `${step.functionName}()`;
  }

  const argSummaries = step.args.map((arg) => {
    if (arg.mode === 'literal') {
      return `"${arg.value}"`;
    }
    if (arg.mode === 'source') return `source("${arg.path}")`;
    return '…';
  });

  return `${step.functionName}(${argSummaries.join(', ')})`;
}

// ---------------------------------------------------------------------------
// Condition step summary
// ---------------------------------------------------------------------------

function summarizeConditionStep(step: FS039ConditionStep): string {
  const ifClause = step.conditions[0];
  if (!ifClause) return 'If (empty condition)';

  const predicateSummary = summarizeClause(ifClause);
  const thenSummary = summarizeChain(ifClause.thenBranch);
  const elseSummary = summarizeChain(step.elseBranch);

  const elseIfCount = step.conditions.length - 1;
  if (elseIfCount > 0) {
    return `If ${predicateSummary} then ${thenSummary} (+${elseIfCount} else-if) else ${elseSummary}`;
  }

  return `If ${predicateSummary} then ${thenSummary} else ${elseSummary}`;
}

// ---------------------------------------------------------------------------
// Value map step summary
// ---------------------------------------------------------------------------

function summarizeValueMapStep(step: FS039ValueMapStep): string {
  const n = step.mappings.length;
  const defaultSummary = summarizeChain(step.defaultValue);
  return `Map ${n} ${n === 1 ? 'value' : 'values'}, default: ${defaultSummary}`;
}
