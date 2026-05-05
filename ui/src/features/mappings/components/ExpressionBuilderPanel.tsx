import { forwardRef, useContext, useImperativeHandle, useRef } from 'react';
import type { ExpressionBuilderResult, ExpressionBuilderMode } from '../hooks/use-expression-builder';
import type { ParsedSchema } from '@/lib/types/domain';
import { useExpressionPreview } from '../hooks/use-expression-preview';
import { PreviewContext } from '../context/preview-context';
import { ComplexExpressionWarning } from './ComplexExpressionWarning';
import { ExpressionPreview } from './ExpressionPreview';
import { FunctionReferencePanel } from './FunctionReferencePanel';
import { UnifiedExpressionBuilder } from './UnifiedExpressionBuilder';
import { RawDslEditor } from './RawDslEditor';
import type { RawDslEditorRef } from './RawDslEditor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpressionBuilderPanelRef {
  /**
   * Insert a source field path from Panel 1 (Schema Tree) into the active mode.
   * - Editor mode: inserts `source("path")` at cursor position in RawDslEditor.
   * - Builder mode: no-op (UnifiedExpressionBuilder manages its own source state).
   */
  insertSourceField: (path: string) => void;
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
  function ExpressionBuilderPanel({ builderState, parsedSourceSchema = null, sampleSourceData = null }, ref) {
  const rawDslRef = useRef<RawDslEditorRef>(null);

  // Expose insertSourceField to parent via ref
  useImperativeHandle(ref, () => ({
    insertSourceField(path: string) {
      if (!builderState || builderState.selectedRule === null) return;
      if (builderState.mode === 'editor') {
        rawDslRef.current?.insertText(`source("${path}")`);
      }
      // Builder mode: UnifiedExpressionBuilder manages its own source state
    },
  }), [builderState]);

  // Read sourceData from PreviewContext when available (FS-012 T-13).
  // Falls back to the sampleSourceData prop so the component remains usable
  // outside <PreviewProvider> (e.g. isolated unit tests).
  const previewCtx = useContext(PreviewContext);
  const resolvedSourceData = previewCtx?.sourceData ?? sampleSourceData ?? null;

  // Derive expression for preview — safe even when no rule is selected
  const previewExpression = builderState?.expression ?? '';
  const preview = useExpressionPreview({
    expression: previewExpression,
    sourceData: resolvedSourceData,
  });

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
    initialBuilderState: _initialBuilderState,
    initialUnifiedBuilderState,
  } = builderState;

  /** Insert a function from the reference panel into the active mode. */
  const handleInsertFunction = (functionName: string) => {
    if (mode === 'editor') {
      rawDslRef.current?.insertText(`${functionName}()`);
    }
    // Builder mode: no direct function insertion in UnifiedExpressionBuilder
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

      {/* Content area — editor mode uses RawDslEditor; builder mode uses GuidedBuilder */}
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
          <div data-testid="expression-builder-slot" className="h-full overflow-y-auto">
            <UnifiedExpressionBuilder
              expression={expression}
              onExpressionChange={setExpression}
              onApply={() => {}}
              selectedTargetPath={builderState.selectedRule?.target ?? ''}
              parsedSourceSchema={parsedSourceSchema}
              sourceData={resolvedSourceData}
              onSwitchToEditor={switchToEditor}
              initialState={initialUnifiedBuilderState}
            />
          </div>
        )}
      </div>

      {/* Expression Preview (AE-08, T-10) */}
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

      {/* Function Reference Panel (AE-11, T-09) */}
      <div className="px-3 pb-3 shrink-0">
        <FunctionReferencePanel
          onInsertFunction={handleInsertFunction}
          mode={mode}
        />
      </div>
    </div>
  );
});

