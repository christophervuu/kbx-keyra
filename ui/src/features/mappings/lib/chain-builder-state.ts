/**
 * chain-builder-state.ts — FS-038
 *
 * Type system for the redesigned chain-based Builder panel.
 *
 * This file is intentionally separate from expression-builder-state.ts.
 * The legacy ExpressionBuilderState types remain in that file for backward
 * compatibility during migration. This file defines the new model only.
 *
 * Key design decisions (FS-038 Rev 2):
 *   - Q4: New file, not extending expression-builder-state.ts
 *   - Q1/Q6: ConditionLogicStep left operand defaults to current accumulated value
 *   - Q5: Post-condition and post-value-map transform steps are structurally supported
 *
 * Reused from expression-builder-state.ts (FS-029/FS-030):
 *   - ArgumentSlot — fits the chain model's additional-args pattern unchanged
 *   - StaticValue — same literal value model
 *   - ComparisonOperator — same operator set
 *   - ConditionGroup / ConditionRow — same compound condition structure
 *   - ValueMapEntry — same key-value mapping row shape
 */

// Re-export shared types that the chain model reuses directly.
// Consumers of chain-builder-state.ts can import these from here
// rather than reaching into expression-builder-state.ts.
export type {
  ArgumentSlot,
  StaticValue,
  ComparisonOperator,
  ConditionGroup,
  ConditionRow,
  ValueMapEntry,
} from './expression-builder-state';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * The three top-level entry points for the chain builder.
 *
 * - 'source'   — value derived from a source schema field (default, most prominent)
 * - 'static'   — value is a literal constant
 * - 'external' — value from an external source (future; placeholder only in FS-038)
 */
export type BuilderEntryType = 'source' | 'static' | 'external';

// ---------------------------------------------------------------------------
// Chain branch — used in condition then/else and value map default
// ---------------------------------------------------------------------------

/**
 * A branch value in a condition (then/else) or value map default.
 *
 * Intentionally simpler than the legacy BranchValue — no recursive
 * conditionals within branches (per the inline editing constraint).
 *
 * - 'static'     — a literal value (string, number, boolean, null)
 * - 'source'     — a source field reference with optional transform chain
 * - 'expression' — a raw DSL string (fallback for complex expressions)
 */
export type ChainBranch =
  | { readonly kind: 'static'; readonly value: StaticValueBranch }
  | { readonly kind: 'source'; readonly path: string; readonly steps: readonly TransformLogicStep[] }
  | { readonly kind: 'expression'; readonly raw: string };

/**
 * A static literal value used in a branch.
 * Mirrors StaticValue but is defined here to avoid a circular import
 * when ChainBranch is used before StaticValue is resolved.
 */
export type StaticValueBranch =
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'null'; readonly value?: null };

// ---------------------------------------------------------------------------
// Logic steps
// ---------------------------------------------------------------------------

/**
 * A transform step in the chain.
 *
 * The current accumulated value is the implicit first argument.
 * `args` holds any additional arguments beyond that implicit first.
 *
 * For unary transforms (upper, lower, trim): args is empty.
 * For multi-param transforms (multiply, concat): args holds the extra params.
 */
export interface TransformLogicStep {
  readonly kind: 'transform';
  readonly functionName: string;
  /**
   * Additional argument slots beyond the implicit first argument (current value).
   * Reuses ArgumentSlot from FS-029/FS-030 — same slot model.
   */
  readonly args: readonly ArgumentSlotRef[];
}

/**
 * An argument slot for a transform step's additional parameters.
 *
 * Uses the same discriminated union as ArgumentSlot from expression-builder-state.ts
 * but is defined here as a local alias to keep this file self-contained for
 * the common cases. The full ArgumentSlot type (with nested expression nodes)
 * is imported from expression-builder-state.ts when needed.
 *
 * For the chain model, the common cases are:
 *   - 'source'  — a source field reference
 *   - 'literal' — a raw literal value string
 */
