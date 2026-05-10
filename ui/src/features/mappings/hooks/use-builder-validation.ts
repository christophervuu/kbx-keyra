/**
 * `useBuilderValidation` — two-level validation orchestrator for the Builder panel.
 * (FS-040 T-01)
 *
 * Performs:
 * 1. Structural validation — synchronous inspection of ExpressionBuilderState by mode.
 *    Checks completeness (missing source, incomplete transforms, missing branches, etc.)
 *    Does not run in Editor mode.
 *
 * 2. Output type validation — infers the expression's output type from the parsed AST
 *    using the engine boundary's inferExpressionType(). Compares against targetType
 *    using the compatibility matrix from the spec. Runs in both Builder and Editor modes.
 *
 * Returns a BuilderValidationState with canApply and canSave booleans for gating.
 */

import { useMemo } from 'react';

import { inferExpressionType } from '@/lib/engine';
import type { ParseResult } from '@/lib/engine';

import type {
  ExpressionBuilderState,
  ValueModeState,
  ConditionalModeState,
  ValueMapModeState,
  ConditionGroup,
  ConditionRow,
  Operand,
} from '../lib/expression-builder-state';
import type {
  BuilderValidationState,
  BuilderValidationIssue,
  OutputTypeMismatch,
} from '../lib/builder-validation-types';

// ---------------------------------------------------------------------------
// Hook inputs
// ---------------------------------------------------------------------------

export interface UseBuilderValidationInput {
  /** Current Builder state (null when in Editor mode or not yet initialized) */
  readonly builderState: ExpressionBuilderState | null;
  /** The current DSL expression string (generated in Builder mode, typed in Editor mode) */
  readonly expression: string;
  /** The target field's schema type (e.g. 'string', 'number', 'boolean') */
  readonly targetType: string;
  /** Current authoring mode */
  readonly mode: 'builder' | 'editor';
  /** Parse result from useDslValidation (null when expression is empty or not yet parsed) */
  readonly parseResult: ParseResult | null;
  /** Whether the expression is syntactically valid (from useDslValidation.isValid) */
  readonly isParseValid: boolean;
}

// ---------------------------------------------------------------------------
// Structural validation — per-mode checks
// ---------------------------------------------------------------------------

function validateValueMode(state: ValueModeState): BuilderValidationIssue[] {
  const issues: BuilderValidationIssue[] = [];

  if (state.inputType === 'source') {
    if (state.sources.length === 0) {
      issues.push({
        key: 'missing_source',
        message: 'Select a source field or enter a static value',
        severity: 'error',
      });
    } else {
      // Check for incomplete transforms (missing required parameters)
      for (const transform of state.transforms) {
        // A transform with any parameter whose value is empty string is considered incomplete
        const hasIncompleteParam = transform.parameters.some(
          (p) => typeof p.value === 'string' && p.value.trim() === '',
        );
        if (hasIncompleteParam) {
          issues.push({
            key: 'incomplete_transform',
            message: `Complete all arguments for ${transform.functionName}`,
            severity: 'error',
          });
          break; // Report first incomplete transform only
        }
      }
    }
  } else {
    // static inputType — check that a static value is provided
    if (state.staticValue === undefined) {
      issues.push({
        key: 'missing_source',
        message: 'Select a source field or enter a static value',
        severity: 'error',
      });
    }
  }

  return issues;
}

function isBranchEmpty(branch: ConditionalModeState['thenBranch']): boolean {
  switch (branch.kind) {
    case 'static':
    case 'source':
    case 'expression':
      return branch.value.trim() === '';
    case 'pipeline':
    case 'conditional':
      // Structured state — always considered non-empty
      return false;
    default:
      return false;
  }
}

function isOperandEmpty(operand: Operand): boolean {
  return operand.value.trim() === '';
}

function hasConditionRows(group: ConditionGroup): boolean {
  return group.conditions.length > 0;
}

function hasIncompleteConditionRow(row: ConditionRow): boolean {
  // Unary operators (isNull, isNotNull, isTruthy, isFalsy) don't need a right operand
  const unaryOperators = new Set(['isNull', 'isNotNull', 'isTruthy', 'isFalsy']);
  if (isOperandEmpty(row.leftOperand)) return true;
  if (!unaryOperators.has(row.comparison) && isOperandEmpty(row.rightOperand)) return true;
  return false;
}

function checkConditionGroupCompleteness(group: ConditionGroup): boolean {
  for (const condition of group.conditions) {
    if ('comparison' in condition) {
      // It's a ConditionRow
      if (hasIncompleteConditionRow(condition)) return false;
    } else {
      // It's a nested ConditionGroup
      if (!checkConditionGroupCompleteness(condition)) return false;
    }
  }
  return true;
}

