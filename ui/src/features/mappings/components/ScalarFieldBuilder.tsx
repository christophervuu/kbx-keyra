/**
 * ScalarFieldBuilder — right panel content for scalar target field authoring.
 *
 * Shown when a scalar (non-object, non-array) target field is selected in the
 * Target Worklist. Provides:
 *   - Header: target path, type badge, required/optional label, mapping status,
 *             Builder|Editor toggle, ⋮ overflow menu (Remove mapping)
 *   - Feedback Area: pinned Expression / Result / Validation (FS-040 T-02)
 *   - Expression Builder: ChainBuilderShell (new, default) or RawDslEditor (toggle)
 *   - AI Action buttons: placeholder with descriptive tooltips (FS-040 T-04)
 *   - Reset draft button: clears expression with confirmation for non-trivial expressions
 *   - Discard changes button: visible when current field has an unsaved draft
 *
 * FS-039 T-05: Auto-draft model — every expression change calls updateDraft().
 * Apply button and Next unmapped button removed. Header Save commits all drafts.
 *
 * FS-038 T-12: Integrates the new chain builder (ChainBuilderShell + chain state)
 * replacing UnifiedExpressionBuilder in Builder mode. UnifiedExpressionBuilder is
 * retained for Rules View (T-13) and as a fallback.
 *
 * FS-040 T-04: Action row redesign — Reset draft (with confirmation), Remove mapping
 * moved to header overflow menu (⋮), AI tooltips updated.
 */

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Circle, Lightbulb, Loader2, MoreVertical, RotateCcw, Sparkles, Undo2, Wrench, XCircle } from 'lucide-react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { RawDslEditor } from './RawDslEditor';
import type { RawDslEditorRef } from './RawDslEditor';
import { ComplexExpressionWarning } from './ComplexExpressionWarning';
import { ChainBuilderShell } from './ChainBuilderShell';
import { ChainSourceCard } from './ChainSourceCard';
import { StaticValueInput } from './StaticValueInput';
import { LogicStepList } from './LogicStepList';
import { BuilderFeedbackArea } from './BuilderFeedbackArea';
import { ValidationSummaryRow } from './ValidationSummaryRow';
import { ExplanationPanel } from './ExplanationPanel';
import { SuggestExpressionInline } from './SuggestExpressionInline';
import type { TargetFieldStatus, TargetFieldType } from './TargetFieldRow';
import { useDslValidation } from '../hooks/use-dsl-validation';
import { useDropZone } from '../hooks/use-drop-zone';
import { useBuilderValidation } from '../hooks/use-builder-validation';
import { useExplainRule } from '../hooks/use-explain-rule';
import { useSuggestExpression } from '../hooks/use-suggest-expression';
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
import { decomposeToChain } from '../lib/chain-decomposer';
import { toLegacyChainBuilderState } from '../lib/chain-legacy-adapter';
import type { LogicKind } from './AddLogicPicker';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';

import type { ParsedSchema, MappingRule, SchemaTreeNode } from '@/lib/types/domain';

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
   * Source field path staged from SourceSchemaPanel click-to-select.
   * When provided, the builder inserts/selects this source path.
   */
  stagedSourcePath?: string | null;
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
  /**
   * Last-saved rules from useMappingEditor.savedRules.
   * Used by useUnsavedDiff to compute the per-field diff state (FS-040 T-05).
   * Defaults to empty array when not provided (diff panel shows 'no-mapping').
   */
  savedRules?: readonly MappingRule[];
  /** Optional className */
  className?: string;
  /** Number of unsaved field-level draft changes for View changes button */
  unsavedChangeCount?: number;
  /** Opens the unsaved changes modal */
  onViewUnsavedChanges?: () => void;
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

const AI_EXPLAIN_TOOLTIP = 'Explain this expression using AI';
const AI_FIX_TOOLTIP = 'AI-powered fix suggestions \u2014 available in a future release';

/** Regex for a trivial bare source reference — no confirmation needed on reset */
const TRIVIAL_EXPRESSION_RE = /^source\("[^"]*"\)$/;

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

interface ScalarEntryOption {
  readonly type: BuilderEntryType;
  readonly label: string;
  readonly description: string;
  readonly disabled?: boolean;
  readonly tooltip?: string;
}