export type ArgumentSlotRef =
  | { readonly mode: 'source'; readonly path: string }
  | { readonly mode: 'literal'; readonly value: string };

/**
 * A condition step in the chain.
 *
 * Wraps the accumulated expression in an if() call.
 *
 * Left operand semantics (FS-038 Q1/Q6):
 *   - Defaults to the current accumulated value (shown explicitly in UI)
 *   - `useCurrentValue: true` means the left operand IS the accumulated expression
 *   - `useCurrentValue: false` means the user has switched to a custom operand
 *   - A "Change input" affordance in the UI toggles this
 *
 * Both then and else branches are required (else is always present).
 */
export interface ConditionLogicStep {
  readonly kind: 'condition';
  /**
   * When true, the left operand of the IF clause is the current accumulated
   * chain value (the default). When false, `customLeftOperand` is used.
   */
  readonly useCurrentValue: boolean;
  /**
   * Custom left operand when useCurrentValue is false.
   * Undefined when useCurrentValue is true.
   */
  readonly customLeftOperand?: ConditionOperand;
  readonly operator: ConditionOperatorType;
  readonly rightOperand: ConditionOperand;
  /** Then branch — required, must be non-empty for Apply to be enabled. */
  readonly thenBranch: ChainBranch;
  /** Else branch — required, always present, must be non-empty for Apply. */
  readonly elseBranch: ChainBranch;
  /**
   * Optional else-if chain. Each entry is a nested condition that appears
   * in the else slot of the previous condition (up to 5 levels).
   */
  readonly elseIfSteps?: readonly ElseIfStep[];
}

/**
 * A single else-if branch (nested condition in the else slot).
 */
export interface ElseIfStep {
  readonly useCurrentValue: boolean;
  readonly customLeftOperand?: ConditionOperand;
  readonly operator: ConditionOperatorType;
  readonly rightOperand: ConditionOperand;
  readonly thenBranch: ChainBranch;
}

/**
 * An operand in a condition (left or right side of the comparison).
 */
export type ConditionOperand =
  | { readonly kind: 'currentValue' }
  | { readonly kind: 'source'; readonly path: string }
  | { readonly kind: 'literal'; readonly value: string };

/**
 * Comparison operators available in condition steps.
 * Mirrors ComparisonOperator from expression-builder-state.ts.
 */
export type ConditionOperatorType =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'isNull'
  | 'isNotNull'
  | 'isTruthy'
  | 'isFalsy';

/**
 * A value map step in the chain.
 *
 * Wraps the accumulated expression in a valueMap() call.
 * The accumulated value is the lookup key.
 *
 * Default case is required — always present.
 */
export interface ValueMapLogicStep {
  readonly kind: 'valueMap';
  /** Ordered list of input→output mapping rows. */
  readonly mappings: readonly ChainValueMapEntry[];
  /** Default output — required, must be non-empty for Apply to be enabled. */
  readonly defaultValue: ChainBranch;
}

/**
 * A single row in a value map step.
 */
export interface ChainValueMapEntry {
  /** The input value to match (literal string). */
  readonly whenValue: string;
  /** The output value when matched. */
  readonly outputValue: ChainBranch;
}

/**
 * The discriminated union of all logic step kinds.
 *
 * Chain ordering (FS-038 Q5): any step kind can follow any other.
 * Post-condition and post-value-map transform steps are structurally supported.
 * The output of each step becomes the current value for the next step.
 */
export type LogicStep = TransformLogicStep | ConditionLogicStep | ValueMapLogicStep;

// ---------------------------------------------------------------------------
// Top-level chain builder state
// ---------------------------------------------------------------------------

/**
 * The top-level state for the redesigned chain-based Builder panel (FS-038).
 *
 * Replaces ExpressionBuilderState as the primary builder model.
 * ExpressionBuilderState is retained in expression-builder-state.ts for
 * backward compatibility during migration.
 */