function validateConditionalMode(state: ConditionalModeState): BuilderValidationIssue[] {
  const issues: BuilderValidationIssue[] = [];

  if (!hasConditionRows(state.condition)) {
    issues.push({
      key: 'missing_condition',
      message: 'Add at least one condition',
      severity: 'error',
    });
  } else if (!checkConditionGroupCompleteness(state.condition)) {
    issues.push({
      key: 'incomplete_condition',
      message: 'Select a value for the left side of the condition',
      severity: 'error',
    });
  }

  // Check then branch
  if (isBranchEmpty(state.thenBranch)) {
    issues.push({
      key: 'missing_then',
      message: 'Provide a value for the THEN branch',
      severity: 'error',
    });
  }

  // Check else branch
  if (isBranchEmpty(state.elseBranch)) {
    issues.push({
      key: 'missing_else',
      message: 'Provide a value for the ELSE branch',
      severity: 'error',
    });
  }

  return issues;
}

function validateValueMapMode(state: ValueMapModeState): BuilderValidationIssue[] {
  const issues: BuilderValidationIssue[] = [];

  if (state.inputSource.trim() === '') {
    issues.push({
      key: 'missing_source',
      message: 'Select a source field for the value map',
      severity: 'error',
    });
  }

  if (state.mappings.length === 0) {
    issues.push({
      key: 'empty_map_rows',
      message: 'Add at least one mapping row',
      severity: 'error',
    });
  }

  // Check for missing default value
  const fallbackEmpty =
    state.fallback.kind === 'value' &&
    (state.fallback.value === undefined || state.fallback.value.trim() === '');

  if (fallbackEmpty) {
    issues.push({
      key: 'missing_default',
      message: 'Provide a default value for unmatched cases',
      severity: 'error',
    });
  }

  return issues;
}

function runStructuralValidation(
  builderState: ExpressionBuilderState,
): BuilderValidationIssue[] {
  switch (builderState.mode) {
    case 'value':
      return validateValueMode(builderState);
    case 'conditional':
      return validateConditionalMode(builderState);
    case 'valueMap':
      return validateValueMapMode(builderState);
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Output type compatibility
// ---------------------------------------------------------------------------

/**
 * Type compatibility matrix (aligned with engine type-compatibility.ts).
 *
 * 'any' / undefined inferred type → no mismatch (cannot prove incompatibility).
 * 'null' actual type → always compatible.
 * Otherwise: exact match required.
 */
function areTypesCompatible(inferredType: string, targetType: string): boolean {
  if (inferredType === 'any' || inferredType === 'null') return true;
  if (targetType === 'any') return true;
  return inferredType === targetType;
}

function checkOutputType(
  parseResult: ParseResult | null,
  targetType: string,
): { outputTypeValid: boolean; outputTypeMismatch: OutputTypeMismatch | null } {
  // No parse result (empty expression or parse failed) → no mismatch
  if (parseResult === null || !parseResult.success || parseResult.ast === null) {
    return { outputTypeValid: true, outputTypeMismatch: null };
  }

  const inferred = inferExpressionType(parseResult.ast);

  // Uncertain inference → no mismatch
  if (inferred === undefined) {
    return { outputTypeValid: true, outputTypeMismatch: null };
  }

  const compatible = areTypesCompatible(inferred, targetType);

  if (compatible) {
    return { outputTypeValid: true, outputTypeMismatch: null };
  }

  return {
    outputTypeValid: false,
    outputTypeMismatch: {
      inferredType: inferred,
      targetType,
      message: `Expression produces ${inferred} but target expects ${targetType}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Validation orchestrator for the Builder panel.
 *
 * Composes structural validation (Builder state inspection) and output type
 * validation (engine AST inference) into a single BuilderValidationState.
 *
 * This hook is synchronous — no debounce, no async. It derives state from
 * its inputs on every render. Callers should memoize inputs where appropriate.
 */
export function useBuilderValidation(
  input: UseBuilderValidationInput,
): BuilderValidationState {
  const { builderState, expression, targetType, mode, parseResult, isParseValid } = input;

  return useMemo((): BuilderValidationState => {
    const trimmedExpression = expression.trim();
    const hasExpression = trimmedExpression.length > 0;

    // --- Structural validation ---
    let structureValid = true;
    let structureIssues: readonly BuilderValidationIssue[] = [];

    if (mode === 'builder' && builderState !== null && hasExpression) {
      const issues = runStructuralValidation(builderState);
      structureIssues = issues;
      structureValid = issues.length === 0;
    }
    // In Editor mode or when expression is empty: structureValid = true, no issues

    // --- Output type validation ---
    const { outputTypeValid, outputTypeMismatch } = checkOutputType(parseResult, targetType);

    // --- Combined gating ---
    // canApply: structural + parse validity + non-empty expression
    const canApply =
      hasExpression &&
      isParseValid &&
      (mode === 'editor' ? true : structureValid);

    // canSave: canApply + output type valid
    const canSave = canApply && outputTypeValid;

    return {
      structureValid,
      structureIssues,
      outputTypeValid,
      outputTypeMismatch,
      canApply,
      canSave,
    };
  }, [builderState, expression, targetType, mode, parseResult, isParseValid]);
}
