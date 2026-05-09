export { inferRuleType } from './infer-rule-type';
export type { RuleTypeLabel } from './infer-rule-type';
export { tokenizeDsl, findMatchingBracket } from './dsl-tokenizer';
export type { DslToken, DslTokenType } from './dsl-tokenizer';
export { detectAutocompleteContext, flattenSchemaPaths, filterSuggestions } from './autocomplete-utils';
export type { AutocompleteContext, SchemaPathEntry } from './autocomplete-utils';
export {
  generateExpression,
  generateObjectTemplate,
  makeSourceArg,
  makeItemArg,
  makeParentArg,
  makeLiteralArg,
  makeNestedArg,
  makeObjectTemplateArg,
} from './expression-generator';
export type { BuilderArgument, BuilderState, ObjectTemplateField } from './expression-generator';
export { decomposeExpression, BUILDER_SUPPORTED_FUNCTIONS } from './ast-decomposer';
export type { DecompositionResult } from './ast-decomposer';
export { computeVersionDiff, generateChangeSummary } from './version-diff';
export type { RuleDiff, ConfigDiff, VersionDiff } from './version-diff';
export type {
  PrimitiveValue,
  SourceSelection,
  TransformParameterValue,
  TransformStep,
  ValueModeState,
  StaticValue,
  Operand,
  ComparisonOperator,
  ConditionRow,
  ConditionGroup,
  ConditionalModeState,
  BranchValue,
  ValueMapEntry,
  FallbackValue,
  ValueMapModeState,
  ExpressionBuilderState,
  // FS-029 Source Card builder types
  ArgumentSlot,
  InlineTransform,
  TransformChainStep,
  ArgumentFormNode,
  DirectCopyState,
  SourceWithTransformState,
  FunctionCallState,
  PendingConnectorState,
  SourceCardValueModeState,
} from './expression-builder-state';
export {
  // FS-029 type guards
  isDirectCopy,
  isSourceWithTransform,
  isFunctionCall,
  isPendingConnector,
  // FS-029 factory functions
  createDirectCopyState,
  createSourceWithTransformState,
  createFunctionCallState,
  createPendingConnectorState,
  // FS-029 slot helpers
  makeSourceSlot,
  makeSourceSlotWithTransform,
  makeLiteralSlot,
  makeExpressionSlot,
  // FS-030 chain factory helpers
  makeChainStep,
  makeSingleStepTransform,
} from './expression-builder-state';
export { generateExpressionFromState } from './pipeline-expression-generator';
export { decomposeExpression as decomposeExpressionFromState } from './pipeline-decomposer';
export type { PipelineDecompositionResult } from './pipeline-decomposer';
export { truncateExpression } from './truncate-expression';
export { suggestSourceFields } from './suggest-source-fields';
export type { SuggestedField, MatchKind } from './suggest-source-fields';
export { generateArrayExpression } from './array-expression-generator';
export type { ArrayBuilderState, ArrayPattern, FieldMapping } from './array-expression-generator';
// FS-030 transform chain utilities
export {
  getChainOutputType,
  getCompatibleChainableTransforms,
  CHAINABLE_TRANSFORMS,
} from './transform-chain-utils';
