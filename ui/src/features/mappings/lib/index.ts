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
export {
  generateArrayExpression,
  generateFilterPredicate,
  generateCrossArrayLookup,
  generateValueEntry,
  generateMergeBranchExpression,
  generateLegacyArrayExpression,
} from './array-expression-generator';
export type {
  // Legacy types — deprecated, will be removed when ArrayMappingBuilder + use-array-builder are replaced
  ArrayPattern,
  FieldMapping,
} from './array-expression-generator';
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
// FS-043 array builder state model
export {
  isCompatibleModeSwitch,
  getModePreservationRules,
  deriveCompletionStatus,
  createEmptyItemTemplate,
  createEmptyItemFieldMapping,
  createEmptyFilterPredicate,
  createEmptyObjectValueEntry,
  createEmptyPrimitiveValueEntry,
  createEmptyMergeBranch,
  createEmptyCrossArrayLookup,
  createCollectionStateForMode,
  createEmptyArrayBuilderState,
  createInitialArrayBuilderState,
  isMapCollectionState,
  isFilterMapCollectionState,
  isBuildFromValuesCollectionState,
  isMergeBranchesCollectionState,
  isCustomExpressionCollectionState,
  isStructuredFilterPredicate,
  isRawFilterPredicate,
  isChainFieldMapping,
  isCrossArrayLookupMapping,
  isEmptyFieldMapping,
  isObjectValueEntry,
  isPrimitiveValueEntry,
} from './array-builder-state';
export type {
  ArrayBuilderMode,
  ArrayBuilderState,
  CollectionState,
  MapCollectionState,
  FilterMapCollectionState,
  BuildFromValuesCollectionState,
  MergeBranchesCollectionState,
  CustomExpressionCollectionState,
  FilterPredicateState,
  StructuredFilterPredicate,
  RawFilterPredicate,
  FilterOperator,
  FilterLeftOperand,
  FilterRightOperand,
  ValueEntry,
  ValueEntryFieldValue,
  MergeBranch,
  ItemTemplateState,
  ItemFieldMapping,
  CrossArrayLookupState,
  CompletionStatus,
  ModeSwitchPreservationRules,
} from './array-builder-state';
// FS-043 array expression decomposer
export { decomposeArrayExpression } from './array-decomposer';
export type { DecomposeArrayResult } from './array-decomposer';
// FS-043 T-11 array validation
export { deriveArrayValidation, getFieldValidationEntries } from './array-validation';
export type { ArrayValidationState, ArrayValidationEntry, ValidationSeverity, ValidationLevel } from './array-validation';
// FS-038 chain expression generator
export { generateExpressionFromChain, generateChainExpression } from './chain-expression-generator';
// FS-038 chain decomposer
export { decomposeToChainState, decomposeToChain } from './chain-decomposer';
export type { DecomposeChainResult, DecomposeChainResult039 } from './chain-decomposer';

// FS-094 smart builder state + generator
export {
  createEmptySmartBuilderDraft,
  createActionParameterDraft,
  updateSmartBuilderExpression,
  undoSmartBuilderExpression,
  resolveOrderedInputIds,
  setSlotScopedInput,
  normalizeActionParameterValues,
  validateActionParameterDraft,
  serializeActionParameterDraft,
  getValidatedActionParameters,
  toSmartBuilderTransformArgsFromParameters,
  toSmartBuilderCompositionPatchFromParameters,
  hydrateSmartBuilderFromExpression,
} from './smart-builder-state';
export type {
  BuilderValueType,
  BuilderSourceKind,
  BuilderArgumentValue,
  BuilderInputTransform,
  BuilderInput,
  BuilderPredicate,
  BuilderConditionClause,
  BuilderValueMapEntry,
  BuilderComposition,
  DraftValidationState as SmartDraftValidationState,
  SmartBuilderActionParameterValidationIssue,
  SmartBuilderActionParameterValidationResult,
  SmartBuilderActionParameterValue,
  SmartBuilderActionParameterDraft,
  SmartBuilderDraft,
  SmartBuilderHydrationResult,
} from './smart-builder-state';
export { generateSmartBuilderExpression } from './smart-builder-expression-generator';
export {
  SMART_BUILDER_ACTION_CATALOG,
  ALL_REGISTERED_DSL_FUNCTIONS,
  UNSUPPORTED_DSL_FUNCTIONS,
  findSmartBuilderActionById,
  getSmartBuilderActionParameters,
} from './smart-builder-action-catalog';
export type {
  SmartBuilderActionCategory,
  SmartBuilderActionApplicability,
  SmartBuilderActionConstraint,
  SmartBuilderActionParameterKind,
  SmartBuilderActionParameterOption,
  SmartBuilderActionParameterConstraint,
  SmartBuilderActionParameterDefinition,
  SmartBuilderActionCatalogEntry,
} from './smart-builder-action-catalog';
export {
  resolveSmartBuilderActions,
  resolveSmartBuilderActionsFromDraft,
} from './smart-builder-action-resolver';
export type {
  SmartBuilderActionContext,
  SmartBuilderActionAvailability,
  ResolvedSmartBuilderAction,
} from './smart-builder-action-resolver';
export {
  buildSmartBuilderDslCoverage,
  findUnregisteredFunctionsInActionCatalog,
} from './smart-builder-dsl-coverage';
export type {
  DslCoverageClassification,
  DslCoverageEntry,
} from './smart-builder-dsl-coverage';
// FS-047 eligible target derivation
export { deriveEligibleTargets } from './derive-eligible-targets';
// FS-048 T-01 auto-map workspace persistence
export {
  saveAutoMapSuggestions,
  loadAutoMapSuggestions,
  clearAutoMapSuggestions,
  hasPersistedSuggestions,
  listPersistedSections,
  getPendingAutoMapSession,
} from './auto-map-persistence';
// FS-048 T-04 auto-map staleness detection
export { detectStaleSuggestions } from './auto-map-staleness';
export type { GetDraftExpression } from './auto-map-staleness';
// FS-052 T-01 shared source-field display utilities
export {
  SOURCE_TYPE_BADGES,
  getTypeBadge,
  getTypeBadgeCode,
  resolveFieldTestValue,
} from './source-field-display';
export type { TypeBadge } from './source-field-display';
