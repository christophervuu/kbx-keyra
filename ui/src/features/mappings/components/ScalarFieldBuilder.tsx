/**
 * ScalarFieldBuilder — right panel content for scalar target field authoring.
 *
 * Shown when a scalar (non-object, non-array) target field is selected in the
 * Target Worklist. Provides:
 *   - Header: target path, type badge, required/optional label, mapping status
 *   - Suggested Sources: client-side heuristic suggestions from parsed source schema
 *   - Expression Builder: GuidedBuilder (default) or RawDslEditor (toggle)
 *   - AI Action buttons: placeholder (Coming soon tooltip)
 *   - Save button: enabled only when expression is non-empty and valid
 *
 * No preview in this panel — preview lives in the bottom area (T-08).
 */

import { Lightbulb, Sparkles, Wand2, Wrench } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { GuidedBuilder } from './GuidedBuilder';
import type { GuidedBuilderRef } from './GuidedBuilder';
import { RawDslEditor } from './RawDslEditor';
import type { RawDslEditorRef } from './RawDslEditor';
import type { TargetFieldStatus, TargetFieldType } from './TargetFieldRow';
import { suggestSourceFields } from '../lib/suggest-source-fields';
import type { SuggestedField } from '../lib/suggest-source-fields';
import { useDslValidation } from '../hooks/use-dsl-validation';
import { useDropZone } from '../hooks/use-drop-zone';

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
  /** Fired when the user saves the expression */
  onSave: (targetPath: string, expression: string) => void;
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
  onSave,
  className = '',
}: ScalarFieldBuilderProps) {
  const [expression, setExpression] = useState(currentExpression);
  const [mode, setMode] = useState<'builder' | 'editor'>('builder');

  const rawDslRef = useRef<RawDslEditorRef>(null);
  const guidedBuilderRef = useRef<GuidedBuilderRef>(null);

  // Reset expression when target field changes
  useEffect(() => {
    setExpression(currentExpression);
    setMode('builder');
  }, [selectedTargetPath, currentExpression]);

  const { isValid, isValidating, errorDecorations } = useDslValidation(expression);

  const suggestions = suggestSourceFields(
    selectedTargetPath,
    selectedTargetType,
    parsedSourceSchema,
  );

  const handleInsertSourceField = useCallback(
    (path: string) => {
      const snippet = `source("${path}")`;
      if (mode === 'editor') {
        rawDslRef.current?.insertText(snippet);
      } else {
        guidedBuilderRef.current?.insertSourceField(path);
      }
    },
    [mode],
  );

  // Alias for suggestion pill clicks (same behaviour)
  const handleSuggestionSelect = handleInsertSourceField;

  const { isDragOver, dropHandlers } = useDropZone({ onDrop: handleInsertSourceField });

  const handleSave = useCallback(() => {
    if (expression.trim() && isValid) {
      onSave(selectedTargetPath, expression);
    }
  }, [expression, isValid, onSave, selectedTargetPath]);

  const canSave = expression.trim().length > 0 && isValid && !isValidating;

  return (
    <div
      data-testid="scalar-field-builder"
      className={`flex flex-col gap-0 overflow-y-auto ${className}`}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header: target context                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="shrink-0 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Target path */}
          <span
            className="min-w-0 flex-1 truncate font-mono text-sm text-slate-100"
            title={selectedTargetPath}
            data-testid="header-target-path"
          >
            {selectedTargetPath}
          </span>

          {/* Type badge */}
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE_CLASSES[selectedTargetType]}`}
            data-testid="header-type-badge"
          >
            {selectedTargetType}
          </span>
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
      {/* Suggested Sources                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="shrink-0 border-b border-slate-700 px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Lightbulb size={12} className="text-slate-500" aria-hidden="true" />
          <span className="text-xs font-medium text-slate-400">Suggested Sources</span>
        </div>

        {suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" data-testid="suggestions-list">
            {suggestions.map((s) => (
              <SuggestionPill key={s.path} suggestion={s} onSelect={handleSuggestionSelect} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500" data-testid="suggestions-empty">
            No suggestions — select a source field manually
          </p>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Expression Builder                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Expression
        </span>
        <ModeToggle mode={mode} onSwitch={setMode} />
      </div>

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
          <div data-testid="expression-builder-slot">
            <GuidedBuilder
              ref={guidedBuilderRef}
              expression={expression}
              onExpressionChange={setExpression}
              parsedSourceSchema={parsedSourceSchema}
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

          {/* Spacer */}
          <span className="flex-1" />

          {/* Save button */}
          <button
            type="button"
            data-testid="save-btn"
            disabled={!canSave}
            onClick={handleSave}
            className={[
              'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              canSave
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'cursor-not-allowed bg-slate-700 text-slate-500',
            ].join(' ')}
          >
            <Wand2 size={12} aria-hidden="true" />
            Save mapping
          </button>
        </div>
      </div>
    </div>
  );
}
