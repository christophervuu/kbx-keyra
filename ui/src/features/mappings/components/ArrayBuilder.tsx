/**
 * ArrayBuilder.tsx — FS-043 T-04 / T-10
 *
 * New right-panel component for array-type target fields.
 * Replaces ArrayMappingBuilder.tsx with the chain-aligned two-layer builder.
 *
 * Layout (outer builder):
 *   ┌─────────────────────────────────────────────┐
 *   │ Header: type badge · target path · status   │
 *   ├─────────────────────────────────────────────┤
 *   │ BuilderFeedbackArea (pinned)                 │
 *   ├─────────────────────────────────────────────┤
 *   │ Scrollable content:                          │
 *   │   ArrayModeSelector                          │
 *   │   ─────────────────                          │
 *   │   Collection editor (mode-specific)          │
 *   │   ─────────────────                          │
 *   │   Item template layer                        │
 *   └─────────────────────────────────────────────┘
 *
 * Layout (nested panel — T-10):
 *   ┌─────────────────────────────────────────────┐
 *   │ ← Back to parent  |  Breadcrumb             │
 *   ├─────────────────────────────────────────────┤
 *   │ Scope context label                          │
 *   ├─────────────────────────────────────────────┤
 *   │ Nested ArrayModeSelector                     │
 *   │ Nested collection editor                     │
 *   │ Nested item template                         │
 *   └─────────────────────────────────────────────┘
 *
 * Progressive disclosure:
 *   1. Mode selector always visible.
 *   2. Collection editor shown after mode selection.
 *   3. Item template shown after source array selected.
 *
 * Integration:
 *   - useArrayBuilderState() manages state + auto-drafts via updateDraft().
 *   - BuilderFeedbackArea shows expression / result / validation.
 *   - MappingEditor.tsx wires this in place of ArrayMappingBuilder for array nodes.
 *
 * Out of scope for T-04:
 *   - Filter + Map editor (T-05)
 *   - Build from Values editor (T-05)
 *   - Merge Branches editor (T-06)
 *   - Custom Expression editor (T-12)
 *   - Item template layer (T-07)
 *   - Mode switching confirmation dialog (T-08)
 *   - Validation display (T-11)
 *   - Result preview (T-13)
 */

import { useCallback, useContext, useMemo } from 'react';
import { ArrowLeft, Layers, AlertCircle, AlertTriangle, CheckCircle2, Circle, XCircle } from 'lucide-react';

import { BuilderFeedbackArea } from './BuilderFeedbackArea';
import { ArrayModeSelector } from './ArrayModeSelector';
import { MapCollectionEditor } from './MapCollectionEditor';
import { FilterMapCollectionEditor } from './FilterMapCollectionEditor';
import { BuildFromValuesEditor } from './BuildFromValuesEditor';
import { MergeBranchesEditor } from './MergeBranchesEditor';
import { ItemTemplateEditor } from './ItemTemplateEditor';
import { ModeSwitchConfirmDialog } from './ModeSwitchConfirmDialog';
import { CustomExpressionEditor } from './CustomExpressionEditor';
import { ArrayResultPreview } from './ArrayResultPreview';
import { useExpressionPreview } from '../hooks/use-expression-preview';
import type { TargetFieldStatus } from './TargetFieldRow';
import { useArrayBuilderState } from '../hooks/use-array-builder-state';
import { useDslValidation } from '../hooks/use-dsl-validation';
import { useBuilderValidation } from '../hooks/use-builder-validation';
import { PreviewContext } from '../context/preview-context';
import type {
  ArrayBuilderMode,
  ArrayBuilderState,
  BuildFromValuesCollectionState,
  ItemFieldMapping,
  MergeBranchesCollectionState,
} from '../lib/array-builder-state';
import { generateArrayExpression } from '../lib/array-expression-generator';
import type { ArrayValidationState } from '../lib/array-validation';

