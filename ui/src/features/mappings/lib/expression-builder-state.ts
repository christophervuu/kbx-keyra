export type PrimitiveValue = string | number | boolean | null;

export interface SourceSelection {
  readonly path: string;
  readonly type?: string;
}

export interface TransformParameterValue {
  readonly name: string;
  readonly value: PrimitiveValue;
  readonly type: string;
}

export interface TransformStep {
  readonly functionName: string;
  /**
   * Additional parameters beyond the first auto-wired value parameter.
   */
  readonly parameters: readonly TransformParameterValue[];
}

export interface ValueModeState {
  readonly mode: 'value';
  /** Whether the value comes from a source field selection or a static literal. */
  readonly inputType: 'source' | 'static';
  readonly sources: readonly SourceSelection[];
  readonly transforms: readonly TransformStep[];
  readonly staticValue?: StaticValue;
}

export type StaticValue =
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'null'; readonly value?: null };

export interface Operand {
  readonly kind: 'source' | 'static' | 'expression' | 'pipeline';
  readonly value: string;
  /**
   * Structured pipeline state for kind:'pipeline' operands (T-03).
   * Present only when kind === 'pipeline'.
   */
  readonly pipelineState?: ValueModeState;
}

export type ComparisonOperator =
  | 'isTruthy'
  | 'isFalsy'
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'isNull'
  | 'isNotNull';

export interface ConditionRow {
  readonly leftOperand: Operand;
  readonly comparison: ComparisonOperator;
  readonly rightOperand: Operand;
}

export interface ConditionGroup {
  readonly operator: 'and' | 'or';
  readonly conditions: readonly Array<ConditionRow | ConditionGroup>;
}

export interface ConditionalModeState {
  readonly mode: 'conditional';
  readonly condition: ConditionGroup;
  readonly thenBranch: BranchValue;
  readonly elseBranch: BranchValue;
}

export type BranchValue =
  | {
      readonly kind: 'static';
      readonly value: string;
      /** Optional output literal type; defaults to string for backward compatibility. */
      readonly valueType?: StaticValue['type'];
    }
  | { readonly kind: 'source'; readonly value: string }
  | { readonly kind: 'expression'; readonly value: string }
  /**
   * Inline pipeline branch: a Source + Transform chain built via the inline
   * mini-builder (T-03). Holds structured ValueModeState so the UI can
   * re-populate the mini-builder when loading an existing rule.
   */
  | { readonly kind: 'pipeline'; readonly state: ValueModeState }
  | { readonly kind: 'conditional'; readonly value: ExpressionBuilderState };

export interface ValueMapEntry {
  readonly whenValue: string;
  readonly mapTo: string;
  /** Optional output literal type for mapped value; defaults to string. */
  readonly mapToType?: StaticValue['type'];
}

export type FallbackValue =
  | {
      readonly kind: 'value';
      readonly value?: string;
      /** Optional output literal type for fallback value; defaults to string. */
      readonly valueType?: StaticValue['type'];
    }
  | { readonly kind: 'null'; readonly value?: string };

export interface ValueMapModeState {
  readonly mode: 'valueMap';
  readonly inputSource: string;
  readonly mappings: readonly ValueMapEntry[];
  readonly fallback: FallbackValue;
}

export type ExpressionBuilderState =
  | ValueModeState
  | ConditionalModeState
  | ValueMapModeState;

// ---------------------------------------------------------------------------
// Source Card Builder State (FS-029)
//
// Replaces the linear pipeline model (ValueModeState.sources + transforms)
// with a tree-based model that supports:
//   - Direct copy (single source, no transform)
//   - Single source with inline transformation
//   - Multi-input function calls with independently-configured argument slots
//   - Nested transforms within argument slots
//   - Pending connector state (2+ sources awaiting a combining function)
// ---------------------------------------------------------------------------

/**
 * A single argument slot within an ArgumentFormNode or InlineTransform.
 *
 * Discriminated union:
 *   - 'source'     — a source field reference, with an optional inline transform applied to it
 *   - 'literal'    — a freeform string/number/boolean literal value
 *   - 'expression' — a nested ArgumentFormNode (recursive sub-expression)
 */
export type ArgumentSlot =
  | {
      readonly mode: 'source';
      readonly path: string;
      /** Optional inline transform applied to this source (e.g. upper(source("x"))). */
      readonly transform?: InlineTransform;
    }
  | {
      readonly mode: 'literal';
      /** The raw literal value as a string; consumers interpret type from context. */
      readonly value: string;
    }
  | {
      readonly mode: 'expression';
      /** A fully nested function call as an argument. */
      readonly node: ArgumentFormNode;
    };

/**
 * An inline transform applied to a source within an argument slot.
 * Represents a single function wrapping the source, e.g. upper(source("x")).
 * The source itself is the implicit first argument; `args` holds any additional arguments.
 */
