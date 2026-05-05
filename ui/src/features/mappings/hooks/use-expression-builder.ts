import { useCallback, useEffect, useRef, useState } from 'react';

import type { ParseResult } from '@/lib/engine';
import type { MappingRule, ParsedSchema } from '@/lib/types/domain';
import { decomposeExpression as decomposeExpressionNew } from '../lib/pipeline-decomposer';
import type { ExpressionBuilderState } from '../lib/expression-builder-state';
// Keep old decomposer import for canDecompose (backward compat with ExpressionBuilderPanel)
import { decomposeExpression } from '../lib/ast-decomposer';
import type { BuilderState } from '../lib/expression-generator';
import { useDslValidation } from './use-dsl-validation';
import type { ErrorDecoration } from './use-dsl-validation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExpressionBuilderMode = 'builder' | 'editor';

export type BuilderStep = 'source' | 'transform' | 'arguments' | 'preview';

export interface ExpressionBuilderOptions {
  readonly selectedRuleIndex: number | null;
  readonly rules: readonly MappingRule[];
  readonly updateRule: (
    index: number,
    rule: Pick<MappingRule, 'target' | 'expression' | 'description'>,
  ) => void;
  readonly parsedSourceSchema: ParsedSchema | null;
}

export interface ExpressionBuilderResult {
  /** Current editing mode */
  readonly mode: ExpressionBuilderMode;
  /**
   * Switch directly to editor mode without decomposition.
   * Builder → Editor: trivial — just show current expression in raw editor.
   */
  readonly switchToEditor: () => void;
  /**
   * Attempt to switch to builder mode by decomposing the current expression.
   * If decomposition succeeds, switches to builder and provides initialBuilderState.
   * If it fails, sets decompositionWarning and does NOT switch mode.
   */
  readonly switchToBuilder: () => void;
  /**
   * Dismiss the decomposition warning and stay in editor mode.
   * Clears decompositionWarning.
   */
  readonly dismissDecompositionWarning: () => void;
  /**
   * Force-switch to builder mode even though decomposition failed.
   * Clears the warning and sets mode to 'builder' with a blank/partial state.
   */
  readonly forceBuilder: () => void;
  /**
   * Load an expression from an external source (e.g. target field selection).
   *
   * - `null` or empty string → reset to default empty state (Value mode, Builder).
   * - Non-empty string → attempt decomposition:
   *   - Success: set ExpressionBuilderState, switch to Builder mode, clear warning.
   *   - Failure: load raw expression into Editor mode, set decompositionWarning.
   */
  readonly loadExpression: (expression: string | null) => void;
  /** Current expression string in local (working) state */
  readonly expression: string;
  /** Update the local expression string */
  readonly setExpression: (expr: string) => void;
  /** Last parse result for the current expression, or null if expression is empty */
  readonly validationResult: ParseResult | null;
  /** True when the expression is syntactically valid (or empty) */
  readonly isValid: boolean;
  /** True during the 300ms debounce window before the parse result is available */
  readonly isValidating: boolean;
  /** Error/warning decorations for inline underline rendering in the raw editor */
  readonly errorDecorations: readonly ErrorDecoration[];
  /** The currently selected rule, or null if none selected */
  readonly selectedRule: MappingRule | null;
  /**
   * Whether the current expression can be decomposed into guided builder steps.
   * Computed eagerly on each expression change via decomposeExpression().
   */
  readonly canDecompose: boolean;
  /** True when the local expression differs from the committed rule expression due to a parse error */
  readonly hasUnsavedChanges: boolean;
  /**
   * Non-null when the last switchToBuilder() call failed.
   * Contains the user-facing reason from decomposeExpression().
   * Cleared by dismissDecompositionWarning() or forceBuilder().
   */
  readonly decompositionWarning: string | null;
  /**
   * The BuilderState resulting from the last successful decomposition (old decomposer).
   * Populated after a successful switchToBuilder() call.
   * Null otherwise.
   */
  readonly initialBuilderState: BuilderState | null;
  /**
   * The ExpressionBuilderState resulting from the last successful decomposition (new decomposer).
   * Populated after a successful switchToBuilder() call.
   * Null otherwise.
   */
  readonly initialUnifiedBuilderState: ExpressionBuilderState | null;
  /**
   * Immediately flush any pending debounced commit.
   * Used by Ctrl+Enter keyboard shortcut to apply the current expression now.
   */
  readonly flushCommit: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages expression builder state, integrating with the selected mapping rule.
 *
 * Follows the same debounce + typed-result pattern as `useEngineValidation()`:
 * - Accepts nullable inputs
 * - Debounces rule commits at 300ms
 * - Delegates parse + validation to `useDslValidation()` (300ms debounce)
 * - Only commits syntactically valid expressions (empty is always committable)
 * - Isolates integration errors from crashing UI surfaces
 *
 * Mode transition logic (T-08):
 * - switchToEditor(): trivial — set mode to 'editor', expression unchanged
 * - switchToBuilder(): decompose expression; on success → 'builder' + initialBuilderState;
 *   on failure → set decompositionWarning, remain in 'editor'
 * - dismissDecompositionWarning(): clear warning, stay in 'editor'
 * - forceBuilder(): clear warning, force mode to 'builder' (partial/empty state)
 */
export function useExpressionBuilder({
  selectedRuleIndex,
  rules,
  updateRule,
  parsedSourceSchema: _parsedSourceSchema,
}: ExpressionBuilderOptions): ExpressionBuilderResult {
  const selectedRule = selectedRuleIndex !== null ? (rules[selectedRuleIndex] ?? null) : null;

  const [mode, setMode] = useState<ExpressionBuilderMode>('editor');
  const [expression, setExpressionLocal] = useState<string>(selectedRule?.expression ?? '');
  const [decompositionWarning, setDecompositionWarning] = useState<string | null>(null);
  const [initialBuilderState, setInitialBuilderState] = useState<BuilderState | null>(null);
  const [initialUnifiedBuilderState, setInitialUnifiedBuilderState] = useState<ExpressionBuilderState | null>(null);

  // Track what is currently committed to the rule (to detect unsaved changes)
  const committedExpressionRef = useRef<string>(selectedRule?.expression ?? '');

  // Commit timer ref
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Validation — delegated to useDslValidation (debounced 300ms, engine parse)
  // -------------------------------------------------------------------------
  const {
    parseResult: validationResult,
    isValid,
    isValidating,
    errorDecorations,
  } = useDslValidation(expression);

  // -------------------------------------------------------------------------
  // Core loadExpression logic (shared by the effect below and the public API)
  // -------------------------------------------------------------------------

  /**
   * Internal helper: decompose `expr` and update all relevant state atoms.
   * Does NOT touch committedExpressionRef — callers manage that.
   */
  const applyLoadExpression = useCallback((expr: string | null) => {
    const normalized = expr ?? '';
    setExpressionLocal(normalized);

    if (!normalized) {
      // Empty / unmapped → reset to default empty state
      setDecompositionWarning(null);
      setInitialBuilderState(null);
      setInitialUnifiedBuilderState(null);
      setMode('builder');
      return;
    }

    // Attempt decomposition with the new decomposer (FS-023)
    const newResult = decomposeExpressionNew(normalized);
    if (newResult.success) {
      setInitialUnifiedBuilderState(newResult.state);
      setInitialBuilderState(null);
      setDecompositionWarning(null);
      setMode('builder');
      return;
    }

    // Fall back to old decomposer for backward compat
    const oldResult = decomposeExpression(normalized);
    if (oldResult.success && oldResult.builderState) {
      setInitialBuilderState(oldResult.builderState);
      setInitialUnifiedBuilderState(null);
      setDecompositionWarning(null);
      setMode('builder');
      return;
    }

    // Decomposition failed → Editor mode with warning
    setInitialBuilderState(null);
    setInitialUnifiedBuilderState(null);
    setDecompositionWarning(
      newResult.reason ?? oldResult.reason ?? 'Expression cannot be loaded into the guided builder.',
    );
    setMode('editor');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Load expression from selected rule when the selection changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    const incoming = selectedRule?.expression ?? '';
    committedExpressionRef.current = incoming;

    // Cancel any pending commit debounce from the previous selection
    if (commitTimerRef.current !== null) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }

    // Hydrate builder state from the incoming expression
    applyLoadExpression(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRuleIndex]);

  // -------------------------------------------------------------------------
  // Debounced commit to rule — only for valid (or empty) expressions
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (commitTimerRef.current !== null) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }

