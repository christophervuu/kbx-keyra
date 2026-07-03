/**
 * ArrayBuilder.tsx — FS-043 T-04 / T-10 / FS-051 T-01
 *
 * New right-panel component for array-type target fields.
 * Replaces ArrayMappingBuilder.tsx with the chain-aligned two-layer builder.
 *
 * FS-051 T-01 additions:
 *   - Builder/Editor mode toggle in header (matching ScalarFieldBuilder pattern)
 *   - Overflow menu (⋮) in header with "Remove mapping" action
 *   - Editor mode renders RawDslEditor with parse status + error list
 *   - Builder→Editor: generates current expression into RawDslEditor
 *   - Editor→Builder: attempts decomposeArrayExpression(); failure shows warning banner
 *   - Unrecognized saved expression defaults to Editor mode with amber banner
 *   - Custom Expression mode card removed from ArrayModeSelector (see ArrayModeSelector.tsx)
 *
 * Layout (outer builder):
 *   ┌─────────────────────────────────────────────┐
 *   │ Header: status · badge · path · toggle · ⋮  │
 *   │         Required + completion status         │
 *   ├─────────────────────────────────────────────┤
 *   │ BuilderFeedbackArea (pinned)                 │
 *   ├─────────────────────────────────────────────┤
 *   │ ValidationSummaryRow (pinned)                │
 *   ├─────────────────────────────────────────────┤
 *   │ Scrollable content:                          │
 *   │   [Builder mode]                             │
 *   │     ArrayModeSelector                        │
 *   │     ─────────────────                        │
 *   │     Collection editor (mode-specific)        │
 *   │     ─────────────────                        │
 *   │     Item template layer                      │
 *   │   [Editor mode]                              │
 *   │     RawDslEditor + parse status + errors     │
 *   │     Decomposition warning banner             │
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
 *   - Item template layer (T-07)
 *   - Mode switching confirmation dialog (T-08)
 *   - Validation display (T-11)
 *   - Result preview (T-13)
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, CheckCircle2, Circle, History, Layers, MoreVertical, RotateCcw, Undo2, XCircle, ArrowLeft } from 'lucide-react';

import { ArrayModeSelector } from './ArrayModeSelector';
import { MapCollectionEditor } from './MapCollectionEditor';
import { FilterMapCollectionEditor } from './FilterMapCollectionEditor';
import { BuildFromValuesEditor } from './BuildFromValuesEditor';
import { ObjectFieldsCollectionEditor } from './ObjectFieldsCollectionEditor';
import type { BuildFromValuesTargetField } from './BuildFromValuesEditor';
import { MergeBranchesEditor } from './MergeBranchesEditor';
import { ItemTemplateEditor } from './ItemTemplateEditor';
import { ModeSwitchConfirmDialog } from './ModeSwitchConfirmDialog';
import { RawDslEditor } from './RawDslEditor';
import { useDslValidation } from '../hooks/use-dsl-validation';
import { useDslAutocomplete } from '../hooks/use-dsl-autocomplete';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import type { TargetFieldStatus } from './TargetFieldRow';
import { useArrayBuilderState } from '../hooks/use-array-builder-state';
import { PreviewContext } from '../context/preview-context';
import type {
  ArrayBuilderMode,
  ArrayBuilderState,
  BuildFromValuesCollectionState,
  ItemFieldMapping,
  MergeBranchesCollectionState,
  ObjectFieldsCollectionState,
  SplitStringCollectionState,
} from '../lib/array-builder-state';
import { generateArrayExpression } from '../lib/array-expression-generator';
import { decomposeArrayExpression } from '../lib/array-decomposer';
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
   * Fires when the user clicks "Remove mapping" in the overflow menu.
   * The parent removes the rule from the working session.
   */
  readonly onClearMapping?: (targetPath: string) => void;
  /**
   * Reverts the in-memory draft for this target path, restoring the last
   * committed expression. Used by the Discard changes action.
   */
  readonly revertDraft?: (targetPath: string) => void;
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

// ---------------------------------------------------------------------------
// Sub-components — FS-051 T-01
// ---------------------------------------------------------------------------

