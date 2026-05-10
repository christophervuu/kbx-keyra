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
// FS-038 chain builder state
export {
  createEmptyChainState,
  createSourceCopyState,
  createStaticState,
  createEmptyTransformStep,
  createTransformStep,
  createEmptyConditionStep,
  createEmptyValueMapStep,
  isChainComplete,
  summarizeLogicStep,
  isTransformStep,
  isConditionStep,
  isValueMapStep,
  isStaticBranch,
  isSourceBranch,
  isExpressionBranch,
  // FS-039 chain model
  createEmptyChain,
  createFieldSourceChain,
  createStaticSourceChain,
  createEmptyPredicate,
  createEmptyConditionClause,
  createEmptyFS039ConditionStep,
  createEmptyFS039ValueMapStep,
  isFS039ConditionStep,
  isFS039ValueMapStep,
  isFS039TransformStep,
  isFieldSource,
  isStaticSource,
  isNoneSource,
  isCurrentValueOperand,
  isFieldOperand,
  isStaticOperand,
  isExpressionOperand,
} from './chain-builder-state';
export type {
  BuilderEntryType,
  ChainBranch,
  StaticValueBranch,
  TransformLogicStep,
  ArgumentSlotRef,
  ConditionLogicStep,
  ElseIfStep,
  ConditionOperand,
  ConditionOperatorType,
  ValueMapLogicStep,
  ChainValueMapEntry,
  LogicStep,
  ChainBuilderState,
  // FS-039 chain model types
  ChainSource,
  ChainState,
  OperandValue,
  Predicate,
  ConditionClause,
  FS039ConditionStep,
  FS039ValueMapEntry,
  FS039ValueMapStep,
  FS039TransformStep,
  ChainStep,
  DraftRulesMap,
  DraftValidationState,
  DraftFieldState,
} from './chain-builder-state';
// FS-038 chain expression generator
export { generateExpressionFromChain, generateChainExpression } from './chain-expression-generator';
// FS-038 chain decomposer
export { decomposeToChainState, decomposeToChain } from './chain-decomposer';
export type { DecomposeChainResult, DecomposeChainResult039 } from './chain-decomposer';