import type { ParsedSchema, MappingRule, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArrayBuilderProps {
  /** Full dot-path of the target array field. */
  readonly selectedTargetPath: string;
  /** Whether the target field is required. */
  readonly selectedTargetRequired: boolean;
  /** Current mapping status of the target field. */
  readonly currentStatus: TargetFieldStatus;
  /**
   * Current saved expression for this target (from committed rules).
   * Hydration checks getDraftExpression first, then falls back to this.
   */
  readonly currentExpression?: string;
  /** Parsed source schema for source array selection. */
  readonly parsedSourceSchema: ParsedSchema | null;
  /**
   * Parsed target schema — used to derive item fields for the item template layer.
   */
  readonly parsedTargetSchema: ParsedSchema | null;
  /**
   * Called on every expression change to persist an in-memory draft.
   */
  readonly updateDraft: (targetPath: string, expression: string) => void;
  /**
   * Returns the current in-memory draft expression for a target path, or null.
   */
  readonly getDraftExpression: (targetPath: string) => string | null;
  /**
   * Optional callback fired whenever the local expression changes.
   */
  readonly onExpressionChange?: (expression: string) => void;
  /**
   * Last-saved rules — used for diff state (future T-11).
   */
  readonly savedRules?: readonly MappingRule[];
  /**
   * T-10: Current nesting depth. 0 = outer builder, 1 = one level nested.
   * Internal — set automatically when rendering nested panels.
   */
  readonly nestingDepth?: number;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CLASSES: Record<TargetFieldStatus, string> = {
  unmapped: 'text-slate-500',
  mapped: 'text-green-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
};

function MappingStatusIcon({ status }: { status: TargetFieldStatus }) {
  switch (status) {
    case 'mapped':
      return <CheckCircle2 size={14} className="text-green-400" aria-hidden="true" />;
    case 'warning':
      return <AlertTriangle size={14} className="text-amber-400" aria-hidden="true" />;
    case 'error':
      return <XCircle size={14} className="text-red-400" aria-hidden="true" />;
    case 'unmapped':
    default:
      return <Circle size={14} className="text-slate-600" aria-hidden="true" />;
  }
}

const COMPLETION_STATUS_LABELS: Record<string, string> = {
  notStarted: 'Not started',
  inProgress: 'In progress',
  complete: 'Complete',
  hasErrors: 'Has errors',
};

const COMPLETION_STATUS_CLASSES: Record<string, string> = {
  notStarted: 'text-slate-500',
  inProgress: 'text-amber-400',
  complete: 'text-green-400',
  hasErrors: 'text-red-400',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CollectionEditorSlot({
  mode,
  sourceArrayPath,
  filterPredicate,
  buildFromValuesState,
  mergeBranchesState,
  rawExpression,
  isFromUnrecognized,
  canRestorePreviousDraft,
  parsedSourceSchema,
  onSourceArrayPathChange,
  onFilterPredicateChange,
  onBuildFromValuesStateChange,
  onMergeBranchesStateChange,
  onCustomExpressionChange,
  onResetToStructured,
  onRestorePreviousDraft,
}: {
  mode: ArrayBuilderMode;
  sourceArrayPath: string;
  filterPredicate: import('../lib/array-builder-state').FilterPredicateState | null;
  buildFromValuesState: BuildFromValuesCollectionState | null;
  mergeBranchesState: MergeBranchesCollectionState | null;
  rawExpression: string;
  isFromUnrecognized: boolean;
  canRestorePreviousDraft: boolean;
  parsedSourceSchema: ParsedSchema | null;
  onSourceArrayPathChange: (path: string) => void;
  onFilterPredicateChange: (p: import('../lib/array-builder-state').FilterPredicateState) => void;
  onBuildFromValuesStateChange: (s: BuildFromValuesCollectionState) => void;
  onMergeBranchesStateChange: (s: MergeBranchesCollectionState) => void;
  onCustomExpressionChange: (expr: string) => void;
  onResetToStructured: () => void;
  onRestorePreviousDraft: (() => void) | undefined;
}) {
  switch (mode) {
    case 'map':
      return (
        <MapCollectionEditor
          sourceArrayPath={sourceArrayPath}
          parsedSourceSchema={parsedSourceSchema}
          onSourceArrayPathChange={onSourceArrayPathChange}
        />
      );

    case 'filterMap':
      return (
        <FilterMapCollectionEditor
          sourceArrayPath={sourceArrayPath}
          filterPredicate={filterPredicate ?? { kind: 'structured', left: { kind: 'itemField', fieldPath: '' }, operator: 'eq', right: { kind: 'none' } }}
          parsedSourceSchema={parsedSourceSchema}
          onSourceArrayPathChange={onSourceArrayPathChange}
          onFilterPredicateChange={onFilterPredicateChange}
        />
      );

    case 'buildFromValues':
      return (
        <BuildFromValuesEditor
          collectionState={buildFromValuesState ?? { mode: 'buildFromValues', entries: [], nullFilteringEnabled: false }}
          parsedSourceSchema={parsedSourceSchema}
          onCollectionStateChange={onBuildFromValuesStateChange}
        />
      );

    case 'mergeArrayBranches':
      return (
        <MergeBranchesEditor
          collectionState={
            mergeBranchesState ?? {
              mode: 'mergeArrayBranches',
              branches: [],
            }
          }
          parsedSourceSchema={parsedSourceSchema}
          onCollectionStateChange={onMergeBranchesStateChange}
        />
      );

    case 'customExpression':
      return (
        <CustomExpressionEditor
          value={rawExpression}
          onChange={onCustomExpressionChange}
          isFromUnrecognized={isFromUnrecognized}
          canRestorePreviousDraft={canRestorePreviousDraft}
          onResetToStructured={onResetToStructured}
          onRestorePreviousDraft={onRestorePreviousDraft}
          parsedSourceSchema={parsedSourceSchema}
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Sub-component: ValidationSummaryRow (T-11)
// ---------------------------------------------------------------------------

function ValidationSummaryRow({ validation }: { validation: ArrayValidationState }) {
  const { errorCount, warningCount, incompleteCount } = validation;

  if (errorCount === 0 && warningCount === 0 && incompleteCount === 0) {
    return null;
  }

  return (
    <div
      data-testid="array-validation-summary"
      className="shrink-0 flex items-center gap-3 border-b border-slate-700 bg-slate-900/40 px-4 py-2"
    >
      {errorCount > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
          <AlertCircle size={10} aria-hidden="true" />
          {errorCount} error{errorCount !== 1 ? 's' : ''}
        </span>
      )}
      {warningCount > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
          <AlertTriangle size={10} aria-hidden="true" />
          {warningCount} warning{warningCount !== 1 ? 's' : ''}
        </span>
      )}
      {incompleteCount > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
          <Circle size={10} aria-hidden="true" />
          {incompleteCount} incomplete
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: NestedArrayPanel (T-10)
// ---------------------------------------------------------------------------

/**
 * Focused panel shown when editing a nested array field.
 * Replaces the outer builder content while active.
 */
function NestedArrayPanel({
  outerTargetPath,
  nestedTargetPath,
  nestedState,
  parsedSourceSchema,
  parsedTargetSchema,
  nestingDepth,
  onBack,
  onNestedFieldMappingChange,
  onNestedStateChange,
}: {
  outerTargetPath: string;
  nestedTargetPath: string;
  nestedState: ArrayBuilderState;
  parsedSourceSchema: ParsedSchema | null;
  parsedTargetSchema: ParsedSchema | null;
  nestingDepth: number;
  onBack: () => void;
  onNestedFieldMappingChange: (fieldPath: string, mapping: ItemFieldMapping) => void;
  onNestedStateChange: (state: ArrayBuilderState) => void;
}) {
  // Derive the nested target array node from the target schema
  const nestedTargetNode = useMemo((): SchemaTreeNode | null => {
    if (!parsedTargetSchema) return null;
    function findNode(nodes: SchemaTreeNode[], path: string): SchemaTreeNode | null {
      for (const node of nodes) {
        if (node.path === path) return node;
        const found = findNode(node.children, path);
        if (found) return found;
      }
      return null;
    }
    return findNode(parsedTargetSchema.nodes, nestedTargetPath);
  }, [parsedTargetSchema, nestedTargetPath]);

  // Derive source array path from nested state
  const nestedSourceArrayPath =
    nestedState.collectionState.mode === 'map' || nestedState.collectionState.mode === 'filterMap'
      ? nestedState.collectionState.sourceArrayPath
      : '';

  // Derive nested expression for preview
  const nestedExpression = generateArrayExpression(nestedState);

  // Breadcrumb labels
  const outerLabel = outerTargetPath.split('.').pop() ?? outerTargetPath;
  const nestedLabel = nestedTargetPath.split('.').pop() ?? nestedTargetPath;

  // Show item template for map, filterMap, mergeArrayBranches
  const showNestedItemTemplate =
    nestedState.mode === 'map' ||
    nestedState.mode === 'filterMap' ||
    nestedState.mode === 'mergeArrayBranches';

  function handleNestedModeChange(mode: ArrayBuilderMode) {
    const newCollectionState =
      mode === 'map'
        ? { mode: 'map' as const, sourceArrayPath: '' }
        : mode === 'filterMap'
          ? { mode: 'filterMap' as const, sourceArrayPath: '', filterPredicate: { kind: 'structured' as const, left: { kind: 'itemField' as const, fieldPath: '' }, operator: 'eq' as const, right: { kind: 'none' as const } } }
          : mode === 'buildFromValues'
            ? { mode: 'buildFromValues' as const, entries: [], nullFilteringEnabled: false }
            : mode === 'mergeArrayBranches'
              ? { mode: 'mergeArrayBranches' as const, branches: [] }
              : { mode: 'customExpression' as const, rawExpression: '' };
    onNestedStateChange({
      ...nestedState,
      mode,
      collectionState: newCollectionState,
    });
  }

  function handleNestedSourceArrayPathChange(path: string) {
    if (nestedState.collectionState.mode !== 'map' && nestedState.collectionState.mode !== 'filterMap') return;
    onNestedStateChange({
      ...nestedState,
      collectionState: { ...nestedState.collectionState, sourceArrayPath: path },
    });
  }

  return (
    <div
      data-testid="nested-array-panel"
      className="flex flex-col gap-0 overflow-y-auto h-full"
    >
      {/* Back navigation + breadcrumb */}
      <div className="shrink-0 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="nested-array-back-btn"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            aria-label="Back to parent array builder"
          >
            <ArrowLeft size={12} aria-hidden="true" />
            Back to parent
          </button>

          <span className="text-slate-600" aria-hidden="true">|</span>

          {/* Breadcrumb */}
          <div
            data-testid="nested-array-breadcrumb"
            className="flex items-center gap-1 min-w-0 flex-1"
          >
            <Layers size={11} aria-hidden="true" className="shrink-0 text-amber-400" />
            <span className="text-[11px] text-slate-500">Editing:</span>
            <span className="font-mono text-[11px] text-slate-300 truncate">
              {outerLabel}[].{nestedLabel}[]
            </span>
            <span className="text-[11px] text-slate-600">— inside</span>
            <span className="font-mono text-[11px] text-slate-500">{outerLabel}[]</span>
          </div>
        </div>

        {/* Scope context label */}
        <p
          data-testid="nested-array-scope-label"
          className="mt-1.5 text-[10px] text-violet-400"
        >
          Parent item fields available via <span className="font-mono">parent()</span>
        </p>
      </div>

      {/* Nested expression preview */}
      {nestedExpression && (
        <div className="shrink-0 border-b border-slate-700 bg-slate-900/40 px-4 py-2">
          <span className="block text-[9px] font-medium uppercase tracking-wide text-slate-600 mb-0.5">
            Nested expression
          </span>
          <span className="font-mono text-[10px] text-green-300 break-all">
            {nestedExpression}
          </span>
        </div>
      )}

      {/* Scrollable nested content */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* Mode selector */}
        <ArrayModeSelector
          selectedMode={nestedState.mode}
          onSelectMode={handleNestedModeChange}
        />

        <div className="h-px bg-slate-700/60" />

        {/* Collection editor */}
        {(nestedState.mode === 'map' || nestedState.mode === 'filterMap') && (
          <MapCollectionEditor
            sourceArrayPath={nestedSourceArrayPath}
            parsedSourceSchema={parsedSourceSchema}
            onSourceArrayPathChange={handleNestedSourceArrayPathChange}
          />
        )}

        {nestedState.mode === 'customExpression' && (
          <CustomExpressionEditor
            value={
              nestedState.collectionState.mode === 'customExpression'
                ? nestedState.collectionState.rawExpression
                : ''
            }
            onChange={(expr) => {
              if (nestedState.collectionState.mode !== 'customExpression') return;
              onNestedStateChange({
                ...nestedState,
                collectionState: { ...nestedState.collectionState, rawExpression: expr },
              });
            }}
            isFromUnrecognized={false}
            canRestorePreviousDraft={false}
            onResetToStructured={() => handleNestedModeChange('map')}
            parsedSourceSchema={parsedSourceSchema}
          />
        )}

        {/* Nested item template */}
        {showNestedItemTemplate && (
          <>
            <div className="h-px bg-slate-700/60" />
            <ItemTemplateEditor
              itemTemplate={nestedState.itemTemplate}
              targetArrayNode={nestedTargetNode}
              parsedSourceSchema={parsedSourceSchema}
              sourceArrayPath={nestedSourceArrayPath}
              nestingDepth={nestingDepth}
              nestedArrayStates={nestedState.itemTemplate.nestedArrays}
              onFieldMappingChange={onNestedFieldMappingChange}
              // Depth limit: no further nesting at depth >= 2
            />
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArrayBuilder({
  selectedTargetPath,
  selectedTargetRequired,
  currentStatus,
  currentExpression = '',
  parsedSourceSchema,
  parsedTargetSchema,
  updateDraft,
  getDraftExpression,
  onExpressionChange,
  nestingDepth = 0,
  className = '',
}: ArrayBuilderProps) {
  // Derive the target array node from the target schema for the item template layer
  const targetArrayNode = useMemo((): SchemaTreeNode | null => {
    if (!parsedTargetSchema) return null;
    function findNode(nodes: SchemaTreeNode[], path: string): SchemaTreeNode | null {
      for (const node of nodes) {
        if (node.path === path) return node;
        const found = findNode(node.children, path);
        if (found) return found;
      }
      return null;
    }
    return findNode(parsedTargetSchema.nodes, selectedTargetPath);
  }, [parsedTargetSchema, selectedTargetPath]);

  const {
    state,
    expression,
    setSourceArrayPath,
    setFilterPredicate,
    setBuildFromValuesState,
    setMergeBranchesState,
    setFieldMapping,
    switchMode,
    pendingModeSwitch,
    confirmModeSwitch,
    cancelModeSwitch,
    canRestorePreviousDraft,
    restorePreviousDraft,
    validationState,
    // T-10 nested navigation
    activeNestedPath,
    enterNestedArray,
    exitNestedArray,
    setNestedFieldMapping,
    setNestedArrayBuilderState,
    activeNestedState,
    // T-12 custom expression
    setCustomExpression,
    isFromUnrecognized,
  } = useArrayBuilderState({
    targetPath: selectedTargetPath,
    getDraftExpression,
    currentExpression,
    updateDraft,
    onExpressionChange,
    parsedSourceSchema,
    targetArrayNode,
  });

  const { parseResult, isValid: isParseValid } = useDslValidation(expression);

  const previewCtx = useContext(PreviewContext);
  const sourceData = previewCtx?.sourceData ?? null;

  const builderValidationState = useBuilderValidation({
    builderState: null,
    expression,
    targetType: 'array',
    mode: 'builder',
    parseResult: parseResult ?? null,
    isParseValid,
  });

  // T-13: Array result preview
  const arrayPreview = useExpressionPreview({
    expression,
    sourceData,
  });

  // Derive source array path for the collection editor
  const sourceArrayPath =
    state.collectionState.mode === 'map' || state.collectionState.mode === 'filterMap'
      ? state.collectionState.sourceArrayPath
      : '';

  const filterPredicate =
    state.collectionState.mode === 'filterMap'
      ? state.collectionState.filterPredicate
      : null;

  const buildFromValuesState =
    state.collectionState.mode === 'buildFromValues'
      ? state.collectionState
      : null;

  const mergeBranchesState =
    state.collectionState.mode === 'mergeArrayBranches'
      ? state.collectionState
      : null;

  // T-12: raw expression for custom expression mode
  const rawExpression =
    state.collectionState.mode === 'customExpression'
      ? state.collectionState.rawExpression
      : '';

  // T-12: "Reset to structured mode" — switch to map (mode selector will be shown)
  const handleResetToStructured = useCallback(() => {
    switchMode('map');
  }, [switchMode]);

  // Item template is shown for map, filterMap, and mergeArrayBranches modes
  const showItemTemplate =
    state.mode === 'map' ||
    state.mode === 'filterMap' ||
    state.mode === 'mergeArrayBranches';

  const completionLabel = COMPLETION_STATUS_LABELS[state.completionStatus] ?? state.completionStatus;
  const completionClass = COMPLETION_STATUS_CLASSES[state.completionStatus] ?? 'text-slate-500';

  // ---------------------------------------------------------------------------
  // T-10: Nested panel — replaces outer content when active
  // ---------------------------------------------------------------------------

  if (activeNestedPath !== null && activeNestedState !== null) {
    return (
      <div
        data-testid="array-builder"
        className={['flex flex-col gap-0 overflow-y-auto', className].filter(Boolean).join(' ')}
      >
        <NestedArrayPanel
          outerTargetPath={selectedTargetPath}
          nestedTargetPath={activeNestedPath}
          nestedState={activeNestedState}
          parsedSourceSchema={parsedSourceSchema}
          parsedTargetSchema={parsedTargetSchema}
          nestingDepth={nestingDepth + 1}
          onBack={exitNestedArray}
          onNestedFieldMappingChange={setNestedFieldMapping}
          onNestedStateChange={setNestedArrayBuilderState}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="array-builder"
      className={['flex flex-col gap-0 overflow-y-auto', className].filter(Boolean).join(' ')}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="shrink-0 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Mapping status icon */}
          <span className={STATUS_CLASSES[currentStatus]} data-testid="header-status-icon">
            <MappingStatusIcon status={currentStatus} />
          </span>

          {/* Type badge */}
          <span
            className="shrink-0 rounded bg-amber-900/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
            data-testid="header-type-badge"
          >
            array
          </span>

          {/* Target path */}
          <span
            className="min-w-0 flex-1 truncate font-mono text-sm text-slate-100"
            title={selectedTargetPath}
            data-testid="header-target-path"
          >
            {selectedTargetPath}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-3">
          {/* Required */}
          {selectedTargetRequired && (
            <span
              className="text-xs text-red-400"
              data-testid="header-required-label"
            >
              Required
            </span>
          )}

          {/* Completion status */}
          <span
            className={`text-xs ${completionClass}`}
            data-testid="header-completion-status"
          >
            {completionLabel}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Feedback Area (pinned)                                              */}
      {/* ------------------------------------------------------------------ */}
      <BuilderFeedbackArea
        expression={expression}
        sourceData={sourceData}
        validationState={builderValidationState}
        mode="builder"
        compact={true}
        collapsible={true}
        defaultCollapsed={true}
        hideValidation={true}
        resultSlot={
          <ArrayResultPreview
            result={arrayPreview.result}
            error={arrayPreview.error}
            isEvaluating={arrayPreview.isEvaluating}
            sourceData={sourceData}
            mode={state.mode}
            expression={expression}
          />
        }
      />

      {/* T-11: Validation summary row */}
      <ValidationSummaryRow validation={validationState} />

      {/* ------------------------------------------------------------------ */}
      {/* Scrollable content                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* Mode selector — uses switchMode for subsequent changes (with preservation logic) */}
        <ArrayModeSelector
          selectedMode={state.mode}
          onSelectMode={switchMode}
        />

        {/* Divider */}
        <div className="h-px bg-slate-700/60" />

        {/* Collection editor — mode-specific */}
        <CollectionEditorSlot
          mode={state.mode}
          sourceArrayPath={sourceArrayPath}
          filterPredicate={filterPredicate}
          buildFromValuesState={buildFromValuesState}
          mergeBranchesState={mergeBranchesState}
          rawExpression={rawExpression}
          isFromUnrecognized={isFromUnrecognized}
          canRestorePreviousDraft={canRestorePreviousDraft}
          parsedSourceSchema={parsedSourceSchema}
          onSourceArrayPathChange={setSourceArrayPath}
          onFilterPredicateChange={setFilterPredicate}
          onBuildFromValuesStateChange={setBuildFromValuesState}
          onMergeBranchesStateChange={setMergeBranchesState}
          onCustomExpressionChange={setCustomExpression}
          onResetToStructured={handleResetToStructured}
          onRestorePreviousDraft={canRestorePreviousDraft ? restorePreviousDraft : undefined}
        />

        {/* Item template layer — shown for map, filterMap, mergeArrayBranches */}
        {showItemTemplate && (
          <>
            <div className="h-px bg-slate-700/60" />
            <ItemTemplateEditor
              itemTemplate={state.itemTemplate}
              targetArrayNode={targetArrayNode}
              parsedSourceSchema={parsedSourceSchema}
              sourceArrayPath={sourceArrayPath}
              nestingDepth={nestingDepth}
              nestedArrayStates={state.itemTemplate.nestedArrays}
              validationState={validationState}
              onFieldMappingChange={(fieldPath: string, mapping: ItemFieldMapping) => {
                setFieldMapping(fieldPath, mapping);
              }}
              onEnterNestedArray={enterNestedArray}
            />
          </>
        )}
      </div>

      {/* Mode switch confirmation dialog */}
      {pendingModeSwitch !== null && (
        <ModeSwitchConfirmDialog
          open={true}
          fromMode={state.mode}
          toMode={pendingModeSwitch}
          canRestorePrevious={canRestorePreviousDraft}
          onConfirm={confirmModeSwitch}
          onCancel={cancelModeSwitch}
          onRestorePrevious={canRestorePreviousDraft ? restorePreviousDraft : undefined}
        />
      )}
    </div>
  );
}
