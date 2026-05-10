/**
 * ScalarFieldBuilder — right panel content for scalar target field authoring.
 *
 * Shown when a scalar (non-object, non-array) target field is selected in the
 * Target Worklist. Provides:
 *   - Header: target path, type badge, required/optional label, mapping status
 *   - Suggested Sources: client-side heuristic suggestions from parsed source schema
 *   - Expression Builder: ChainBuilderShell (new, default) or RawDslEditor (toggle)
 *   - AI Action buttons: placeholder (Coming soon tooltip)
 *   - Discard changes button: visible when current field has an unsaved draft
 *
 * FS-039 T-05: Auto-draft model — every expression change calls updateDraft().
 * Apply button and Next unmapped button removed. Header Save commits all drafts.
 *
 * FS-038 T-12: Integrates the new chain builder (ChainBuilderShell + chain state)
 * replacing UnifiedExpressionBuilder in Builder mode. UnifiedExpressionBuilder is
 * retained for Rules View (T-13) and as a fallback.
 */

import { Lightbulb, Sparkles, Undo2, Wrench } from 'lucide-react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { RawDslEditor } from './RawDslEditor';
import type { RawDslEditorRef } from './RawDslEditor';
import { ComplexExpressionWarning } from './ComplexExpressionWarning';
import { ChainBuilderShell } from './ChainBuilderShell';
import { EntryPointSelector } from './EntryPointSelector';
import { ChainSourceCard } from './ChainSourceCard';
import { StaticValueInput } from './StaticValueInput';
import { LogicStepList } from './LogicStepList';
import type { TargetFieldStatus, TargetFieldType } from './TargetFieldRow';
import { suggestSourceFields } from '../lib/suggest-source-fields';
import type { SuggestedField } from '../lib/suggest-source-fields';
import { useDslValidation } from '../hooks/use-dsl-validation';
import { useDropZone } from '../hooks/use-drop-zone';
import { decomposeExpression as decomposeExpressionNew } from '../lib/pipeline-decomposer';
import { decomposeToSourceCardState } from '../lib/source-card-decomposer';
import { PreviewContext } from '../context/preview-context';
import type {
  ChainBuilderState,
  LogicStep,
  BuilderEntryType,
  StaticValueBranch,
} from '../lib/chain-builder-state';
import {
  createEmptyChainState,
  createEmptyTransformStep,
  createEmptyConditionStep,
  createEmptyValueMapStep,
} from '../lib/chain-builder-state';
import { generateExpressionFromChain } from '../lib/chain-expression-generator';
import { decomposeToChainState } from '../lib/chain-decomposer';
import type { LogicKind } from './AddLogicPicker';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';

