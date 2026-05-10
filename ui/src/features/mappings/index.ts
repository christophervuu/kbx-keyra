export { useEngineValidation, useMappingEditor, useExpressionBuilder } from './hooks';
export type {
  EditorLoadState,
  MappingEditorActions,
  UseMappingEditorResult,
  ExpressionBuilderMode,
  BuilderStep,
  ExpressionBuilderOptions,
  ExpressionBuilderResult,
} from './hooks';
export { MappingEditorPage, RuleList, ExpressionBuilderPanel, RawDslEditor, ChainBuilderShell, EntryPointSelector, ChainSourceCard, StaticValueInput } from './components';
export type {
  MappingEditorPageProps,
  RuleListProps,
  SaveStatus,
  HighestDeployStatus,
  ExpressionBuilderPanelProps,
  RawDslEditorProps,
  RawDslEditorRef,
  ChainBuilderShellProps,
  EntryPointSelectorProps,
  ChainSourceCardProps,
  StaticValueInputProps,
} from './components';
export {
  inferRuleType,
  tokenizeDsl,
  findMatchingBracket,
  computeVersionDiff,
  generateChangeSummary,
  // FS-038 chain builder
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
  // FS-038 chain expression generator
  generateExpressionFromChain,
  // FS-039 chain expression generator
  generateChainExpression,
  // FS-038 chain decomposer
  decomposeToChainState,
  // FS-039 chain decomposer
  decomposeToChain,
} from './lib';
export type {
  RuleTypeLabel,
  DslToken,
  DslTokenType,
  RuleDiff,
  ConfigDiff,
  VersionDiff,
  // FS-038 chain builder types
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
  // FS-038 decomposer result
  DecomposeChainResult,
  // FS-039 decomposer result
  DecomposeChainResult039,
} from './lib';

// FS-039 draft types (from types.ts)
export type { UnsavedChangeSummary, UnsavedChangeType } from './types';
