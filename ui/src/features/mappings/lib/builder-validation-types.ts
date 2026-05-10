/**
 * Builder validation model types (FS-040 T-01).
 *
 * These types represent the combined two-level validation state for the
 * Builder panel: structural completeness (Builder state inspection) and
 * output type compatibility (engine AST inference).
 */

// ---------------------------------------------------------------------------
// Issue types
// ---------------------------------------------------------------------------

/**
 * A single structural validation issue.
 * Structural issues are always blocking (severity: 'error').
 */
export interface BuilderValidationIssue {
  /** Stable key identifying the issue category (e.g. 'missing_source', 'incomplete_transform') */
  readonly key: string;
  /** BA-friendly message suitable for display in the feedback area */
  readonly message: string;
  /** Structural issues are always blocking errors */
  readonly severity: 'error';
}

/**
 * Describes an output type mismatch between the expression's inferred type
 * and the target field's expected schema type.
 */
export interface OutputTypeMismatch {
  /** The type inferred from the expression AST */
  readonly inferredType: string;
  /** The type expected by the target field schema */
  readonly targetType: string;
  /** BA-friendly message for display near the Result row */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Combined validation state
// ---------------------------------------------------------------------------

/**
 * The combined validation state returned by `useBuilderValidation`.
 *
 * Consumers use this to:
 * - Render validation badges in BuilderFeedbackArea (T-02)
 * - Gate the Apply and Save buttons (T-03)
 */
export interface BuilderValidationState {
  /**
   * True when the Builder state is structurally complete for the current mode.
   * Always true in Editor mode (structural validation is not applicable).
   */
  readonly structureValid: boolean;

  /**
   * All structural issues found in the current Builder state.
   * Empty when structureValid is true or when in Editor mode.
   */
  readonly structureIssues: readonly BuilderValidationIssue[];

  /**
   * True when the expression's inferred output type is compatible with the
   * target field's schema type, or when inference is uncertain (undefined).
   * True when no expression exists or parse failed.
   */
  readonly outputTypeValid: boolean;

  /**
   * Describes the output type mismatch when outputTypeValid is false.
   * Null when there is no mismatch or inference was uncertain.
   */
  readonly outputTypeMismatch: OutputTypeMismatch | null;

  /**
   * True when the expression can be applied (saved locally as a draft rule).
   *
   * Derivation:
   *   - Builder mode: structureValid && isParseValid && expression.trim().length > 0
   *   - Editor mode:  isParseValid && expression.trim().length > 0
   */
  readonly canApply: boolean;

  /**
   * True when the expression can be saved (persisted to the adapter).
   *
   * Derivation: canApply && outputTypeValid
   *
   * Output type mismatches block Save but not Apply — drafts can be
   * temporarily wrong-typed while the user refines a transform chain.
   */
  readonly canSave: boolean;
}