/**
 * Header overflow menu (⋮) — matches ScalarFieldBuilder's HeaderOverflowMenu pattern.
 * Contains "Remove mapping" action.
 */
function HeaderOverflowMenu({
  targetPath,
  onRemoveMapping,
  mode,
  onSwitchMode,
}: {
  targetPath: string;
  onRemoveMapping?: () => void;
  mode: 'builder' | 'editor';
  onSwitchMode: (m: 'builder' | 'editor') => void;
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
            data-testid="mode-menu-toggle"
            aria-label={mode === 'builder' ? 'Switch to Editor mode' : 'Switch to Builder mode'}
            onClick={() => {
              onSwitchMode(mode === 'builder' ? 'editor' : 'builder');
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500"
          >
            {mode === 'builder' ? 'Switch to Editor' : 'Switch to Builder'}
          </button>
          {onRemoveMapping && (
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
          )}
        </div>
      )}

      {/* Remove mapping confirmation dialog */}
      {confirmingRemove && onRemoveMapping && (
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

/**
 * Parse status badge for the editor mode surface.
 */
function ParseStatusBadge({
  expression,
  hasErrors,
}: {
  expression: string;
  hasErrors: boolean;
}) {
  if (!expression.trim()) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-600" aria-hidden="true" />
        Empty
      </span>
    );
  }
  if (hasErrors) {
    return (
      <span
        data-testid="parse-status-invalid"
        className="inline-flex items-center gap-1 text-[10px] text-red-400"
      >
        <XCircle size={10} aria-hidden="true" />
        Invalid expression
      </span>
    );
  }
  return (
    <span
      data-testid="parse-status-valid"
      className="inline-flex items-center gap-1 text-[10px] text-green-400"
    >
      <CheckCircle size={10} aria-hidden="true" />
      Valid expression
    </span>
  );
}

function getLastPathSegment(path: string): string {
  const segments = path.split('.').filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SplitStringCollectionEditor({
  collectionState,
  parsedSourceSchema,
  onCollectionStateChange,
}: {
  collectionState: SplitStringCollectionState;
  parsedSourceSchema: ParsedSchema | null;
  onCollectionStateChange: (next: SplitStringCollectionState) => void;
}) {
  const stringPaths = useMemo(() => {
    if (!parsedSourceSchema) return [] as string[];
    return flattenSchemaPaths(parsedSourceSchema)
      .filter((entry) => entry.type === 'string')
      .map((entry) => entry.path);
  }, [parsedSourceSchema]);

  return (
    <div className="space-y-3" data-testid="split-string-collection-editor">
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="split-string-source">
          Source text field
        </label>
        <select
          id="split-string-source"
          value={collectionState.sourceStringPath}
          onChange={(e) => {
            onCollectionStateChange({ ...collectionState, sourceStringPath: e.target.value });
          }}
          className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        >
          <option value="">Select a string field...</option>
          {stringPaths.map((path) => (
            <option key={path} value={path}>{path}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Delimiter
          </span>
          <input
            value={collectionState.delimiter}
            onChange={(e) => {
              onCollectionStateChange({ ...collectionState, delimiter: e.target.value });
            }}
            placeholder=","
            className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          />
        </label>

        <div className="space-y-2 rounded border border-slate-700 bg-slate-900/50 px-3 py-2">
          <label className="flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={collectionState.trimItems}
              onChange={(e) => {
                onCollectionStateChange({ ...collectionState, trimItems: e.target.checked });
              }}
              className="h-3.5 w-3.5 rounded border-slate-500 bg-slate-900 text-blue-500"
            />
            Trim each item
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={collectionState.dropEmpty}
              onChange={(e) => {
                onCollectionStateChange({ ...collectionState, dropEmpty: e.target.checked });
              }}
              className="h-3.5 w-3.5 rounded border-slate-500 bg-slate-900 text-blue-500"
            />
            Drop empty items
          </label>
        </div>
      </div>
    </div>
  );
}

function CollectionEditorSlot({
  mode,
  sourceArrayPath,
  filterPredicate,
  splitStringState,
  buildFromValuesState,
  objectFieldsState,
  mergeBranchesState,
  targetArrayNode,
  validationState,
  nestingDepth,
  targetItemFields,
  rawExpression,
  isFromUnrecognized,
  canRestorePreviousDraft,
  parsedSourceSchema,
  onSourceArrayPathChange,
  onFilterPredicateChange,
  onSplitStringStateChange,
  onBuildFromValuesStateChange,
  onObjectFieldsStateChange,
  onMergeBranchesStateChange,
  onCustomExpressionChange,
  onResetToStructured,
  onRestorePreviousDraft,
}: {
  mode: ArrayBuilderMode;
  sourceArrayPath: string;
  filterPredicate: import('../lib/array-builder-state').FilterPredicateState | null;
  splitStringState: SplitStringCollectionState | null;
  buildFromValuesState: BuildFromValuesCollectionState | null;
  objectFieldsState: ObjectFieldsCollectionState | null;
  mergeBranchesState: MergeBranchesCollectionState | null;
  targetArrayNode: SchemaTreeNode | null;
  validationState: ArrayValidationState;
  nestingDepth: number;
  targetItemFields: readonly BuildFromValuesTargetField[];
  rawExpression: string;
  isFromUnrecognized: boolean;
  canRestorePreviousDraft: boolean;
  parsedSourceSchema: ParsedSchema | null;
  onSourceArrayPathChange: (path: string) => void;
  onFilterPredicateChange: (p: import('../lib/array-builder-state').FilterPredicateState) => void;
  onSplitStringStateChange: (s: SplitStringCollectionState) => void;
  onBuildFromValuesStateChange: (s: BuildFromValuesCollectionState) => void;
  onObjectFieldsStateChange: (s: ObjectFieldsCollectionState) => void;
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
          targetItemFields={targetItemFields}
          parsedSourceSchema={parsedSourceSchema}
          onCollectionStateChange={onBuildFromValuesStateChange}
        />
      );

    case 'splitString':
      return (
        <SplitStringCollectionEditor
          collectionState={
            splitStringState ?? {
              mode: 'splitString',
              sourceStringPath: '',
              delimiter: ',',
              trimItems: true,
              dropEmpty: false,
            }
          }
          parsedSourceSchema={parsedSourceSchema}
          onCollectionStateChange={onSplitStringStateChange}
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
          targetArrayNode={targetArrayNode}
          validationState={validationState}
          nestingDepth={nestingDepth}
          onCollectionStateChange={onMergeBranchesStateChange}
        />
      );

    case 'objectFields':
      return (
        <ObjectFieldsCollectionEditor
          collectionState={
            objectFieldsState ?? {
              mode: 'objectFields',
              parent: { input: { kind: 'primary' }, objectPath: '' },
              orderedChildKeys: [],
              missingBehavior: 'skip-null-or-absent',
            }
          }
          parsedSourceSchema={parsedSourceSchema}
          onCollectionStateChange={onObjectFieldsStateChange}
        />
      );

    case 'customExpression':
      // customExpression is now an internal backing store for editor mode.
      // It is no longer rendered as a collection editor slot.
      return null;
  }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ValidationSummaryRow — extracted to ValidationSummaryRow.tsx (FS-051 T-04)
// ---------------------------------------------------------------------------
// Imported above; used below as <ValidationSummaryRow ... />

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
  parentSourceArrayPath,
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
  parentSourceArrayPath: string;
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
              : { mode: 'map' as const, sourceArrayPath: '' };
    onNestedStateChange({
      ...nestedState,
      mode,
      collectionState: newCollectionState,
    });
  }

  function handleNestedSourceArrayPathChange(path: string) {
    if (nestedState.collectionState.mode !== 'map' && nestedState.collectionState.mode !== 'filterMap') return;

    let scopedPath = path;
    // Nested collection paths that are children of the parent source array should
    // be item-scoped (map(item("childArray"), ...)) rather than absolute source().
    if (parentSourceArrayPath.trim() && path.startsWith(`${parentSourceArrayPath}.`)) {
      scopedPath = `__item__:${path.slice(parentSourceArrayPath.length + 1)}`;
    }

    onNestedStateChange({
      ...nestedState,
      collectionState: { ...nestedState.collectionState, sourceArrayPath: scopedPath },
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

        {/* Nested item template */}
        {showNestedItemTemplate && (
          <>
            <div className="h-px bg-slate-700/60" />
            <ItemTemplateEditor
              itemTemplate={nestedState.itemTemplate}
              targetArrayNode={nestedTargetNode}
              parsedSourceSchema={parsedSourceSchema}
              sourceArrayPath={nestedSourceArrayPath}
              parentSourceArrayPath={parentSourceArrayPath}
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
  onClearMapping,
  revertDraft,
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
    setSplitStringState,
    setBuildFromValuesState,
    setObjectFieldsState,
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

  // FS-051 T-01: Builder/Editor mode toggle
  // Default to 'editor' when hydrated from an unrecognized expression.
  const [builderEditorMode, setBuilderEditorMode] = useState<'builder' | 'editor'>(
    () => (isFromUnrecognized ? 'editor' : 'builder'),
  );
  const [hasSelectedCollectionMode, setHasSelectedCollectionMode] = useState(
    () => (getDraftExpression(selectedTargetPath) ?? currentExpression).trim().length > 0,
  );

  useEffect(() => {
    const hydratedExpression = getDraftExpression(selectedTargetPath) ?? currentExpression;
    setHasSelectedCollectionMode(hydratedExpression.trim().length > 0);
  }, [getDraftExpression, selectedTargetPath, currentExpression]);

  // Editor-mode DSL validation (separate from builder expression validation)
  // Raw expression backing editor mode. Declared before editorRawExpression
  // to avoid TDZ access during render.
  const rawExpression =
    state.collectionState.mode === 'customExpression'
      ? state.collectionState.rawExpression
      : '';

  const editorRawExpression =
    state.collectionState.mode === 'customExpression'
      ? state.collectionState.rawExpression
      : rawExpression;

  const {
    diagnostics: editorDiagnostics,
    isValid: editorIsValid,
    errorDecorations: editorErrorDecorations,
  } = useDslValidation(editorRawExpression);
  const editorHasErrors = !editorIsValid && editorDiagnostics.length > 0;

  // Editor-mode autocomplete
  const [editorCursorPosition, setEditorCursorPosition] = useState(0);
  const editorAutocomplete = useDslAutocomplete({
    expression: editorRawExpression,
    cursorPosition: editorCursorPosition,
    parsedSourceSchema,
  });

  // Decomposition warning: set when Editor→Builder switch fails
  const [decompositionWarning, setDecompositionWarning] = useState<string | null>(null);

  // Builder→Editor: generate current expression into editor, switch mode
  const handleSwitchToEditor = useCallback(() => {
    // expression is already up-to-date from the builder state
    switchMode('customExpression');
    setBuilderEditorMode('editor');
    setDecompositionWarning(null);
  }, [switchMode]);

  // Editor→Builder: attempt decomposition; on failure stay in editor with warning
  const handleSwitchToBuilder = useCallback(() => {
    const result = decomposeArrayExpression(editorRawExpression);
    if (!result.success) {
      setDecompositionWarning(
        result.reason ?? 'Expression could not be decomposed into builder mode.',
      );
      return;
    }
    // Hydrate builder state from decomposed result and switch
    switchMode(result.state.mode);
    setHasSelectedCollectionMode(true);
    setBuilderEditorMode('builder');
    setDecompositionWarning(null);
  }, [editorRawExpression, switchMode]);

  const handleCollectionModeSelect = useCallback((mode: ArrayBuilderMode) => {
    setHasSelectedCollectionMode(true);
    switchMode(mode);
  }, [switchMode]);

  const handleModeToggle = useCallback(
    (m: 'builder' | 'editor') => {
      if (m === 'editor') handleSwitchToEditor();
      else handleSwitchToBuilder();
    },
    [handleSwitchToEditor, handleSwitchToBuilder],
  );

  const { parseResult, isValid: isParseValid } = useDslValidation(expression);

  const previewCtx = useContext(PreviewContext);
  const sourceData = previewCtx?.sourceData ?? null;

  // Derive source array path for the collection editor
  const sourceArrayPath =
    state.collectionState.mode === 'map' || state.collectionState.mode === 'filterMap'
      ? state.collectionState.sourceArrayPath
      : state.collectionState.mode === 'splitString'
        ? state.collectionState.sourceStringPath
      : '';

  const normalizedSourceArrayPath =
    sourceArrayPath.startsWith('__item__:')
      ? sourceArrayPath.slice('__item__:'.length)
      : sourceArrayPath.startsWith('__source__:')
        ? sourceArrayPath.slice('__source__:'.length)
        : sourceArrayPath;

  const filterPredicate =
    state.collectionState.mode === 'filterMap'
      ? state.collectionState.filterPredicate
      : null;

  const buildFromValuesState =
    state.collectionState.mode === 'buildFromValues'
      ? state.collectionState
      : null;

  const splitStringState =
    state.collectionState.mode === 'splitString'
      ? state.collectionState
      : null;

  const mergeBranchesState =
    state.collectionState.mode === 'mergeArrayBranches'
      ? state.collectionState
      : null;

  const objectFieldsState =
    state.collectionState.mode === 'objectFields'
      ? state.collectionState
      : null;

  // T-12: "Reset to structured mode" — switch to map (mode selector will be shown)
  const handleResetToStructured = useCallback(() => {
    switchMode('map');
  }, [switchMode]);

  // Item template is shown for map, filterMap, and mergeArrayBranches modes
  const showItemTemplate =
    state.mode === 'map' ||
    state.mode === 'filterMap' ||
    state.mode === 'objectFields';

  const objectFieldsItemContextPaths = useMemo(() => {
    if (!objectFieldsState || !parsedSourceSchema) return [] as string[];

    const parentPath = objectFieldsState.parent.objectPath.trim();
    if (!parentPath) return ['day', 'value'];

    const contextPaths = new Set<string>(['day', 'value']);
    const schemaPaths = flattenSchemaPaths(parsedSourceSchema).map((entry) => entry.path);

    for (const childKey of objectFieldsState.orderedChildKeys) {
      const childBase = `${parentPath}.${childKey}`;
      for (const schemaPath of schemaPaths) {
        if (schemaPath === childBase) {
          contextPaths.add('value');
          continue;
        }
        if (!schemaPath.startsWith(`${childBase}.`)) continue;
        const relative = schemaPath.slice(childBase.length + 1);
        if (!relative) continue;
        contextPaths.add(`value.${relative}`);
      }
    }

    return Array.from(contextPaths);
  }, [objectFieldsState, parsedSourceSchema]);

  const buildFromValuesTargetItemFields = useMemo(() => {
    if (!targetArrayNode) return [] as BuildFromValuesTargetField[];
    return targetArrayNode.children
      .filter((child) => child.fieldName.trim().length > 0)
      .map((child) => ({
        name: child.fieldName,
        type: child.type,
        isRequired: child.isRequired,
      }));
  }, [targetArrayNode]);

  // FS-051 T-05: Action row — Reset draft + Discard changes
  const isDirty = getDraftExpression(selectedTargetPath) !== null;
  const canResetDraft = expression.trim().length > 0;
  const [confirmingReset, setConfirmingReset] = useState(false);
  const targetFieldName = getLastPathSegment(selectedTargetPath);

  const handleResetDraftRequest = useCallback(() => {
    // For arrays, any non-empty expression requires confirmation
    if (!canResetDraft) return;
    if (expression.trim() === '') {
      // Already empty — nothing to do
      return;
    }
    setConfirmingReset(true);
  }, [canResetDraft, expression]);

  const handleResetDraftConfirm = useCallback(() => {
    setConfirmingReset(false);
    switchMode('map');
    setHasSelectedCollectionMode(false);
    setBuilderEditorMode('builder');
    setDecompositionWarning(null);
    // Clear the draft by writing an empty expression
    updateDraft(selectedTargetPath, '');
  }, [switchMode, updateDraft, selectedTargetPath]);

  const handleResetDraftCancel = useCallback(() => {
    setConfirmingReset(false);
  }, []);

  const handleDiscard = useCallback(() => {
    revertDraft?.(selectedTargetPath);
    // Re-hydrate from the saved (committed) expression
    const savedExpression = currentExpression ?? '';
    setHasSelectedCollectionMode(savedExpression.trim().length > 0);
    switchMode('map');
    setBuilderEditorMode(isFromUnrecognized ? 'editor' : 'builder');
    setDecompositionWarning(null);
  }, [revertDraft, selectedTargetPath, currentExpression, switchMode, isFromUnrecognized]);

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
          parentSourceArrayPath={normalizedSourceArrayPath}
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
      <div className="shrink-0 border-b border-slate-700 px-3 py-2.5">
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

          <div className="min-w-0 flex-1">
            <span
              className="truncate font-mono text-base font-semibold text-slate-100"
              title={targetFieldName}
              data-testid="header-target-name"
            >
              {targetFieldName}
            </span>
            {selectedTargetRequired && (
              <span className="ml-1 text-sm font-semibold text-red-400" data-testid="header-required-asterisk">*</span>
            )}
          </div>

          <button
            type="button"
            data-testid="mode-toggle-undo"
            onClick={handleDiscard}
            aria-label={`Undo changes for ${selectedTargetPath}`}
            disabled={!isDirty}
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 transition-colors hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Undo2 size={12} aria-hidden="true" />
            Undo
          </button>

          {/* FS-051 T-01: Overflow menu */}
          <HeaderOverflowMenu
            targetPath={selectedTargetPath}
            onRemoveMapping={onClearMapping ? () => { onClearMapping(selectedTargetPath); } : undefined}
            mode={builderEditorMode}
            onSwitchMode={handleModeToggle}
          />
        </div>

        <div
          className="mt-0.5 truncate font-mono text-[11px] text-slate-500"
          title={selectedTargetPath}
          data-testid="header-target-path"
        >
          {selectedTargetPath}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Scrollable content                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {builderEditorMode === 'editor' ? (
          /* ---------------------------------------------------------------- */
          /* Editor mode — FS-051 T-01                                        */
          /* ---------------------------------------------------------------- */
          <div className="space-y-3" data-testid="array-builder-editor-mode">
            {/* Unrecognized expression amber banner */}
            {isFromUnrecognized && (
              <div
                data-testid="unrecognized-expression-banner"
                className="flex items-start gap-2 rounded border border-amber-700/60 bg-amber-900/20 px-3 py-2.5"
                role="alert"
              >
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
                <p className="text-[11px] leading-snug text-amber-300">
                  This expression was saved in a format the builder can't decompose. You can edit it
                  directly here, or switch to Builder mode to start fresh.
                </p>
              </div>
            )}

            {/* Decomposition failure warning */}
            {decompositionWarning !== null && (
              <div
                data-testid="decomposition-warning-banner"
                className="flex items-start gap-2 rounded border border-amber-700/60 bg-amber-900/20 px-3 py-2.5"
                role="alert"
              >
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
                <p className="text-[11px] leading-snug text-amber-300">
                  {decompositionWarning} Switch to Builder mode will reset the expression.
                </p>
              </div>
            )}

            {/* Parse status + editor */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                DSL Expression
              </span>
              <ParseStatusBadge
                expression={editorRawExpression}
                hasErrors={editorHasErrors}
              />
            </div>

            <div data-testid="array-raw-dsl-editor">
              <RawDslEditor
                value={editorRawExpression}
                onChange={setCustomExpression}
                onCursorChange={setEditorCursorPosition}
                autocomplete={editorAutocomplete}
                errorDecorations={editorErrorDecorations}
              />
            </div>

            {/* Error list */}
            {editorHasErrors && editorDiagnostics.length > 0 && (
              <ul
                data-testid="editor-error-list"
                className="space-y-1"
                aria-label="Expression errors"
              >
                {editorDiagnostics.map((err, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-[11px] text-red-400"
                  >
                    <AlertCircle size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {err.message}
                  </li>
                ))}
              </ul>
            )}

            {/* Restore previous draft action */}
            {canRestorePreviousDraft && (
              <button
                type="button"
                data-testid="restore-previous-draft-btn"
                onClick={restorePreviousDraft}
                className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              >
                <History size={11} aria-hidden="true" />
                Restore previous draft
              </button>
            )}

            {/* Reset to builder action */}
            <button
              type="button"
              data-testid="reset-to-builder-btn"
              onClick={() => {
                switchMode('map');
                setHasSelectedCollectionMode(false);
                setBuilderEditorMode('builder');
                setDecompositionWarning(null);
              }}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              <RotateCcw size={11} aria-hidden="true" />
              Reset to builder mode
            </button>
          </div>
        ) : (
          /* ---------------------------------------------------------------- */
          /* Builder mode                                                      */
          /* ---------------------------------------------------------------- */
          <>
            {/* Mode selector — uses switchMode for subsequent changes (with preservation logic) */}
            <ArrayModeSelector
              selectedMode={hasSelectedCollectionMode && state.mode !== 'customExpression' ? state.mode : null}
              onSelectMode={handleCollectionModeSelect}
            />

            {hasSelectedCollectionMode && (
              <>
                {/* Divider */}
                <div className="h-px bg-slate-700/60" />

                {/* Collection editor — mode-specific */}
                <CollectionEditorSlot
                  mode={state.mode}
                  sourceArrayPath={sourceArrayPath}
                  filterPredicate={filterPredicate}
                  splitStringState={splitStringState}
                  buildFromValuesState={buildFromValuesState}
                  objectFieldsState={objectFieldsState}
                  mergeBranchesState={mergeBranchesState}
                  targetArrayNode={targetArrayNode}
                  validationState={validationState}
                  nestingDepth={nestingDepth}
                  targetItemFields={buildFromValuesTargetItemFields}
                  rawExpression={rawExpression}
                  isFromUnrecognized={isFromUnrecognized}
                  canRestorePreviousDraft={canRestorePreviousDraft}
                  parsedSourceSchema={parsedSourceSchema}
                  onSourceArrayPathChange={setSourceArrayPath}
                  onFilterPredicateChange={setFilterPredicate}
                  onSplitStringStateChange={setSplitStringState}
                  onBuildFromValuesStateChange={setBuildFromValuesState}
                  onObjectFieldsStateChange={setObjectFieldsState}
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
                      itemContextFieldPaths={
                        state.mode === 'objectFields' ? objectFieldsItemContextPaths : undefined
                      }
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
              </>
            )}
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* FS-051 T-05: Action row — Reset draft + Discard changes             */}
      {/* No AI buttons — intentionally omitted until array-level AI exists   */}
      {/* ------------------------------------------------------------------ */}
      <div className="shrink-0 border-t border-slate-700 px-4 py-2" data-testid="array-builder-action-row">
        {/* Reset draft confirmation prompt — inline, shown above action buttons */}
        {confirmingReset && (
          <div
            data-testid="array-reset-draft-confirm-prompt"
            className="mb-2 flex items-center gap-2 rounded border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-xs"
          >
            <span className="flex-1 text-amber-300">Reset draft? Your current expression will be cleared.</span>
            <button
              type="button"
              data-testid="array-reset-draft-confirm"
              onClick={handleResetDraftConfirm}
              className="rounded border border-amber-600 px-2 py-1 text-amber-300 transition-colors hover:border-amber-500 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              Reset
            </button>
            <button
              type="button"
              data-testid="array-reset-draft-cancel"
              onClick={handleResetDraftCancel}
              className="rounded border border-slate-600 px-2 py-1 text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Reset draft */}
          <button
            type="button"
            data-testid="array-reset-draft-btn"
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

          {/* Discard changes — visible when field has an unsaved draft */}
          {isDirty && (
            <button
              type="button"
              data-testid="array-discard-btn"
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