export interface ChainBuilderState {
  /** Which entry point is active. */
  readonly entryType: BuilderEntryType;

  // Source entry fields
  /** The selected source field path. Defined when entryType === 'source'. */
  readonly sourcePath?: string;

  // Static entry fields
  /** The literal value. Defined when entryType === 'static'. */
  readonly staticValue?: StaticValueBranch;

  /**
   * The ordered chain of logic steps applied to the base value.
   * Empty for direct copy (source) or bare static value.
   * Each step operates on the output of the previous step.
   */
  readonly logicSteps: readonly LogicStep[];

  /**
   * Index of the currently expanded step in the UI.
   * null means no step is expanded (all collapsed).
   */
  readonly expandedStepIndex: number | null;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Creates an empty chain state with Source entry selected and no source path.
 * This is the initial state when a target field is selected with no existing rule.
 */
export function createEmptyChainState(): ChainBuilderState {
  return {
    entryType: 'source',
    sourcePath: undefined,
    staticValue: undefined,
    logicSteps: [],
    expandedStepIndex: null,
  };
}

/**
 * Creates a chain state for a direct source copy.
 * This is the complete state for the most common mapping pattern.
 * AE-01: source("source.firstName")
 */
export function createSourceCopyState(path: string): ChainBuilderState {
  return {
    entryType: 'source',
    sourcePath: path,
    staticValue: undefined,
    logicSteps: [],
    expandedStepIndex: null,
  };
}

/**
 * Creates a chain state for a static literal value.
 * AE-02: "WEB", 42, true, null
 */
export function createStaticState(value?: StaticValueBranch): ChainBuilderState {
  return {
    entryType: 'static',
    sourcePath: undefined,
    staticValue: value,
    logicSteps: [],
    expandedStepIndex: null,
  };
}

/**
 * Creates a default empty transform step (no function selected yet).
 * Used when the user clicks "+ Add logic" → "Transformation" before
 * selecting a function from the picker.
 */
export function createEmptyTransformStep(): TransformLogicStep {
  return {
    kind: 'transform',
    functionName: '',
    args: [],
  };
}

/**
 * Creates a transform step with the given function name and no additional args.
 */
export function createTransformStep(
  functionName: string,
  args: readonly ArgumentSlotRef[] = [],
): TransformLogicStep {
  return { kind: 'transform', functionName, args };
}

/**
 * Creates a default empty condition step.
 * Left operand defaults to current value (useCurrentValue: true).
 * Both then and else branches start empty (expression kind with empty raw).
 */
export function createEmptyConditionStep(): ConditionLogicStep {
  return {
    kind: 'condition',
    useCurrentValue: true,
    customLeftOperand: undefined,
    operator: 'eq',
    rightOperand: { kind: 'literal', value: '' },
    thenBranch: { kind: 'expression', raw: '' },
    elseBranch: { kind: 'expression', raw: '' },
    elseIfSteps: [],
  };
}

/**
 * Creates a default empty value map step.
 * Starts with one empty mapping row and an empty default.
 */
export function createEmptyValueMapStep(): ValueMapLogicStep {
  return {
    kind: 'valueMap',
    mappings: [{ whenValue: '', outputValue: { kind: 'expression', raw: '' } }],
    defaultValue: { kind: 'expression', raw: '' },
  };
}

// ---------------------------------------------------------------------------
// Completeness validation
// ---------------------------------------------------------------------------

/**
 * Returns true when the chain state is complete enough to enable the Apply button.
 *
 * Completeness rules:
 *   - source entry: sourcePath must be non-empty
 *   - static entry: staticValue must be defined
 *   - external entry: always incomplete (placeholder only)
 *   - all logic steps must pass their own completeness checks
 */
export function isChainComplete(state: ChainBuilderState): boolean {
  // Check base value
  if (!isBaseComplete(state)) return false;

  // Check all logic steps
  return state.logicSteps.every(isLogicStepComplete);
}

function isBaseComplete(state: ChainBuilderState): boolean {
  switch (state.entryType) {
    case 'source':
      return typeof state.sourcePath === 'string' && state.sourcePath.trim().length > 0;
    case 'static':
      return state.staticValue !== undefined;
    case 'external':
      return false; // placeholder — always incomplete
  }
}

function isLogicStepComplete(step: LogicStep): boolean {
  switch (step.kind) {
    case 'transform':
      return isTransformStepComplete(step);
    case 'condition':
      return isConditionStepComplete(step);
    case 'valueMap':
      return isValueMapStepComplete(step);
  }
}

function isTransformStepComplete(step: TransformLogicStep): boolean {
  // Must have a function name selected
  if (!step.functionName || step.functionName.trim().length === 0) return false;
  // All literal args must be non-empty
  return step.args.every((arg) => {
    if (arg.mode === 'literal') return arg.value.trim().length > 0;
    if (arg.mode === 'source') return arg.path.trim().length > 0;
    return true;
  });
}

function isConditionStepComplete(step: ConditionLogicStep): boolean {
  // Right operand must be non-empty
  if (!isConditionOperandComplete(step.rightOperand)) return false;
  // Custom left operand must be complete when not using current value
  if (!step.useCurrentValue) {
    if (!step.customLeftOperand || !isConditionOperandComplete(step.customLeftOperand)) {
      return false;
    }
  }
  // Both branches must be non-empty
  if (!isChainBranchComplete(step.thenBranch)) return false;
  if (!isChainBranchComplete(step.elseBranch)) return false;
  // All else-if steps must be complete
  if (step.elseIfSteps) {
    for (const elseIf of step.elseIfSteps) {
      if (!isElseIfStepComplete(elseIf)) return false;
    }
  }
  return true;
}

function isElseIfStepComplete(step: ElseIfStep): boolean {
  if (!isConditionOperandComplete(step.rightOperand)) return false;
  if (!step.useCurrentValue) {
    if (!step.customLeftOperand || !isConditionOperandComplete(step.customLeftOperand)) {
      return false;
    }
  }
  if (!isChainBranchComplete(step.thenBranch)) return false;
  return true;
}

function isConditionOperandComplete(operand: ConditionOperand): boolean {
  switch (operand.kind) {
    case 'currentValue':
      return true;
    case 'source':
      return operand.path.trim().length > 0;
    case 'literal':
      return operand.value.trim().length > 0;
  }
}

function isValueMapStepComplete(step: ValueMapLogicStep): boolean {
  // Must have at least one mapping row
  if (step.mappings.length === 0) return false;
  // All mapping rows must have a non-empty whenValue
  for (const mapping of step.mappings) {
    if (mapping.whenValue.trim().length === 0) return false;
    if (!isChainBranchComplete(mapping.outputValue)) return false;
  }
  // Default must be non-empty
  return isChainBranchComplete(step.defaultValue);
}

function isChainBranchComplete(branch: ChainBranch): boolean {
  switch (branch.kind) {
    case 'static':
      return branch.value !== undefined;
    case 'source':
      return branch.path.trim().length > 0;
    case 'expression':
      return branch.raw.trim().length > 0;
  }
}

// ---------------------------------------------------------------------------
// Step summary generation
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable one-line summary of a logic step.
 * Used in the collapsed step view.
 *
 * Examples:
 *   TransformLogicStep { functionName: 'upper', args: [] }
 *     → "upper"
 *   TransformLogicStep { functionName: 'multiply', args: [{ mode: 'literal', value: '100' }] }
 *     → "multiply by 100"
 *   ConditionLogicStep { operator: 'eq', rightOperand: { kind: 'literal', value: '"premium"' } }
 *     → "if current value = \"premium\""
 *   ValueMapLogicStep { mappings: [{ whenValue: 'A', ... }, { whenValue: 'B', ... }], ... }
 *     → "map: A → ..., B → ... (default: ...)"
 */
export function summarizeLogicStep(step: LogicStep): string {
  switch (step.kind) {
    case 'transform':
      return summarizeTransformStep(step);
    case 'condition':
      return summarizeConditionStep(step);
    case 'valueMap':
      return summarizeValueMapStep(step);
  }
}

function summarizeTransformStep(step: TransformLogicStep): string {
  if (!step.functionName) return 'Transform (not configured)';
  if (step.args.length === 0) return step.functionName;
  const argSummary = step.args
    .map((arg) => {
      if (arg.mode === 'literal') return arg.value || '…';
      if (arg.mode === 'source') return arg.path || '…';
      return '…';
    })
    .join(', ');
  return `${step.functionName}(${argSummary})`;
}

function summarizeConditionStep(step: ConditionLogicStep): string {
  const left = step.useCurrentValue ? 'current value' : summarizeOperand(step.customLeftOperand);
  const op = summarizeOperator(step.operator);
  const right = summarizeOperand(step.rightOperand);
  const then = summarizeBranch(step.thenBranch);
  const els = summarizeBranch(step.elseBranch);
  return `if ${left} ${op} ${right} → ${then} else ${els}`;
}

function summarizeValueMapStep(step: ValueMapLogicStep): string {
  const MAX_SHOWN = 2;
  const shown = step.mappings.slice(0, MAX_SHOWN);
  const rest = step.mappings.length - MAX_SHOWN;
  const pairs = shown.map((m) => `${m.whenValue || '…'} → ${summarizeBranch(m.outputValue)}`);
  const suffix = rest > 0 ? `, +${rest} more` : '';
  const def = summarizeBranch(step.defaultValue);
  return `map: ${pairs.join(', ')}${suffix} (default: ${def})`;
}

function summarizeOperand(operand: ConditionOperand | undefined): string {
  if (!operand) return '…';
  switch (operand.kind) {
    case 'currentValue':
      return 'current value';
    case 'source':
      return operand.path || '…';
    case 'literal':
      return operand.value || '…';
  }
}

function summarizeOperator(op: ConditionOperatorType): string {
  const labels: Record<ConditionOperatorType, string> = {
    eq: '=',
    neq: '≠',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
    contains: 'contains',
    startsWith: 'starts with',
    isNull: 'is null',
    isNotNull: 'is not null',
    isTruthy: 'is truthy',
    isFalsy: 'is falsy',
  };
  return labels[op] ?? op;
}

function summarizeBranch(branch: ChainBranch): string {
  switch (branch.kind) {
    case 'static': {
      const v = branch.value;
      if (v.type === 'string') return `"${v.value}"`;
      if (v.type === 'null') return 'null';
      return String(v.value);
    }
    case 'source':
      return branch.path || '…';
    case 'expression':
      return branch.raw ? truncate(branch.raw, 20) : '…';
  }
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isTransformStep(step: LogicStep): step is TransformLogicStep {
  return step.kind === 'transform';
}

export function isConditionStep(step: LogicStep): step is ConditionLogicStep {
  return step.kind === 'condition';
}

export function isValueMapStep(step: LogicStep): step is ValueMapLogicStep {
  return step.kind === 'valueMap';
}

export function isStaticBranch(
  branch: ChainBranch,
): branch is { kind: 'static'; value: StaticValueBranch } {
  return branch.kind === 'static';
}

export function isSourceBranch(
  branch: ChainBranch,
): branch is { kind: 'source'; path: string; steps: readonly TransformLogicStep[] } {
  return branch.kind === 'source';
}

export function isExpressionBranch(
  branch: ChainBranch,
): branch is { kind: 'expression'; raw: string } {
  return branch.kind === 'expression';
}
