export { useEngineValidation } from './use-engine-validation';
export { useMappingEditor } from './use-mapping-editor';
export type { EditorLoadState, MappingEditorActions, UseMappingEditorResult } from './use-mapping-editor';
export { useExpressionBuilder } from './use-expression-builder';
export type {
  ExpressionBuilderMode,
  BuilderStep,
  ExpressionBuilderOptions,
  ExpressionBuilderResult,
} from './use-expression-builder';
export { useDslAutocomplete } from './use-dsl-autocomplete';
export type {
  UseDslAutocompleteOptions,
  UseDslAutocompleteResult,
  ConfirmResult,
} from './use-dsl-autocomplete';
export { useDslValidation } from './use-dsl-validation';
export type { ErrorDecoration, UseDslValidationResult } from './use-dsl-validation';
export { useExpressionPreview } from './use-expression-preview';
export type {
  UseExpressionPreviewOptions,
  ExpressionPreviewState,
} from './use-expression-preview';
export { useVersionHistory } from './use-version-history';
export type { VersionHistoryEntry, UseVersionHistoryResult } from './use-version-history';
export { useTargetStatus } from './use-target-status';
export type { UseTargetStatusResult, CoverageEntry } from './use-target-status';
export { useArrayBuilder } from './use-array-builder';
export type { UseArrayBuilderResult, ArrayBuilderStep } from './use-array-builder';
// FS-043 array builder state hook
export { useArrayBuilderState } from './use-array-builder-state';
export type { UseArrayBuilderStateOptions, UseArrayBuilderStateResult } from './use-array-builder-state';
export { useDragSource } from './use-drag-source';
export type { UseDragSourceResult, DragHandlers } from './use-drag-source';
export { useDropZone } from './use-drop-zone';
export type { UseDropZoneResult, UseDropZoneOptions, DropHandlers } from './use-drop-zone';
export { usePreviewExecution } from './use-preview-execution';
export type { UsePreviewExecutionParams, UsePreviewExecutionResult } from './use-preview-execution';
export { useResizableLayout } from './use-resizable-layout';
export type { LayoutState, ResizeHandleProps, UseResizableLayoutResult } from './use-resizable-layout';
export { useTestCases } from './use-test-cases';
export type { SaveTestCaseParams, SaveTestCaseResult, UseTestCasesResult } from './use-test-cases';
export { useTestRunResults } from './use-test-run-results';
export type { UseTestRunResultsResult } from './use-test-run-results';
export { useBatchExecution } from './use-batch-execution';
export type { UseBatchExecutionOptions, UseBatchExecutionResult, BatchProgress } from './use-batch-execution';
export { useLinkedDebugSelection } from './use-linked-debug-selection';
export type { UseLinkedDebugSelectionResult } from './use-linked-debug-selection';
export { useExplainRule } from './use-explain-rule';
export type { ExplainRuleState, UseExplainRuleReturn } from './use-explain-rule';
export { useSuggestExpression } from './use-suggest-expression';
export type {
  SuggestExpressionState,
  UseSuggestExpressionReturn,
} from './use-suggest-expression';
export { useSmartFix } from './use-smart-fix';
export type {
  SmartFixState,
  UseSmartFixReturn,
} from './use-smart-fix';
export { useAiValidation } from './use-ai-validation';
export type {
  AiValidationState,
  UseAiValidationReturn,
} from './use-ai-validation';
// FS-048 auto-map workspace hook
export { useAutoMapWorkspace } from './use-auto-map-workspace';
export type {
  UseAutoMapWorkspaceParams,
  UseAutoMapWorkspaceResult,
  SuggestionFilter,
  SuggestionWorkspaceItem,
  BatchAcceptResult,
  BatchAcceptSkipEntry,
} from './use-auto-map-workspace';
// FS-048 suggestion preview hook
export { useSuggestionPreview } from './use-suggestion-preview';
export type { UseSuggestionPreviewResult } from './use-suggestion-preview';
