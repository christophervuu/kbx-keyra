/**
 * ScalarFieldBuilder — right panel content for scalar target field authoring.
 *
 * Shown when a scalar (non-object, non-array) target field is selected in the
 * Target Worklist. Provides:
 *   - Header: target path, type badge, required/optional label, mapping status
 *   - Suggested Sources: client-side heuristic suggestions from parsed source schema
 *   - Expression Builder: UnifiedExpressionBuilder (default) or RawDslEditor (toggle)
 *   - AI Action buttons: placeholder (Coming soon tooltip)
 *   - Save button: enabled only when expression is non-empty and valid
 *
 * No preview in this panel — preview lives in the bottom area (T-08).
 */

import { Check, ChevronRight, Lightbulb, Sparkles, Wand2, Wrench } from 'lucide-react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { UnifiedExpressionBuilder } from './UnifiedExpressionBuilder';
import { RawDslEditor } from './RawDslEditor';
import type { RawDslEditorRef } from './RawDslEditor';
import { ComplexExpressionWarning } from './ComplexExpressionWarning';
import type { TargetFieldStatus, TargetFieldType } from './TargetFieldRow';
import { suggestSourceFields } from '../lib/suggest-source-fields';
import type { SuggestedField } from '../lib/suggest-source-fields';
import { useDslValidation } from '../hooks/use-dsl-validation';
import { useDropZone } from '../hooks/use-drop-zone';
import { decomposeExpression as decomposeExpressionNew } from '../lib/pipeline-decomposer';
import type { ExpressionBuilderState } from '../lib/expression-builder-state';
import { PreviewContext } from '../context/preview-context';

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
  /** Current expression for this target (pre-fills the builder) */
  currentExpression?: string;
  /** Parsed source schema for suggestions and field picker */
  parsedSourceSchema: ParsedSchema | null;
  /** Fired when the user applies the expression */
  onApply: (targetPath: string, expression: string) => void;
  /**
   * Optional callback fired whenever the local expression text changes.
   * Used by the parent to track unapplied expression state for navigation guards.
   */
  onExpressionChange?: (expression: string) => void;
  /**
   * Fires when the user clicks "Next unmapped →" or presses Ctrl+].
   * The composition layer handles finding and selecting the next unmapped field.
   */
  onAdvanceToNext?: () => void;
  /**
   * Whether any unmapped target fields remain.
   * Controls visibility of the "Next unmapped →" button.
   */
  hasUnmappedFields?: boolean;
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

function normalizeExpression(value: string): string {
  return value.trim();
}

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

/**
 * ScalarFieldBuilder — right panel for scalar target field authoring.
 */