const SCALAR_ENTRY_OPTIONS: readonly ScalarEntryOption[] = [
  {
    type: 'source',
    label: 'Source field',
    description: 'Use a field from the source schema',
  },
  {
    type: 'static',
    label: 'Static value',
    description: 'Use a literal value for this target field',
  },
  {
    type: 'external',
    label: 'External',
    description: 'Use an external data source',
    disabled: true,
    tooltip: 'External data sources — available in a future release',
  },
];

function ScalarEntryModeSelector({
  selectedType,
  onSelect,
}: {
  selectedType: BuilderEntryType | null;
  onSelect: (type: BuilderEntryType) => void;
}) {
  return (
    <div className="space-y-1.5" data-testid="scalar-entry-mode-selector">
      {SCALAR_ENTRY_OPTIONS.map((option) => {
        const isSelected = selectedType === option.type;
        return (
          <button
            key={option.type}
            type="button"
            disabled={option.disabled}
            title={option.tooltip}
            aria-pressed={isSelected}
            data-testid={`scalar-entry-mode-${option.type}`}
            onClick={() => {
              if (!option.disabled) {
                onSelect(option.type);
              }
            }}
            className={[
              'flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900',
              option.disabled
                ? 'cursor-not-allowed border-slate-700 bg-slate-800/20 text-slate-600 opacity-50'
                : isSelected
                  ? 'border-blue-500 bg-blue-950/40 text-slate-100'
                  : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-500 hover:bg-slate-800/70 hover:text-slate-100',
            ].join(' ')}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold leading-tight">{option.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">
                {option.description}
              </span>
            </span>
            {isSelected && !option.disabled && (
              <span
                aria-hidden="true"
                className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-blue-400"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Header overflow menu (⋮) — contains destructive actions like "Remove mapping".
 * Only rendered when there are applicable overflow actions.
 */
function HeaderOverflowMenu({
  targetPath,
  onRemoveMapping,
}: {
  targetPath: string;
  onRemoveMapping: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => { document.removeEventListener('mousedown', handleOutside); };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        data-testid="header-overflow-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        onClick={() => { setOpen((prev) => !prev); }}
        className="flex items-center justify-center rounded p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
      >
        <MoreVertical size={14} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          data-testid="header-overflow-menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded border border-slate-700 bg-slate-900 py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="remove-mapping-btn"
            aria-label={`Remove saved mapping for ${targetPath}`}
            onClick={() => {
              setOpen(false);
              setConfirmingRemove(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-400 transition-colors hover:bg-slate-800 hover:text-red-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-red-500"
          >
            Remove mapping
          </button>
        </div>
      )}

      {/* Remove mapping confirmation dialog */}
      {confirmingRemove && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="remove-mapping-dialog-title"
          aria-describedby="remove-mapping-dialog-desc"
          data-testid="remove-mapping-dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        >
          <div className="w-80 rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h2
              id="remove-mapping-dialog-title"
              className="mb-2 text-sm font-semibold text-slate-100"
            >
              Remove mapping
            </h2>
            <p
              id="remove-mapping-dialog-desc"
              className="mb-4 text-xs text-slate-400"
            >
              Remove mapping for <span className="font-mono text-slate-200">{targetPath}</span>? This will delete the saved rule.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                data-testid="remove-mapping-cancel"
                onClick={() => { setConfirmingRemove(false); }}
                className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="remove-mapping-confirm"
                onClick={() => {
                  setConfirmingRemove(false);
                  onRemoveMapping();
                }}
                className="rounded border border-red-700 bg-red-900/40 px-3 py-1.5 text-xs text-red-300 transition-colors hover:border-red-600 hover:bg-red-900/60 hover:text-red-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source context formatting (for SuggestExpression)
// ---------------------------------------------------------------------------

/**
 * Converts a ParsedSchema tree into a newline-separated text block of leaf
 * field paths and types, capped at 200 entries.
 * Format: "- {path} ({type})"
 */
function formatSourceContext(parsedSourceSchema: ParsedSchema | null): string {
  if (!parsedSourceSchema?.nodes) return '';
  const lines: string[] = [];
  function walk(nodes: SchemaTreeNode[]) {
    for (const node of nodes) {
      if (lines.length >= 200) return;
      if (node.children && node.children.length > 0) {
        walk(node.children);
      } else {
        lines.push(`- ${node.path} (${node.type})`);
      }
    }
  }
  walk(parsedSourceSchema.nodes);
  return lines.join('\n');
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
  stagedSourcePath = null,
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
  const hasHydratedTargetRef = useRef(false);
  const skipNextBuilderEmissionRef = useRef(false);
  const hydrationPathRef = useRef(selectedTargetPath);

  if (hydrationPathRef.current !== selectedTargetPath) {
    hydrationPathRef.current = selectedTargetPath;
    hasHydratedTargetRef.current = false;
  }

  // FS-038 T-12: Chain builder state
  const [chainState, setChainState] = useState<ChainBuilderState>(() => createEmptyChainState());
  const [hasSelectedEntryType, setHasSelectedEntryType] = useState(false);
  const [isEntryQuestionExpanded, setIsEntryQuestionExpanded] = useState(true);
  // Whether the add-logic picker is open (shown below source card / static input)
  const [addLogicPickerOpen, setAddLogicPickerOpen] = useState(false);

  // FS-040 T-04: Reset draft confirmation state
  const [confirmingReset, setConfirmingReset] = useState(false);

  // FS-041: Explain Rule hook
  const { state: explainState, explain, dismiss: dismissExplain } = useExplainRule();

  // Reset explanation when the selected field changes (AE-09)
  useEffect(() => {
    dismissExplain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTargetPath]);

  // FS-042: Suggest Expression hook
  const {
    state: suggestState,
    openInput: openSuggestInput,
    generate: generateSuggestion,
    dismiss: dismissSuggest,
    reset: resetSuggest,
  } = useSuggestExpression();

  // Reset suggestion panel when the selected field changes
  useEffect(() => {
    resetSuggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTargetPath]);

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

  const hydrateFromExpression = useCallback((expr: string, options?: { warningOnFailure?: boolean }) => {
    const warningOnFailure = options?.warningOnFailure ?? false;
    hasHydratedTargetRef.current = false;
    skipNextBuilderEmissionRef.current = true;
    setExpression(expr);

    if (!expr) {
      setDecompositionWarning(null);
      setChainState(createEmptyChainState());
      setHasSelectedEntryType(false);
      setMode('builder');
      hasHydratedTargetRef.current = true;
      return;
    }

    const chainResult = decomposeToChain(expr);
    if ('chain' in chainResult) {
      setChainState(toLegacyChainBuilderState(chainResult.chain));
      setHasSelectedEntryType(true);
      setDecompositionWarning(null);
      setMode('builder');
      hasHydratedTargetRef.current = true;
      return;
    }

    const result = decomposeExpressionNew(expr);
    if (result.success) {
      setDecompositionWarning(null);
      setChainState(createEmptyChainState());
      setMode('editor');
      hasHydratedTargetRef.current = true;
      return;
    }

    const sourceCardResult = decomposeToSourceCardState(expr);
    if (sourceCardResult !== null) {
      setDecompositionWarning(null);
      setChainState(createEmptyChainState());
      setMode('editor');
      hasHydratedTargetRef.current = true;
      return;
    }

    setChainState(createEmptyChainState());
    setDecompositionWarning(
      warningOnFailure ? (result.reason ?? 'Expression cannot be loaded into the guided builder.') : null,
    );
    setMode('editor');
    hasHydratedTargetRef.current = true;
  }, []);

  const rawDslRef = useRef<RawDslEditorRef>(null);

  // FS-038 T-12: Propagate chain expression whenever chain state changes
  useEffect(() => {
    if (mode !== 'builder') return;
    if (!hasHydratedTargetRef.current) {
      return;
    }
    if (skipNextBuilderEmissionRef.current) {
      skipNextBuilderEmissionRef.current = false;
      return;
    }
    const generated = generateExpressionFromChain(chainState);
    handleExpressionChange(generated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainState, mode]);

  // Hydrate builder state when target field changes.
  // Priority: draft expression → saved expression → empty state.
  useEffect(() => {
    const draftExpr = getDraftExpression(selectedTargetPath);
    const expr = draftExpr ?? currentExpression ?? '';
    prevHydratedTargetRef.current = selectedTargetPath;
    hydrateFromExpression(expr, { warningOnFailure: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTargetPath, currentExpression]);

  const { errorDecorations, parseResult, isValid: isParseValid, diagnostics } = useDslValidation(expression);

  // isDirty: current expression differs from the saved (committed) expression.
  // A draft exists when getDraftExpression returns non-null.
  const isDirty = getDraftExpression(selectedTargetPath) !== null;

  // Read sourceData from PreviewContext for live result display
  const previewCtx = useContext(PreviewContext);
  const sourceData = previewCtx?.sourceData ?? null;

  // FS-040 T-02: Two-level validation state
  const validationState = useBuilderValidation({
    builderState: null, // ChainBuilderState is not ExpressionBuilderState; structural validation deferred
    expression,
    targetType: selectedTargetType,
    mode,
    parseResult: parseResult ?? null,
    isParseValid,
  });

  // FS-051 T-04: Validation summary counts for ValidationSummaryRow
  // errorCount: parse errors + structural issues
  // warningCount: parse warnings
  // incompleteCount: 0 (scalar has no separate incomplete concept)
  const summaryErrorCount =
    diagnostics.filter((d) => d.severity === 'error').length +
    validationState.structureIssues.length;
  const summaryWarningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  const handleInsertSourceField = useCallback(
    (path: string) => {
      if (mode === 'editor') {
        rawDslRef.current?.insertText(`source("${path}")`);
      } else {
        setHasSelectedEntryType(true);
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

  useEffect(() => {
    if (stagedSourcePath === null || stagedSourcePath.trim().length === 0) return;
    handleInsertSourceField(stagedSourcePath);
  }, [stagedSourcePath, handleInsertSourceField]);

  const { isDragOver, dropHandlers } = useDropZone({ onDrop: handleInsertSourceField });

  // Discard changes: revert draft and re-hydrate from saved expression
  const handleDiscard = useCallback(() => {
    revertDraft(selectedTargetPath);
    hydrateFromExpression(currentExpression ?? '', { warningOnFailure: true });
  }, [revertDraft, selectedTargetPath, currentExpression, hydrateFromExpression]);

  // FS-040 T-04: Reset draft — clears expression and builder state.
  // Trivial expressions (empty or bare source ref) reset immediately.
  // Non-trivial expressions require confirmation via confirmingReset state.
  const isTrivialExpression = expression.trim() === '' || TRIVIAL_EXPRESSION_RE.test(expression.trim());

  const handleResetDraftRequest = useCallback(() => {
    if (isTrivialExpression) {
      // Immediate reset — no confirmation needed
      handleExpressionChange('');
      setChainState(createEmptyChainState());
      setHasSelectedEntryType(false);
      setDecompositionWarning(null);
      setMode('builder');
    } else {
      setConfirmingReset(true);
    }
  }, [isTrivialExpression, handleExpressionChange]);

  const handleResetDraftConfirm = useCallback(() => {
    setConfirmingReset(false);
    handleExpressionChange('');
    setChainState(createEmptyChainState());
    setHasSelectedEntryType(false);
    setDecompositionWarning(null);
    setMode('builder');
  }, [handleExpressionChange]);

  const handleResetDraftCancel = useCallback(() => {
    setConfirmingReset(false);
  }, []);

  // Reset draft is enabled when expression is non-empty
  const canResetDraft = expression.trim().length > 0;

  // FS-038 T-12: Chain state update handlers
  const handleEntryTypeChange = useCallback((type: BuilderEntryType) => {
    setAddLogicPickerOpen(false);
    setHasSelectedEntryType(true);
    setIsEntryQuestionExpanded(false);
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
  const selectedEntryOption = hasSelectedEntryType
    ? SCALAR_ENTRY_OPTIONS.find((option) => option.type === chainState.entryType)
    : undefined;
  const hasAnsweredEntryQuestion =
    (hasSelectedEntryType && chainState.entryType === 'source' && Boolean(chainState.sourcePath?.trim()))
    || (hasSelectedEntryType && chainState.entryType === 'static' && chainState.staticValue !== undefined);
  const shouldShowLogicLane =
    hasAnsweredEntryQuestion || chainState.logicSteps.length > 0 || addLogicPickerOpen;

  return (
    <div
      data-testid="scalar-field-builder"
      className={['flex flex-col gap-0 overflow-y-auto', className].filter(Boolean).join(' ')}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header: target context + Builder|Editor toggle                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="shrink-0 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Mapping status icon */}
          <span className={STATUS_CLASSES[currentStatus]} data-testid="header-status-icon">
            <MappingStatusIcon status={currentStatus} />
          </span>

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

          {/* ⋮ Overflow menu — only when destructive actions are applicable */}
          {currentStatus === 'mapped' && onClearMapping && (
            <HeaderOverflowMenu
              targetPath={selectedTargetPath}
              onRemoveMapping={() => { onClearMapping(selectedTargetPath); }}
            />
          )}
        </div>

        {/* Row 2: Required label */}
        <div className="mt-1 flex items-center gap-3">
          {selectedTargetRequired && (
            <span
              className="text-xs text-red-400"
              data-testid="header-required-label"
            >
              Required
            </span>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Feedback Area — Expression, Result, Validation (FS-040 T-02)      */}
      {/* Replaces the old Suggested Sources section.                        */}
      {/* ------------------------------------------------------------------ */}
      <BuilderFeedbackArea
        expression={expression}
        sourceData={sourceData}
        validationState={validationState}
        mode={mode}
        compact={true}
        collapsible={true}
        defaultCollapsed={true}
        hideValidation={true}
      />

      {/* FS-051 T-04: Validation summary row — pinned between feedback area and content */}
      <ValidationSummaryRow
        errorCount={summaryErrorCount}
        warningCount={summaryWarningCount}
        incompleteCount={0}
        testId="scalar-validation-summary"
      />

      <div
        className={[
          'min-h-0 flex-1 overflow-y-auto space-y-4 px-4 py-4 transition-colors',
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
                setHasSelectedEntryType(false);
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
              parsedSourceSchema={parsedSourceSchema}
              onExpressionAccept={(expr) => {
                updateDraft(selectedTargetPath, expr);
              }}
              showChrome={false}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400" data-testid="scalar-entry-question">
                      Where does this value come from?
                    </p>
                    <button
                      type="button"
                      data-testid="scalar-entry-question-toggle"
                      aria-expanded={isEntryQuestionExpanded}
                      onClick={() => { setIsEntryQuestionExpanded((prev) => !prev); }}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                    >
                      {isEntryQuestionExpanded ? (
                        <>
                          <ChevronDown size={11} aria-hidden="true" />
                          Collapse
                        </>
                      ) : (
                        <>
                          <ChevronRight size={11} aria-hidden="true" />
                          Change
                        </>
                      )}
                    </button>
                  </div>
                  {isEntryQuestionExpanded ? (
                    <ScalarEntryModeSelector
                      selectedType={hasSelectedEntryType ? chainState.entryType : null}
                      onSelect={handleEntryTypeChange}
                    />
                  ) : (
                    <div
                      className="rounded-lg border border-blue-500 bg-blue-950/40 px-3 py-2"
                      data-testid="scalar-entry-question-selected"
                    >
                      <p className="text-xs font-medium text-slate-100">
                        {selectedEntryOption?.label ?? 'Not selected'}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-slate-300">
                        {selectedEntryOption?.description ?? 'Choose a source, static value, or external input'}
                      </p>
                    </div>
                  )}
                </div>

                {hasSelectedEntryType && (chainState.entryType === 'source' || chainState.entryType === 'static') && (
                  <div className="h-px bg-slate-700/60" />
                )}

                {/* Source entry */}
                {hasSelectedEntryType && chainState.entryType === 'source' && (
                  <div className="space-y-2" data-testid="scalar-source-field-section">
                    <ChainSourceCard
                      sourcePath={chainState.sourcePath}
                      sourceOptions={sourceOptions.map((option) => option.path)}
                      logicStepCount={chainState.logicSteps.length}
                      onSourceSelect={handleSourceSelect}
                      onAddLogic={() => { setAddLogicPickerOpen(true); }}
                      showAddLogicButton={false}
                    />
                  </div>
                )}

                {/* Static entry */}
                {hasSelectedEntryType && chainState.entryType === 'static' && (
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
                    showAddLogicButton={false}
                  />
                )}

                {/* Logic section */}
                {shouldShowLogicLane && (
                  <div className="space-y-3" data-testid="scalar-logic-lane">
                    <div className="h-px bg-slate-700/60" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400" data-testid="scalar-logic-heading">
                      Logic
                    </p>
                    <LogicStepList
                      steps={chainState.logicSteps}
                      expandedStepIndex={chainState.expandedStepIndex}
                      onExpandedStepIndexChange={handleExpandedStepIndexChange}
                      onStepChange={handleStepChange}
                      onRemoveStep={handleRemoveStep}
                      onAddStep={handleAddStep}
                      forcePickerOpen={addLogicPickerOpen}
                      onPickerOpenChange={setAddLogicPickerOpen}
                      sourceOptions={sourceOptions}
                      currentValueLabel={currentValueLabel}
                      currentSourcePath={chainState.entryType === 'source' ? chainState.sourcePath : undefined}
                    />
                  </div>
                )}
              </div>
            </ChainBuilderShell>
          </div>
        )}
      </div>

      {/* FS-042: Inline suggest expression panel */}
      {suggestState.status !== 'idle' && (
        <div className="px-4 pb-3">
          <SuggestExpressionInline
            state={suggestState}
            targetPath={selectedTargetPath}
            targetType={selectedTargetType}
            onGenerate={(instruction) => {
              generateSuggestion({
                instruction,
                targetPath: selectedTargetPath,
                targetType: selectedTargetType,
                sourceContext: formatSourceContext(parsedSourceSchema),
              });
            }}
            onAccept={(expr) => {
              updateDraft(selectedTargetPath, expr);
              onExpressionChangeRef.current?.(expr);
              hydrateFromExpression(expr, { warningOnFailure: false });
              dismissSuggest();
            }}
            onDismiss={dismissSuggest}
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* AI Actions + Reset draft + Discard (FS-040 T-04)                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="shrink-0 border-t border-slate-700 px-4 py-2" data-testid="builder-action-row">
        {/* Reset draft confirmation prompt — inline, shown above action row */}
        {confirmingReset && (
          <div
            data-testid="reset-draft-confirm-prompt"
            className="mb-2 flex items-center gap-2 rounded border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-xs"
          >
            <span className="flex-1 text-amber-300">Reset draft? Your current expression will be cleared.</span>
            <button
              type="button"
              data-testid="reset-draft-confirm"
              onClick={handleResetDraftConfirm}
              className="rounded border border-amber-600 px-2 py-1 text-amber-300 transition-colors hover:border-amber-500 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              Reset
            </button>
            <button
              type="button"
              data-testid="reset-draft-cancel"
              onClick={handleResetDraftCancel}
              className="rounded border border-slate-600 px-2 py-1 text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* AI action buttons — placeholders with descriptive tooltips */}
          <button
            type="button"
            onClick={() => { openSuggestInput(); }}
            title="Generate a DSL expression from natural language"
            aria-label="Suggest expression"
            data-testid="ai-suggest-btn"
            className={[
              'flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              suggestState.status === 'inputting' || suggestState.status === 'loading'
                ? 'cursor-pointer border-blue-500/60 text-blue-300'
                : 'cursor-pointer border-slate-600 text-slate-400 hover:border-blue-500/60 hover:text-blue-300',
            ].join(' ')}
          >
            <Sparkles size={12} aria-hidden="true" />
            Suggest
          </button>
          <button
            type="button"
            disabled={!expression.trim() || explainState.status === 'loading'}
            aria-disabled={!expression.trim() || explainState.status === 'loading'}
            title={expression.trim() ? AI_EXPLAIN_TOOLTIP : 'No expression to explain'}
            aria-label={expression.trim() ? `Explain — ${AI_EXPLAIN_TOOLTIP}` : 'Explain — No expression to explain'}
            data-testid="ai-explain-btn"
            onClick={() => {
              if (expression.trim()) {
                explain({ targetPath: selectedTargetPath, expression });
              }
            }}
            className={[
              'flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              !expression.trim() || explainState.status === 'loading'
                ? 'cursor-not-allowed border-slate-700 text-slate-600 opacity-50'
                : 'cursor-pointer border-slate-600 text-slate-400 hover:border-blue-500/60 hover:text-blue-300',
            ].join(' ')}
          >
            {explainState.status === 'loading' ? (
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            ) : (
              <Lightbulb size={12} aria-hidden="true" />
            )}
            {explainState.status === 'loading' ? 'Explaining…' : 'Explain'}
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={AI_FIX_TOOLTIP}
            aria-label={`Fix — ${AI_FIX_TOOLTIP}`}
            data-testid="ai-fix-btn"
            className="flex cursor-not-allowed items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-600 opacity-50"
          >
            <Wrench size={12} aria-hidden="true" />
            Fix
          </button>

          {/* Reset draft button — clears expression; confirmation for non-trivial */}
          <button
            type="button"
            data-testid="reset-draft-btn"
            onClick={handleResetDraftRequest}
            disabled={!canResetDraft}
            aria-label="Reset current draft expression"
            className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={12} aria-hidden="true" />
            Reset draft
          </button>

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

      {/* FS-041: Inline explanation panel */}
      {(explainState.status === 'success' || explainState.status === 'error') && (
        <div className="px-4 pb-3">
          <ExplanationPanel
            state={explainState}
            onDismiss={dismissExplain}
            onRetry={() => {
              if (expression.trim()) {
                explain({ targetPath: selectedTargetPath, expression });
              }
            }}
          />
        </div>
      )}

    </div>
  );
}