    if (selectedRuleIndex === null || selectedRule === null) {
      return;
    }

    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;

      // Empty expression is always committable
      const canCommit = expression === '' || isValid;

      if (!canCommit) {
        return;
      }

      if (expression === committedExpressionRef.current) {
        return;
      }

      committedExpressionRef.current = expression;
      updateRule(selectedRuleIndex, {
        target: selectedRule.target,
        expression,
        ...(selectedRule.description !== undefined && { description: selectedRule.description }),
      });
    }, DEBOUNCE_MS);

    return () => {
      if (commitTimerRef.current !== null) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
    };
  }, [expression, isValid, selectedRuleIndex, selectedRule, updateRule]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const canDecompose = decomposeExpression(expression).success;

  const hasUnsavedChanges =
    selectedRule !== null &&
    expression !== committedExpressionRef.current &&
    !isValid;

  // -------------------------------------------------------------------------
  // Mode transition handlers (T-08)
  // -------------------------------------------------------------------------

  /**
   * Builder → Editor: trivial — just switch mode, expression stays unchanged.
   * Per AE-06 the raw editor receives the current expression immediately.
   */
  const switchToEditor = useCallback(() => {
    setDecompositionWarning(null);
    setMode('editor');
  }, []);

  /**
   * Editor → Builder: decompose the current expression.
   * On success: switch to builder, provide initialBuilderState.
   * On failure: set decompositionWarning, stay in editor.
   */
  const switchToBuilder = useCallback(() => {
    // Try new decomposer first (FS-023)
    const newResult = decomposeExpressionNew(expression);
    if (newResult.success) {
      setInitialUnifiedBuilderState(newResult.state);
      setInitialBuilderState(null);
      setDecompositionWarning(null);
      setMode('builder');
      return;
    }
    // Fall back to old decomposer for backward compat
    const result = decomposeExpression(expression);
    if (result.success && result.builderState) {
      setInitialBuilderState(result.builderState);
      setInitialUnifiedBuilderState(null);
      setDecompositionWarning(null);
      setMode('builder');
    } else {
      setDecompositionWarning(newResult.reason ?? result.reason ?? 'Expression cannot be loaded into the guided builder.');
      // Stay in editor — do NOT change mode
    }
  }, [expression]);

  /** Dismiss the decomposition warning, stay in editor. */
  const dismissDecompositionWarning = useCallback(() => {
    setDecompositionWarning(null);
  }, []);

  /**
   * Force-switch to builder even when decomposition failed.
   * Clears warning, switches mode (builder shows blank/partial state).
   */
  const forceBuilder = useCallback(() => {
    setDecompositionWarning(null);
    setInitialBuilderState(null);
    setInitialUnifiedBuilderState(null);
    setMode('builder');
  }, []);

  /**
   * Load an expression from an external source (e.g. target field selection).
   * Null or empty → reset to default empty state.
   * Non-empty → decompose; on success → Builder mode; on failure → Editor mode + warning.
   */
  const loadExpression = useCallback((expression: string | null) => {
    applyLoadExpression(expression);
  }, [applyLoadExpression]);

  const setExpression = useCallback((expr: string) => {
    setExpressionLocal(expr);
  }, []);

  /**
   * Immediately flush any pending debounced commit without waiting for the timer.
   * Runs the same commit logic as the debounce handler.
   */
  const flushCommit = useCallback(() => {
    if (commitTimerRef.current !== null) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    if (selectedRuleIndex === null || selectedRule === null) return;
    const canCommit = expression === '' || isValid;
    if (!canCommit) return;
    if (expression === committedExpressionRef.current) return;
    committedExpressionRef.current = expression;
    updateRule(selectedRuleIndex, {
      target: selectedRule.target,
      expression,
      ...(selectedRule.description !== undefined && { description: selectedRule.description }),
    });
  }, [selectedRuleIndex, selectedRule, expression, isValid, updateRule]);

  return {
    mode,
    switchToEditor,
    switchToBuilder,
    dismissDecompositionWarning,
    forceBuilder,
    loadExpression,
    expression,
    setExpression,
    validationResult,
    isValid,
    isValidating,
    errorDecorations,
    selectedRule,
    canDecompose,
    hasUnsavedChanges,
    decompositionWarning,
    initialBuilderState,
    initialUnifiedBuilderState,
    flushCommit,
  };
}
