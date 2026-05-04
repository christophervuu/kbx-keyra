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
  readonly kind: 'source' | 'static' | 'expression';
  readonly value: string;
}

export type ComparisonOperator =
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
  | { readonly kind: 'static'; readonly value: string }
  | { readonly kind: 'source'; readonly value: string }
  | { readonly kind: 'expression'; readonly value: string }
  | { readonly kind: 'conditional'; readonly value: ExpressionBuilderState };

export interface ValueMapEntry {
  readonly whenValue: string;
  readonly mapTo: string;
}

export type FallbackValue =
  | { readonly kind: 'value'; readonly value?: string }
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
