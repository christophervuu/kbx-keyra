import { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';


import type { LogicKind } from './AddLogicPicker';
import { ChainBuilderShell } from './ChainBuilderShell';
import { ChainSourceCard } from './ChainSourceCard';
import { ComplexExpressionWarning } from './ComplexExpressionWarning';
import { EntryPointSelector } from './EntryPointSelector';
import { ExpressionPreview } from './ExpressionPreview';
import { FunctionReferencePanel } from './FunctionReferencePanel';
import { LogicStepList } from './LogicStepList';
import { RawDslEditor } from './RawDslEditor';
import type { RawDslEditorRef } from './RawDslEditor';
import type { StagedInputField } from './SourceSchemaPanel';
import { StaticValueInput } from './StaticValueInput';
import { PreviewContext } from '../context/preview-context';
import type { ExpressionBuilderMode, ExpressionBuilderResult } from '../hooks/use-expression-builder';
import { useExpressionPreview } from '../hooks/use-expression-preview';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import type {
  BuilderEntryType,
  ChainBuilderState,
  LogicStep,
  StaticValueBranch,
} from '../lib/chain-builder-state';
import {
  createEmptyChainState,
  createEmptyConditionStep,
  createEmptyTransformStep,
  createEmptyValueMapStep,
} from '../lib/chain-builder-state';
import { decomposeToChain } from '../lib/chain-decomposer';
import { generateExpressionFromChain } from '../lib/chain-expression-generator';
import { toLegacyChainBuilderState } from '../lib/chain-legacy-adapter';

import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpressionBuilderPanelRef {
  /**
   * Insert a source field path from Panel 1 (Schema Tree) into the active mode.
   * - Editor mode: inserts `source("path")` at cursor position in RawDslEditor.
   * - Builder mode: no-op (UnifiedExpressionBuilder manages its own source state).
   */
  insertSourceField: (field: StagedInputField | string) => void;
}

export interface ExpressionBuilderPanelProps {
  /**
   * The result returned by `useExpressionBuilder()`.
   * Pass null when the hook's output is not yet available.
   */
  readonly builderState: ExpressionBuilderResult | null;
  /**
   * Parsed source schema for the guided builder's field picker.
   * Pass null when no schema is loaded.
   */
  readonly parsedSourceSchema?: ParsedSchema | null;
  /** Optional enrichment input groups for mixed primary + enrichment browsing. */
  readonly enrichmentInputGroups?: readonly { alias: string; parsedSchema: ParsedSchema | null }[];
  /**
   * Sample source data for live expression preview (AE-08, T-10).
   * When rendered inside `<PreviewProvider>`, context sourceData takes precedence
   * over this prop. This prop is used as a fallback for isolated usage (e.g. tests).
   */
  readonly sampleSourceData?: unknown;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ModeToggleProps {
  readonly mode: ExpressionBuilderMode;
  readonly onSwitchToBuilder: () => void;
  readonly onSwitchToEditor: () => void;
}

function ModeToggle({ mode, onSwitchToBuilder, onSwitchToEditor }: ModeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Expression builder mode"
      className="inline-flex rounded-md border border-zinc-700 overflow-hidden text-sm"
    >
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'builder'}
        onClick={onSwitchToBuilder}
        className={[
          'px-3 py-1 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          mode === 'builder'
            ? 'bg-blue-600 text-white'
            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
        ].join(' ')}
      >
        Builder
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'editor'}
        onClick={onSwitchToEditor}
        className={[
          'px-3 py-1 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          mode === 'editor'
            ? 'bg-blue-600 text-white'
            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
        ].join(' ')}
      >
        Editor
      </button>
    </div>
  );
}