import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScalarFieldBuilderProps {
  /** Full dot-path of the selected target field */
  selectedTargetPath: string;
  /** JSON Schema type of the selected target field */
  selectedTargetType: TargetFieldType;
  /** Whether the target field is required */
  selectedTargetRequired: boolean;
  /** Current mapping status of the target field */
  currentStatus: TargetFieldStatus;
  /**
   * Current saved expression for this target (from committed rules).
   * Hydration checks getDraftExpression first, then falls back to this.
   */
  currentExpression?: string;
  /** Parsed source schema for suggestions and field picker */
  parsedSourceSchema: ParsedSchema | null;
  /**
   * Called on every expression change to persist an in-memory draft.
   * Replaces the old onApply model — no explicit Apply needed.
   */
  updateDraft: (targetPath: string, expression: string) => void;
  /**
   * Reverts the in-memory draft for the given target path back to the saved rule.
   * Called when the user clicks "Discard changes".
   */
  revertDraft: (targetPath: string) => void;
  /**
   * Returns the current in-memory draft expression for a target path, or null
   * if no draft exists (i.e. the field is clean / matches saved state).
   */
  getDraftExpression: (targetPath: string) => string | null;
  /**
   * Optional callback fired whenever the local expression text changes.
   * Used by the parent to watch draft expression changes for live preview.
   */
  onExpressionChange?: (expression: string) => void;
  /**
   * Fires when the user clicks "Clear mapping" (T-08).
   * The parent removes the rule from the working session.
   */
  onClearMapping?: (targetPath: string) => void;
  /** Optional className */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_BADGE_CLASSES: Record<TargetFieldType, string> = {
  string: 'bg-blue-900/60 text-blue-300',
  number: 'bg-green-900/60 text-green-300',
  integer: 'bg-green-900/60 text-green-300',
  boolean: 'bg-purple-900/60 text-purple-300',
  object: 'bg-slate-700/80 text-slate-300',
  array: 'bg-amber-900/60 text-amber-300',
  null: 'bg-slate-800/60 text-slate-500',
};

const STATUS_CLASSES: Record<TargetFieldStatus, string> = {
  unmapped: 'text-slate-500',
  mapped: 'text-green-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
};

const STATUS_LABELS: Record<TargetFieldStatus, string> = {
  unmapped: 'Unmapped',
  mapped: 'Mapped',
  warning: 'Warning',
  error: 'Error',
};

const MATCH_KIND_LABEL: Record<SuggestedField['matchKind'], string> = {
  exact: 'Exact',
  'case-insensitive': 'Name',
  contains: 'Contains',
};

const AI_COMING_SOON = 'Coming soon \u2014 AI features available in a future release';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModeToggle({
  mode,
  onSwitch,
}: {
  mode: 'builder' | 'editor';
  onSwitch: (m: 'builder' | 'editor') => void;
}) {
  return (
    <div
      role="group"
      aria-label="Expression mode"
      className="inline-flex overflow-hidden rounded border border-slate-700"
    >
      {(['builder', 'editor'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          data-testid={`mode-toggle-${m}`}
          onClick={() => onSwitch(m)}
          className={[
            'px-2.5 py-1 text-xs font-medium capitalize transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
            mode === m
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
          ].join(' ')}
        >
          {m === 'builder' ? 'Builder' : 'Editor'}
        </button>
      ))}
    </div>
  );
}

function SuggestionPill({ suggestion, onSelect }: { suggestion: SuggestedField; onSelect: (path: string) => void }) {
  return (
    <button
      type="button"
      data-testid={`suggestion-${suggestion.path}`}
      onClick={() => onSelect(suggestion.path)}
      className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-blue-500/50 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
    >
      <span className="font-mono">{suggestion.fieldName}</span>
      <span className="rounded bg-slate-700 px-1 py-0.5 text-[9px] text-slate-500">
        {MATCH_KIND_LABEL[suggestion.matchKind]}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScalarFieldBuilder({
  selectedTargetPath,
  selectedTargetType,
  selectedTargetRequired,
  currentStatus,
  currentExpression = '',
  parsedSourceSchema,
  updateDraft,
  revertDraft,
  getDraftExpression,
  onExpressionChange,
  onClearMapping,
  className = '',
}: ScalarFieldBuilderProps) {
  const [expression, setExpression] = useState(currentExpression);
  const [mode, setMode] = useState<'builder' | 'editor'>('builder');
  const [decompositionWarning, setDecompositionWarning] = useState<string | null>(null);
  const prevHydratedTargetRef = useRef<string>(selectedTargetPath);

  // FS-038 T-12: Chain builder state
  const [chainState, setChainState] = useState<ChainBuilderState>(() => createEmptyChainState());
  // Whether the add-logic picker is open (shown below source card / static input)
  const [addLogicPickerOpen, setAddLogicPickerOpen] = useState(false);

  // Keep callbacks in refs to avoid stale closure issues
  const onExpressionChangeRef = useRef(onExpressionChange);
  useEffect(() => {
    onExpressionChangeRef.current = onExpressionChange;
  });
  const updateDraftRef = useRef(updateDraft);
  useEffect(() => {
    updateDraftRef.current = updateDraft;
  });

  const handleExpressionChange = useCallback((next: string) => {
    // Ignore no-op emissions from builder/editor re-hydration
    if (next === expression) {
      return;
    }

    setExpression(next);
    updateDraftRef.current(selectedTargetPath, next);
    onExpressionChangeRef.current?.(next);
  }, [expression, selectedTargetPath]);

  const rawDslRef = useRef<RawDslEditorRef>(null);

  // FS-038 T-12: Propagate chain expression whenever chain state changes
  useEffect(() => {
    if (mode !== 'builder') return;
    const generated = generateExpressionFromChain(chainState);
    handleExpressionChange(generated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainState, mode]);

  // Hydrate builder state when target field changes.
  // Priority: draft expression → saved expression → empty state.
  useEffect(() => {
    const draftExpr = getDraftExpression(selectedTargetPath);
    const expr = draftExpr ?? currentExpression ?? '';
    setExpression(expr);
    prevHydratedTargetRef.current = selectedTargetPath;

    if (!expr) {
      // Unmapped / empty → reset to default empty chain state
      setDecompositionWarning(null);
      setChainState(createEmptyChainState());
      setMode('builder');
      return;
    }

    // FS-038 T-12: Try chain decomposer first
    const chainResult = decomposeToChainState(expr);
    if (chainResult.success) {
      setChainState(chainResult.state);
      setDecompositionWarning(null);
      setMode('builder');
      return;
    }

    // Fall back to legacy decomposer for Rules View compatibility
    const result = decomposeExpressionNew(expr);
    if (result.success) {
      setDecompositionWarning(null);
      setChainState(createEmptyChainState());
      setMode('builder');
    } else {
      const sourceCardResult = decomposeToSourceCardState(expr);
      if (sourceCardResult !== null) {
        setDecompositionWarning(null);
        setChainState(createEmptyChainState());
        setMode('builder');
      } else {
        // Decomposition failed → Editor mode with warning
        setChainState(createEmptyChainState());
        setDecompositionWarning(result.reason ?? 'Expression cannot be loaded into the guided builder.');
        setMode('editor');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTargetPath, currentExpression]);

  const { errorDecorations } = useDslValidation(expression);

  // isDirty: current expression differs from the saved (committed) expression.
  // A draft exists when getDraftExpression returns non-null.
  const isDirty = getDraftExpression(selectedTargetPath) !== null;

  // Read sourceData from PreviewContext for live result display
  const previewCtx = useContext(PreviewContext);
  const sourceData = previewCtx?.sourceData ?? null;

  const suggestions = suggestSourceFields(
    selectedTargetPath,
    selectedTargetType,
    parsedSourceSchema,
  );

  const handleInsertSourceField = useCallback(
    (path: string) => {
      if (mode === 'editor') {
        rawDslRef.current?.insertText(`source("${path}")`);
      } else {
        // FS-038 T-12: In builder mode, update chain state source path
        setChainState((prev) => ({
          ...prev,
          entryType: 'source',
          sourcePath: path,
        }));
      }
    },
    [mode],
  );

  // Alias for suggestion pill clicks (same behaviour)
  const handleSuggestionSelect = handleInsertSourceField;

  const { isDragOver, dropHandlers } = useDropZone({ onDrop: handleInsertSourceField });

  // Discard changes: revert draft and re-hydrate from saved expression
  const handleDiscard = useCallback(() => {
    revertDraft(selectedTargetPath);
    const expr = currentExpression ?? '';
    setExpression(expr);
    if (!expr) {
      setDecompositionWarning(null);
      setChainState(createEmptyChainState());
      setMode('builder');
      return;
    }
    const chainResult = decomposeToChainState(expr);
    if (chainResult.success) {
      setChainState(chainResult.state);
      setDecompositionWarning(null);
      setMode('builder');
    } else {
      setChainState(createEmptyChainState());
      setDecompositionWarning('Expression cannot be loaded into the guided builder.');
      setMode('editor');
    }
  }, [revertDraft, selectedTargetPath, currentExpression]);



  // FS-038 T-12: Chain state update handlers
  const handleEntryTypeChange = useCallback((type: BuilderEntryType) => {
    setChainState((prev) => ({
      ...createEmptyChainState(),
      entryType: type,
      sourcePath: type === 'source' ? prev.sourcePath : undefined,
    }));
  }, []);

  const handleSourceSelect = useCallback((path: string) => {
    setChainState((prev) => ({ ...prev, sourcePath: path }));
  }, []);

  const handleStaticValueChange = useCallback((value: StaticValueBranch) => {
    setChainState((prev) => ({ ...prev, staticValue: value }));
  }, []);

  const handleAddStep = useCallback((kind: LogicKind) => {
    setAddLogicPickerOpen(false);
    const newStep: LogicStep =
      kind === 'transform'
        ? createEmptyTransformStep()
        : kind === 'condition'
          ? createEmptyConditionStep()
          : createEmptyValueMapStep();
    setChainState((prev) => ({
      ...prev,
      logicSteps: [...prev.logicSteps, newStep],
      expandedStepIndex: prev.logicSteps.length, // expand the new step
    }));
  }, []);

  const handleStepChange = useCallback((index: number, step: LogicStep) => {
    setChainState((prev) => ({
      ...prev,
      logicSteps: prev.logicSteps.map((s, i) => (i === index ? step : s)),
    }));
  }, []);

  const handleRemoveStep = useCallback((index: number) => {
    setChainState((prev) => ({
      ...prev,
      logicSteps: prev.logicSteps.filter((_, i) => i !== index),
      expandedStepIndex:
        prev.expandedStepIndex === index
          ? null
          : prev.expandedStepIndex !== null && prev.expandedStepIndex > index
            ? prev.expandedStepIndex - 1
            : prev.expandedStepIndex,
    }));
  }, []);

  const handleExpandedStepIndexChange = useCallback((index: number | null) => {
    setChainState((prev) => ({ ...prev, expandedStepIndex: index }));
  }, []);

  // Source field options for parameter slots
  const sourceOptions = parsedSourceSchema ? flattenSchemaPaths(parsedSourceSchema) : [];

  // Current value label for condition/value map forms
  const currentValueLabel = chainState.sourcePath ?? 'the current value';

  return (
    <div
      data-testid="scalar-field-builder"
      className={`flex flex-col gap-0 overflow-y-auto ${className}`}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header: target context + Builder|Editor toggle                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="shrink-0 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Type badge */}
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE_CLASSES[selectedTargetType]}`}
            data-testid="header-type-badge"
          >
            {selectedTargetType}
          </span>

          {/* Target path */}
          <span
            className="min-w-0 flex-1 truncate font-mono text-sm text-slate-100"
            title={selectedTargetPath}
            data-testid="header-target-path"
          >
            {selectedTargetPath}
          </span>

          {/* Builder | Editor toggle */}
          <ModeToggle mode={mode} onSwitch={setMode} />
        </div>

        <div className="mt-1 flex items-center gap-3">
          {/* Required / Optional */}
          <span
            className={`text-xs ${selectedTargetRequired ? 'text-red-400' : 'text-slate-500'}`}
            data-testid="header-required-label"
          >
            {selectedTargetRequired ? 'Required' : 'Optional'}
          </span>

          {/* Mapping status */}
          <span
            className={`text-xs ${STATUS_CLASSES[currentStatus]}`}
            data-testid="header-status"
          >
            {STATUS_LABELS[currentStatus]}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Suggested Sources — hidden when empty (AE-11: no suggested row in  */}
      {/* chain builder; kept here for Editor mode only)                      */}
      {/* ------------------------------------------------------------------ */}
      {suggestions.length > 0 && mode === 'editor' && (
        <div className="shrink-0 border-b border-slate-700 px-4 py-3" data-testid="suggested-sources-section">
          <div className="mb-2 flex items-center gap-1.5">
            <Lightbulb size={12} className="text-slate-500" aria-hidden="true" />
            <span className="text-xs font-medium text-slate-400">Suggested Sources</span>
          </div>
          <div className="flex flex-wrap gap-1.5" data-testid="suggestions-list">
            {suggestions.map((s) => (
              <SuggestionPill key={s.path} suggestion={s} onSelect={handleSuggestionSelect} />
            ))}
          </div>
        </div>
      )}

      <div
        className={[
          'min-h-0 flex-1 overflow-y-auto px-4 py-3 transition-colors',
          isDragOver ? 'bg-blue-950/40 ring-1 ring-inset ring-blue-500' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid="expression-area"
        aria-label="Expression drop zone — drop a source field here"
        {...dropHandlers}
      >
        {/* Decomposition warning banner */}
        {decompositionWarning !== null && mode === 'editor' && (
          <div className="mb-3" data-testid="decomposition-warning-container">
            <ComplexExpressionWarning
              reason={decompositionWarning}
              onStayInEditor={() => { setDecompositionWarning(null); }}
              onTryBuilder={() => {
                setDecompositionWarning(null);
                setMode('builder');
              }}
            />
          </div>
        )}

        {mode === 'editor' ? (
          <div data-testid="expression-editor-slot">
            <RawDslEditor
              ref={rawDslRef}
              value={expression}
              onChange={handleExpressionChange}
              placeholder="Enter a DSL expression…"
              className="w-full"
              errorDecorations={errorDecorations}
            />
          </div>
        ) : (
          /* FS-038 T-12: New chain builder surface */
          <div data-testid="expression-builder-slot">
            <ChainBuilderShell
              key={selectedTargetPath}
              targetPath={selectedTargetPath}
              targetType={selectedTargetType}
              isRequired={selectedTargetRequired}
              expression={expression}
              result={null}
              isEvaluating={false}
              sourceDataAvailable={sourceData !== null}
              isMapped={currentStatus === 'mapped'}
              isBuilderMode={true}
              onToggleMode={() => { setMode('editor'); }}
              onClearMapping={() => { onClearMapping?.(selectedTargetPath); }}
              onExpressionClick={() => { setMode('editor'); }}
            >
              {/* Entry point selector */}
              <EntryPointSelector
                value={chainState.entryType}
                hasLogicSteps={chainState.logicSteps.length > 0}
                onEntryTypeChange={handleEntryTypeChange}
              />

              {/* Source entry */}
              {chainState.entryType === 'source' && (
                <ChainSourceCard
                  sourcePath={chainState.sourcePath}
                  logicStepCount={chainState.logicSteps.length}
                  onSourceSelect={handleSourceSelect}
                  onAddLogic={() => { setAddLogicPickerOpen(true); }}
                />
              )}

              {/* Static entry */}
              {chainState.entryType === 'static' && (
                <StaticValueInput
                  initialValue={
                    chainState.staticValue !== undefined
                      ? String(chainState.staticValue.value ?? '')
                      : ''
                  }
                  targetType={selectedTargetType}
                  onValueChange={handleStaticValueChange}
                  onValidChange={() => {}}
                  onAddLogic={() => { setAddLogicPickerOpen(true); }}
                />
              )}

              {/* Logic step list */}
              {(chainState.logicSteps.length > 0 || addLogicPickerOpen) && (
                <LogicStepList
                  steps={chainState.logicSteps}
                  expandedStepIndex={chainState.expandedStepIndex}
                  onExpandedStepIndexChange={handleExpandedStepIndexChange}
                  onStepChange={handleStepChange}
                  onRemoveStep={handleRemoveStep}
                  onAddStep={handleAddStep}
                  sourceOptions={sourceOptions}
                  currentValueLabel={currentValueLabel}
                />
              )}
            </ChainBuilderShell>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* AI Actions + Discard                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="shrink-0 border-t border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2">
          {/* AI action buttons — placeholders */}
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={AI_COMING_SOON}
            data-testid="ai-suggest-btn"
            className="flex cursor-not-allowed items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-600 opacity-50"
          >
            <Sparkles size={12} aria-hidden="true" />
            Suggest
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={AI_COMING_SOON}
            data-testid="ai-explain-btn"
            className="flex cursor-not-allowed items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-600 opacity-50"
          >
            <Lightbulb size={12} aria-hidden="true" />
            Explain
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={AI_COMING_SOON}
            data-testid="ai-fix-btn"
            className="flex cursor-not-allowed items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-600 opacity-50"
          >
            <Wrench size={12} aria-hidden="true" />
            Fix
          </button>

          {/* Clear mapping button — only shown when target has an applied rule */}
          {currentStatus === 'mapped' && onClearMapping && (
            <button
              type="button"
              data-testid="clear-mapping-btn"
              onClick={() => { onClearMapping(selectedTargetPath); }}
              aria-label={`Clear mapping for ${selectedTargetPath}`}
              className="flex items-center gap-1 rounded border border-red-800/60 px-2 py-1 text-xs text-red-400 transition-colors hover:border-red-600 hover:text-red-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
            >
              Clear
            </button>
          )}

          {/* Spacer */}
          <span className="flex-1" />

          {/* Discard changes button — visible when field has an unsaved draft */}
          {isDirty && (
            <button
              type="button"
              data-testid="discard-btn"
              onClick={handleDiscard}
              aria-label={`Discard changes for ${selectedTargetPath}`}
              className="flex items-center gap-1.5 rounded border border-slate-600 px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:border-amber-500/60 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <Undo2 size={12} aria-hidden="true" />
              Discard changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