export interface InlineTransform {
  readonly functionName: string;
  /**
   * Additional argument slots beyond the implicit source first argument.
   * For unary transforms (upper, lower, trim) this is empty.
   * For multi-param transforms (formatDate, replace) this holds the extra params.
   */
  readonly args: readonly ArgumentSlot[];
}

/**
 * A function call node with an ordered list of argument slots.
 * Used as the top-level state for multi-input functions and as nested
 * sub-expressions within argument slots.
 */
export interface ArgumentFormNode {
  readonly functionName: string;
  readonly slots: readonly ArgumentSlot[];
}

// ---------------------------------------------------------------------------
// Top-level SourceCardValueModeState variants
// ---------------------------------------------------------------------------

/**
 * Direct copy: a single source field with no transformation.
 * Generates: source("path")
 */
export interface DirectCopyState {
  readonly variant: 'directCopy';
  readonly sourcePath: string;
}

/**
 * Single source with an inline transformation applied.
 * Generates: functionName(source("path"), ...additionalArgs)
 */
export interface SourceWithTransformState {
  readonly variant: 'sourceWithTransform';
  readonly sourcePath: string;
  readonly transform: InlineTransform;
}

/**
 * A top-level function call with independently-configured argument slots.
 * Used for multi-input functions (concat, add, coalesce, etc.) and for
 * the transform-first path where no source card wraps the function.
 * Generates: functionName(slot1, slot2, ...)
 */
export interface FunctionCallState {
  readonly variant: 'functionCall';
  readonly node: ArgumentFormNode;
}

/**
 * Transient state: 2+ standalone source cards exist but no combining function
 * has been selected yet. The connector prompt is shown automatically.
 * Does not generate a valid expression until resolved.
 */
export interface PendingConnectorState {
  readonly variant: 'pendingConnector';
  readonly sourcePaths: readonly string[];
}

/**
 * The new top-level Value mode state for the Source Card builder (FS-029).
 * Replaces the linear pipeline model of the legacy ValueModeState.
 */
export type SourceCardValueModeState =
  | DirectCopyState
  | SourceWithTransformState
  | FunctionCallState
  | PendingConnectorState;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isDirectCopy(state: SourceCardValueModeState): state is DirectCopyState {
  return state.variant === 'directCopy';
}

export function isSourceWithTransform(
  state: SourceCardValueModeState,
): state is SourceWithTransformState {
  return state.variant === 'sourceWithTransform';
}

export function isFunctionCall(state: SourceCardValueModeState): state is FunctionCallState {
  return state.variant === 'functionCall';
}

export function isPendingConnector(
  state: SourceCardValueModeState,
): state is PendingConnectorState {
  return state.variant === 'pendingConnector';
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Creates a DirectCopyState for the given source path.
 * AE-01: source("order.customerName")
 */
export function createDirectCopyState(sourcePath: string): DirectCopyState {
  return { variant: 'directCopy', sourcePath };
}

/**
 * Creates a SourceWithTransformState.
 * AE-02: formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD")
 */
export function createSourceWithTransformState(
  sourcePath: string,
  transform: InlineTransform,
): SourceWithTransformState {
  return { variant: 'sourceWithTransform', sourcePath, transform };
}

/**
 * Creates a FunctionCallState with the given function name and initial slots.
 * AE-03: concat(source("firstName"), " ", source("lastName"))
 */
export function createFunctionCallState(
  functionName: string,
  slots: readonly ArgumentSlot[] = [],
): FunctionCallState {
  return { variant: 'functionCall', node: { functionName, slots } };
}

/**
 * Creates a PendingConnectorState for 2+ source paths awaiting a combining function.
 * AE-04: two source cards shown, connector prompt displayed automatically.
 */
export function createPendingConnectorState(
  sourcePaths: readonly string[],
): PendingConnectorState {
  return { variant: 'pendingConnector', sourcePaths };
}

// ---------------------------------------------------------------------------
// Slot factory helpers
// ---------------------------------------------------------------------------

/** Creates a source-mode ArgumentSlot with no inline transform. */
export function makeSourceSlot(path: string): ArgumentSlot {
  return { mode: 'source', path };
}

/** Creates a source-mode ArgumentSlot with an inline transform. */
export function makeSourceSlotWithTransform(path: string, transform: InlineTransform): ArgumentSlot {
  return { mode: 'source', path, transform };
}

/** Creates a literal-mode ArgumentSlot. */
export function makeLiteralSlot(value: string): ArgumentSlot {
  return { mode: 'literal', value };
}

/** Creates an expression-mode ArgumentSlot wrapping a nested ArgumentFormNode. */
export function makeExpressionSlot(node: ArgumentFormNode): ArgumentSlot {
  return { mode: 'expression', node };
}