function inputPathToChainSourcePath(path: string): string {
  if (path.startsWith('get(external(')) return path;
  const enrichmentMatch = /^([^.]+)\.(.+)$/.exec(path);
  if (!enrichmentMatch) return path;
  const alias = enrichmentMatch[1];
  const fieldPath = enrichmentMatch[2];
  return `get(external("${alias}"), "${fieldPath}")`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Expression Builder Panel (Panel 4 of the Mapping Editor).
 *
 * Renders:
 * - Empty state when no rule is selected (AE-09).
 * - Mode toggle (Builder / Editor) when a rule is selected.
 * - Raw DSL editor in editor mode (T-02).
 * - Guided builder in builder mode (T-05).
 * - ComplexExpressionWarning when Editor → Builder decomposition fails (AE-07, T-08).
 * - Unsaved-changes indicator when local expression has parse errors (AE-12).
 */
export const ExpressionBuilderPanel = forwardRef<ExpressionBuilderPanelRef, ExpressionBuilderPanelProps>(
  function ExpressionBuilderPanel({
    builderState,
    parsedSourceSchema = null,
    enrichmentInputGroups = [],
    sampleSourceData = null,
  }, ref) {
  const rawDslRef = useRef<RawDslEditorRef>(null);

  // FS-038 T-13: Chain builder state for Rules View
  const [chainState, setChainState] = useState<ChainBuilderState>(() => createEmptyChainState());
  const [addLogicPickerOpen, setAddLogicPickerOpen] = useState(false);
  // Track which rule expression we last hydrated from to avoid re-hydrating on chain changes
  const lastHydratedExpressionRef = useRef<string>('');

  // Expose insertSourceField to parent via ref
  useImperativeHandle(ref, () => ({
    insertSourceField(field: StagedInputField | string) {
      if (!builderState || builderState.selectedRule === null) return;
      const staged = typeof field === 'string'
        ? ({ path: field, kind: 'primary', expression: `source("${field}")` } as StagedInputField)
        : field;

      const dsl = staged.expression;
      if (builderState.mode === 'editor') {
        rawDslRef.current?.insertText(dsl);
      } else {
        // Builder mode baseline support:
        // - primary input selections hydrate source path
        // - enrichment input selections stay in builder with prebuilt chain source expression
        if (staged.kind === 'primary') {
          setChainState((prev) => ({
            ...prev,
            entryType: 'source',
            sourcePath: staged.path,
          }));
        } else {
          setChainState((prev) => ({
            ...prev,
            entryType: 'source',
            sourcePath: inputPathToChainSourcePath(`${staged.alias ?? ''}.${staged.path}`),
          }));
        }
      }
    },
  }), [builderState]);

  // Read sourceData from PreviewContext when available.
  const previewCtx = useContext(PreviewContext);
  const resolvedSourceData = previewCtx?.sourceData ?? sampleSourceData ?? null;

  // Derive expression for preview — safe even when no rule is selected
  const previewExpression = builderState?.expression ?? '';
  const preview = useExpressionPreview({
    expression: previewExpression,
    sourceData: resolvedSourceData,
  });

  // FS-038 T-13: Hydrate chain state when rule expression changes
  useEffect(() => {
    const timerId = window.setTimeout(() => {
      if (!builderState || builderState.selectedRule === null) {
        setChainState(createEmptyChainState());
        lastHydratedExpressionRef.current = '';
        return;
      }

      const expr = builderState.expression;
      if (expr === lastHydratedExpressionRef.current) return;

      if (!expr) {
        setChainState(createEmptyChainState());
        lastHydratedExpressionRef.current = '';
        return;
      }

      const result = decomposeToChain(expr);
      if ('chain' in result) {
        setChainState(toLegacyChainBuilderState(result.chain));
        lastHydratedExpressionRef.current = expr;
      } else {
        // Decomposition failed — chain state stays empty; editor mode handles it
        setChainState(createEmptyChainState());
        lastHydratedExpressionRef.current = expr;
      }
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [builderState?.expression, builderState?.selectedRule]);

  // FS-038 T-13: Propagate chain expression to rule store on chain state change
  const setExpressionRef = useRef(builderState?.setExpression);
  useEffect(() => {
    setExpressionRef.current = builderState?.setExpression;
  });

  useEffect(() => {
    if (!builderState || builderState.mode !== 'builder') return;
    const generated = generateExpressionFromChain(chainState);
    // Only propagate if different from current expression to avoid loops
    if (generated !== lastHydratedExpressionRef.current) {
      lastHydratedExpressionRef.current = generated;
      setExpressionRef.current?.(generated);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainState]);

  // FS-038 T-13: Chain state update handlers
  const handleEntryTypeChange = useCallback((type: BuilderEntryType) => {
    setChainState((prev) => ({
      ...createEmptyChainState(),
      entryType: type,
      sourcePath: type === 'source' ? prev.sourcePath : undefined,
    }));
  }, []);

  const handleSourceSelect = useCallback((path: string) => {
    setChainState((prev) => ({
      ...prev,
      sourcePath: inputPathToChainSourcePath(path),
    }));
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
      expandedStepIndex: prev.logicSteps.length,
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

  const sourceOptions = (() => {
    const primary = parsedSourceSchema
      ? flattenSchemaPaths(parsedSourceSchema).map((entry) => ({
        ...entry,
        inputKind: 'primary' as const,
        expression: `source("${entry.path}")`,
      }))
      : [];

    const enrichments = enrichmentInputGroups.flatMap((group) => {
      if (!group.parsedSchema) return [];
      return flattenSchemaPaths(group.parsedSchema).map((entry) => ({
        ...entry,
        displayPath: `${group.alias}.${entry.path}`,
        inputKind: 'enrichment' as const,
        alias: group.alias,
        expression: `get(external("${group.alias}"), "${entry.path}")`,
      }));
    });

    return [...primary, ...enrichments];
  })();
  const currentValueLabel = chainState.sourcePath ?? 'the current value';
  const selectedTargetPath = builderState?.selectedRule?.target ?? '';

  // No rule selected — show empty state
  if (builderState === null || builderState.selectedRule === null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-zinc-400 text-center">
          Select a rule to edit its expression, or add a new rule.
        </p>
      </div>
    );
  }

  const {
    mode,
    switchToEditor,
    switchToBuilder,
    dismissDecompositionWarning,
    forceBuilder,
    hasUnsavedChanges,
    expression,
    setExpression,
    errorDecorations,
    decompositionWarning,
  } = builderState;

  /** Insert a function from the reference panel into the active mode. */
  const handleInsertFunction = (functionName: string) => {
    if (mode === 'editor') {
      rawDslRef.current?.insertText(`${functionName}()`);
    }
    // Builder mode: no direct function insertion
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header: mode toggle */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-700 shrink-0">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          Expression
        </span>
        <ModeToggle
          mode={mode}
          onSwitchToBuilder={switchToBuilder}
          onSwitchToEditor={switchToEditor}
        />
      </div>

      {/* Decomposition warning (AE-07): shown when Editor → Builder attempt fails */}
      {decompositionWarning !== null && (
        <div className="px-3 pt-3 shrink-0" data-testid="decomposition-warning-container">
          <ComplexExpressionWarning
            reason={decompositionWarning}
            onStayInEditor={dismissDecompositionWarning}
            onTryBuilder={forceBuilder}
          />
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden p-3">
        {mode === 'editor' ? (
          <div data-testid="expression-editor-slot">
            <RawDslEditor
              ref={rawDslRef}
              value={expression}
              onChange={setExpression}
              placeholder="Enter a DSL expression…"
              className="w-full"
              errorDecorations={errorDecorations}
            />
          </div>
        ) : (
          /* FS-038 T-13: New chain builder surface for Rules View */
          <div data-testid="expression-builder-slot" className="h-full overflow-y-auto">
            <ChainBuilderShell
              key={selectedTargetPath}
              targetPath={selectedTargetPath}
              targetType="string"
              isRequired={false}
              expression={expression}
              result={null}
              isEvaluating={false}
              sourceDataAvailable={resolvedSourceData !== null}
              isMapped={expression !== ''}
              isBuilderMode={true}
              onToggleMode={switchToEditor}
              onClearMapping={() => { setExpression(''); }}
              onExpressionClick={switchToEditor}
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
                  targetType="string"
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

      {/* Expression Preview */}
      <div className="px-3 pb-2 shrink-0">
        <ExpressionPreview
          expression={expression}
          result={preview.result}
          error={preview.error}
          isEvaluating={preview.isEvaluating}
          hasSourceData={resolvedSourceData !== null && resolvedSourceData !== undefined}
        />
      </div>

      {/* Unsaved-changes indicator (AE-12) */}
      {hasUnsavedChanges && (
        <div
          role="status"
          aria-live="polite"
          className="px-4 py-1.5 text-xs text-amber-400 bg-amber-950/50 border-t border-amber-800/40 shrink-0"
        >
          ⚠ Expression has syntax errors — not saved to rule
        </div>
      )}

      {/* Function Reference Panel */}
      <div className="px-3 pb-3 shrink-0">
        <FunctionReferencePanel
          onInsertFunction={handleInsertFunction}
          mode={mode}
        />
      </div>
    </div>
  );
});
