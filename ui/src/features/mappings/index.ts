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
  // FS-038 chain expression generator
  generateExpressionFromChain,
  // FS-038 chain decomposer
  decomposeToChainState,
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
  // FS-038 decomposer result
  DecomposeChainResult,
} from './lib';