export function ScalarFieldBuilder({
  selectedTargetPath,
  selectedTargetType,
  selectedTargetRequired,
  currentStatus,
  currentExpression = '',
  parsedSourceSchema,
  onApply,
  onExpressionChange,
  onAdvanceToNext,
  hasUnmappedFields = false,
  onClearMapping,
  className = '',
}: ScalarFieldBuilderProps) {
  const [expression, setExpression] = useState(currentExpression);
  const [mode, setMode] = useState<'builder' | 'editor'>('builder');
  const [decompositionWarning, setDecompositionWarning] = useState<string | null>(null);
  const [initialUnifiedBuilderState, setInitialUnifiedBuilderState] = useState<ExpressionBuilderState | null>(null);
  // Track whether the current expression has been applied (AE-10)
  const [appliedExpression, setAppliedExpression] = useState<string | null>(null);
  const prevHydratedTargetRef = useRef<string>(selectedTargetPath);

  // Keep onExpressionChange in a ref to avoid stale closure issues
  const onExpressionChangeRef = useRef(onExpressionChange);
  useEffect(() => {
    onExpressionChangeRef.current = onExpressionChange;
  });

  const handleExpressionChange = useCallback((next: string) => {
    // Ignore no-op emissions from builder/editor re-hydration so
    // the Applied visual state is not cleared spuriously.
    if (next === expression) {
      return;
    }

    setExpression(next);
    // Reset applied state only on real expression changes (AE-10)
    setAppliedExpression(null);
    onExpressionChangeRef.current?.(next);
  }, [expression]);

  const rawDslRef = useRef<RawDslEditorRef>(null);

  // Hydrate builder state when target field or its expression changes
  useEffect(() => {
    const expr = currentExpression ?? '';
    const targetChanged = selectedTargetPath !== prevHydratedTargetRef.current;

    setExpression(expr);
    if (targetChanged) {
      // Clear applied state when navigating to a different target field.
      // For same-field parent re-sync, keep applied visual state sticky.
      setAppliedExpression(null);
    }
    prevHydratedTargetRef.current = selectedTargetPath;

    if (!expr) {
      // Unmapped / empty → reset to default empty builder state
      setDecompositionWarning(null);
      setInitialUnifiedBuilderState(null);
      setMode('builder');
      return;
    }

    // Attempt decomposition
    const result = decomposeExpressionNew(expr);
    if (result.success) {
      setInitialUnifiedBuilderState(result.state);
      setDecompositionWarning(null);
      setMode('builder');
    } else {
      // Decomposition failed → Editor mode with warning
      setInitialUnifiedBuilderState(null);
      setDecompositionWarning(result.reason ?? 'Expression cannot be loaded into the guided builder.');
      setMode('editor');
    }
  }, [selectedTargetPath, currentExpression]);

  const { isValid, isValidating, errorDecorations } = useDslValidation(expression);
  const isDirty = normalizeExpression(expression) !== normalizeExpression(currentExpression ?? '');

  // Read sourceData from PreviewContext for live result display (T-10)
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
      }
      // In builder mode, UnifiedExpressionBuilder manages its own state
    },
    [mode],
  );

  // Alias for suggestion pill clicks (same behaviour)
  const handleSuggestionSelect = handleInsertSourceField;

  const { isDragOver, dropHandlers } = useDropZone({ onDrop: handleInsertSourceField });

  const handleSave = useCallback(() => {
    if (expression.trim() && isValid) {
      onApply(selectedTargetPath, expression);
      setAppliedExpression(expression);
    }
  }, [expression, isValid, onApply, selectedTargetPath]);

  // Ctrl+] / Cmd+] → advance to next unmapped field (AE-12)
  const onAdvanceToNextRef = useRef(onAdvanceToNext);
  useEffect(() => {
    onAdvanceToNextRef.current = onAdvanceToNext;
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === ']') {
        e.preventDefault();
        onAdvanceToNextRef.current?.();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); };
  }, []);

  const isApplied = appliedExpression !== null && appliedExpression === expression;
  const canSave =
    isDirty && expression.trim().length > 0 && isValid && !isValidating && !isApplied;

  return (
    <div
      data-testid="scalar-field-builder"
      className={`flex flex-col gap-0 overflow-y-auto ${className}`}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header: target context + Builder|Editor toggle (T-07)              */}
      {/* ------------------------------------------------------------------ */}
      <div className="shrink-0 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Type badge — left side (T-07) */}
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

          {/* Builder | Editor toggle — in header row (T-07) */}
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
      {/* Suggested Sources — hidden when empty (T-07)                        */}
      {/* ------------------------------------------------------------------ */}
      {suggestions.length > 0 && (
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
        {/* Decomposition warning banner (AE-05) */}
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
          <div data-testid="expression-builder-slot">
            <UnifiedExpressionBuilder
              key={selectedTargetPath}
              expression={expression}
              onExpressionChange={handleExpressionChange}
              onApply={onApply}
              selectedTargetPath={selectedTargetPath}
              parsedSourceSchema={parsedSourceSchema}
              sourceData={sourceData}
              onSwitchToEditor={() => { setMode('editor'); }}
              initialState={initialUnifiedBuilderState}
            />
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* AI Actions + Save                                                   */}
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

          {/* Clear mapping button (T-08) — only shown when target has an applied rule */}
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

          {/* Next unmapped → button (AE-11) */}
          {hasUnmappedFields && onAdvanceToNext && (
            <button
              type="button"
              data-testid="next-unmapped-btn"
              onClick={onAdvanceToNext}
              aria-label="Navigate to next unmapped target field"
              className="flex items-center gap-1 rounded border border-slate-600 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-blue-500 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              Next unmapped
              <ChevronRight size={12} aria-hidden="true" />
            </button>
          )}

          {/* Apply button */}
          <button
            type="button"
            data-testid="apply-btn"
            disabled={!canSave}
            onClick={handleSave}
            className={[
              'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              isApplied
                ? 'cursor-default bg-green-800/60 text-green-300'
                : canSave
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'cursor-not-allowed bg-slate-700 text-slate-500',
            ].join(' ')}
          >
            {isApplied ? (
              <>
                <Check size={12} aria-hidden="true" />
                Applied
              </>
            ) : (
              <>
                <Wand2 size={12} aria-hidden="true" />
                Apply
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
