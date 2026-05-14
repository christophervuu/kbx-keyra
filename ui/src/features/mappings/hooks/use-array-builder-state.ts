/**
 * use-array-builder-state.ts — FS-043 T-04 / T-05 / T-10 / T-12
 *
 * Hook that manages ArrayBuilderState for the new chain-aligned Array Builder.
 *
 * Responsibilities:
 *   - Initializes state from createEmptyArrayBuilderState() or hydrates from an
 *     existing expression via decomposeArrayExpression() (T-03 integration).
 *   - Exposes actions: selectMode, setSourceArrayPath, setFilterPredicate,
 *     addValueEntry, removeValueEntry, updateValueEntry, reorderValueEntry,
 *     setNullFiltering.
 *   - Calls generateArrayExpression(state) on every state change and fires
 *     onExpressionChange + updateDraft callbacks.
 *   - Manages previousStructuredDraft for custom expression return (T-12 placeholder).
 *   - T-10: enterNestedArray / exitNestedArray for focused nested panel navigation.
 *
 * @pure actions — each action returns a new state object (no mutation).
 *
 * T-12 additions:
 *   - setCustomExpression: update rawExpression in customExpression mode
 *   - isFromUnrecognized: true when hydrated from an unrecognized expression (AE-12)
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createEmptyArrayBuilderState,
  createCollectionStateForMode,
  createEmptyFilterPredicate,
  createEmptyItemTemplate,
  createEmptyMergeBranch,
  deriveCompletionStatus,
  isCompatibleModeSwitch,
  getModePreservationRules,
} from '../lib/array-builder-state';
import type {
  ArrayBuilderMode,
  ArrayBuilderState,
  FilterPredicateState,
  ItemFieldMapping,
  MergeBranch,
  ValueEntry,
} from '../lib/array-builder-state';
import { decomposeArrayExpression } from '../lib/array-decomposer';
import { generateArrayExpression } from '../lib/array-expression-generator';
import { deriveArrayValidation } from '../lib/array-validation';
import type { ArrayValidationState } from '../lib/array-validation';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseArrayBuilderStateOptions {
  /** Full dot-path of the target array field. */
  readonly targetPath: string;
  /**
   * Returns the current in-memory draft expression for the target path,
   * or null if no draft exists.
   */
  readonly getDraftExpression: (targetPath: string) => string | null;
  /**
   * The current saved expression for this target (from committed rules).
   * Hydration checks getDraftExpression first, then falls back to this.
   */
  readonly currentExpression?: string;
  /**
   * Called on every expression change to persist an in-memory draft.
   */
  readonly updateDraft: (targetPath: string, expression: string) => void;
  /**
   * Optional callback fired whenever the local expression changes.
   */
  readonly onExpressionChange?: (expression: string) => void;
  /**
   * T-11: Parsed source schema — used for validation type checks.
   */
  readonly parsedSourceSchema?: ParsedSchema | null;
  /**
   * T-11: Target array node — used for item-template validation.
   */
  readonly targetArrayNode?: SchemaTreeNode | null;
}

export interface UseArrayBuilderStateResult {
  /** Current array builder state. */
  readonly state: ArrayBuilderState;
  /** The generated DSL expression from the current state. */
  readonly expression: string;
  /** Select a new mode. Resets collection state; preserves item template where compatible. */
  readonly selectMode: (mode: ArrayBuilderMode) => void;
  /** Set the source array path for Map or FilterMap modes. */
  readonly setSourceArrayPath: (path: string) => void;
  /** Set the filter predicate for FilterMap mode. */
  readonly setFilterPredicate: (predicate: FilterPredicateState) => void;
  /** Add a new value entry to Build from Values mode. */
  readonly addValueEntry: (entry: ValueEntry) => void;
  /** Remove a value entry by index. */
  readonly removeValueEntry: (index: number) => void;
  /** Update a value entry at a given index. */
  readonly updateValueEntry: (index: number, entry: ValueEntry) => void;
  /** Reorder a value entry from one index to another. */
  readonly reorderValueEntry: (fromIndex: number, toIndex: number) => void;
  /** Enable or disable null filtering for Build from Values mode. */
  readonly setNullFiltering: (enabled: boolean, filterField?: string) => void;
  /** Update the entire BuildFromValues collection state at once. */
  readonly setBuildFromValuesState: (state: import('../lib/array-builder-state').BuildFromValuesCollectionState) => void;
  /** Add a new empty branch to Merge Array Branches mode (no-op if 10 branches exist). */
  readonly addBranch: () => void;
  /** Remove a branch by index (no-op if only 2 branches remain). */
  readonly removeBranch: (index: number) => void;
  /** Update a branch at a given index. */
  readonly updateBranch: (index: number, branch: MergeBranch) => void;
  /** Update the entire MergeBranches collection state at once. */
  readonly setMergeBranchesState: (state: import('../lib/array-builder-state').MergeBranchesCollectionState) => void;
  /** Update the entire SplitString collection state at once. */
  readonly setSplitStringState: (state: import('../lib/array-builder-state').SplitStringCollectionState) => void;
  /** Set or update the mapping for an item field. */
  readonly setFieldMapping: (targetFieldPath: string, mapping: ItemFieldMapping) => void;
  /** Clear the mapping for an item field (resets to empty). */
  readonly removeFieldMapping: (targetFieldPath: string) => void;
  /**
   * Pending mode switch — set when an incompatible switch is requested.
   * The UI should show a confirmation dialog when this is non-null.
   */
  readonly pendingModeSwitch: ArrayBuilderMode | null;
  /**
   * Smart mode switch — checks compatibility and either applies immediately
   * or sets pendingModeSwitch for confirmation.
   */
  readonly switchMode: (mode: ArrayBuilderMode) => void;
  /** Confirm the pending mode switch (called after user confirms dialog). */
  readonly confirmModeSwitch: () => void;
  /** Cancel the pending mode switch (called when user dismisses dialog). */
  readonly cancelModeSwitch: () => void;
  /**
   * Whether a previous structured draft is available to restore.
   * True when returning from Custom Expression with a stored draft.
   */
  readonly canRestorePreviousDraft: boolean;
  /** Restore the previous structured draft (when returning from Custom Expression). */
  readonly restorePreviousDraft: () => void;
  /**
   * T-11: Derived multi-level validation state.
   * Computed from current state + schema context (if provided via options).
   */
  readonly validationState: ArrayValidationState;
  // ---------------------------------------------------------------------------
  // T-10: Nested array navigation
  // ---------------------------------------------------------------------------
  /**
   * The target field path of the nested array currently being edited.
   * Null when the outer builder is active.
   */
  readonly activeNestedPath: string | null;
  /**
   * Enter the nested array builder for a given target field path.
   * Creates an empty ArrayBuilderState for the nested array if one doesn't exist.
   */
  readonly enterNestedArray: (targetFieldPath: string) => void;
  /** Exit the nested array builder and return to the outer builder. */
  readonly exitNestedArray: () => void;
  /**
   * Set or update a field mapping within the currently active nested array's item template.
   * No-op if no nested array is active.
   */
  readonly setNestedFieldMapping: (targetFieldPath: string, mapping: ItemFieldMapping) => void;
  /**
   * Replace the entire ArrayBuilderState for the active nested array.
   * No-op if no nested array is active.
   */
  readonly setNestedArrayBuilderState: (nestedState: ArrayBuilderState) => void;
  /**
   * The ArrayBuilderState for the currently active nested array, or null.
   */
  readonly activeNestedState: ArrayBuilderState | null;
  // ---------------------------------------------------------------------------
  // T-12: Custom Expression mode
  // ---------------------------------------------------------------------------
  /**
   * Update the rawExpression in customExpression mode.
   * No-op if the current mode is not customExpression.
   */
  readonly setCustomExpression: (expression: string) => void;
  /**
   * True when the current customExpression state was loaded from an expression
   * that the decomposer could not recognize as a structured pattern (AE-12).
   * Cleared when the user edits the expression or resets to structured mode.
   */
  readonly isFromUnrecognized: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface HydrateResult {
  state: ArrayBuilderState;
  isFromUnrecognized: boolean;
}

function leafSegment(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';
  const idx = trimmed.lastIndexOf('.');
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function normalizeRelativePath(path: string, scopeCandidates: readonly string[]): string {
  const trimmed = path.trim();
  if (!trimmed) return '';

  for (const candidate of scopeCandidates) {
    const scope = candidate.trim();
    if (!scope) continue;
    if (trimmed.startsWith(`${scope}.`)) {
      return trimmed.slice(scope.length + 1);
    }
  }

  return trimmed;
}

function toRelativeNestedArrayKey(targetFieldPath: string, parentScopePath: string): string {
  const parentLeaf = leafSegment(parentScopePath);
  const candidates = [parentScopePath, parentLeaf].filter(Boolean);
  return normalizeRelativePath(targetFieldPath, candidates) || targetFieldPath;
}

function nestedArrayLookupKeys(targetFieldPath: string, parentScopePath: string): string[] {
  const relative = toRelativeNestedArrayKey(targetFieldPath, parentScopePath);
  const keys = [
    relative,
    targetFieldPath,
    leafSegment(relative),
    leafSegment(targetFieldPath),
  ].filter(Boolean);
  return Array.from(new Set(keys));
}

function resolveNestedArrayEntry(
  nestedArrays: ReadonlyMap<string, ArrayBuilderState>,
  targetFieldPath: string,
  parentScopePath: string,
): { key: string; state: ArrayBuilderState } | null {
  const keys = nestedArrayLookupKeys(targetFieldPath, parentScopePath);
  for (const key of keys) {
    const value = nestedArrays.get(key);
    if (value) return { key, state: value };
  }
  return null;
}

function remapFieldTargetPath(mapping: ItemFieldMapping, targetFieldPath: string): ItemFieldMapping {
  switch (mapping.kind) {
    case 'chain':
      return { ...mapping, targetFieldPath };
    case 'expression':
      return { ...mapping, targetFieldPath };
    case 'crossArrayLookup':
      return { ...mapping, targetFieldPath };
    case 'empty':
      return { ...mapping, targetFieldPath };
  }
}

function normalizeItemTemplatePaths(
  template: import('../lib/array-builder-state').ItemTemplateState,
  scopePath: string,
): import('../lib/array-builder-state').ItemTemplateState {
  const scopeLeaf = leafSegment(scopePath);
  const baseCandidates = [scopePath, scopeLeaf].filter(Boolean);

  const normalizedFields = template.fields.map((mapping) => {
    const normalizedPath = normalizeRelativePath(mapping.targetFieldPath, baseCandidates);
    return remapFieldTargetPath(mapping, normalizedPath || mapping.targetFieldPath);
  });

  const normalizedNestedArrays = new Map<string, ArrayBuilderState>();
  for (const [rawNestedPath, nestedState] of template.nestedArrays) {
    const normalizedNestedKey = toRelativeNestedArrayKey(rawNestedPath, scopePath);
    const nestedScopeCandidates = [rawNestedPath, normalizedNestedKey, leafSegment(rawNestedPath), leafSegment(normalizedNestedKey)]
      .filter(Boolean);

    const normalizedNestedFields = nestedState.itemTemplate.fields.map((mapping) => {
      const normalizedPath = normalizeRelativePath(mapping.targetFieldPath, nestedScopeCandidates);
      return remapFieldTargetPath(mapping, normalizedPath || mapping.targetFieldPath);
    });

    const normalizedNestedTemplate = {
      ...nestedState.itemTemplate,
      fields: normalizedNestedFields,
    };

    const normalizedNestedState = {
      ...nestedState,
      itemTemplate: normalizeItemTemplatePaths(normalizedNestedTemplate, rawNestedPath),
    };

    normalizedNestedArrays.set(normalizedNestedKey, normalizedNestedState);
  }

  return {
    ...template,
    fields: normalizedFields,
    nestedArrays: normalizedNestedArrays,
  };
}

function normalizeArrayStatePaths(state: ArrayBuilderState, targetPath: string): ArrayBuilderState {
  const normalizedTemplate = normalizeItemTemplatePaths(state.itemTemplate, targetPath);
  const partial = { ...state, itemTemplate: normalizedTemplate };
  return { ...partial, completionStatus: deriveCompletionStatus(partial) };
}

function hydrateFromExpression(expression: string): HydrateResult {
  if (!expression.trim()) {
    return { state: createEmptyArrayBuilderState('map'), isFromUnrecognized: false };
  }
  const result = decomposeArrayExpression(expression);
  if (result.success) {
    return { state: result.state, isFromUnrecognized: false };
  }
  // Unrecognized pattern → custom expression mode
  const collectionState = {
    mode: 'customExpression' as const,
    rawExpression: expression,
  };
  const partial = {
    mode: 'customExpression' as const,
    collectionState,
    itemTemplate: createEmptyItemTemplate(),
    completionStatus: 'complete' as const,
  };
  return {
    state: { ...partial, completionStatus: deriveCompletionStatus(partial) },
    isFromUnrecognized: true,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useArrayBuilderState({
  targetPath,
  getDraftExpression,
  currentExpression = '',
  updateDraft,
  onExpressionChange,
  parsedSourceSchema = null,
  targetArrayNode = null,
}: UseArrayBuilderStateOptions): UseArrayBuilderStateResult {
  const [state, setState] = useState<ArrayBuilderState>(() => {
    const draft = getDraftExpression(targetPath);
    const expr = draft ?? currentExpression;
    return normalizeArrayStatePaths(hydrateFromExpression(expr).state, targetPath);
  });

  // T-12: Track whether the current customExpression state came from an unrecognized expression
  const [isFromUnrecognized, setIsFromUnrecognized] = useState<boolean>(() => {
    const draft = getDraftExpression(targetPath);
    const expr = draft ?? currentExpression;
    return hydrateFromExpression(expr).isFromUnrecognized;
  });

  // Pending mode switch — set when an incompatible switch is requested
  const [pendingModeSwitch, setPendingModeSwitch] = useState<ArrayBuilderMode | null>(null);

  // T-10: Active nested array path
  const [activeNestedPath, setActiveNestedPath] = useState<string | null>(null);

  // Keep callbacks in refs to avoid stale closures
  const updateDraftRef = useRef(updateDraft);
  useEffect(() => { updateDraftRef.current = updateDraft; });
  const onExpressionChangeRef = useRef(onExpressionChange);
  useEffect(() => { onExpressionChangeRef.current = onExpressionChange; });

  // Re-hydrate when targetPath or currentExpression changes
  useEffect(() => {
    const draft = getDraftExpression(targetPath);
    const expr = draft ?? currentExpression;
    const { state: hydratedState, isFromUnrecognized: fromUnrecognized } = hydrateFromExpression(expr);
    setState(normalizeArrayStatePaths(hydratedState, targetPath));
    setIsFromUnrecognized(fromUnrecognized);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPath, currentExpression]);

  // Derive expression from state and fire callbacks
  const expression = generateArrayExpression(state);

  // Fire updateDraft + onExpressionChange whenever expression changes
  const prevExpressionRef = useRef<string>(expression);
  useEffect(() => {
    if (expression === prevExpressionRef.current) return;
    prevExpressionRef.current = expression;
    updateDraftRef.current(targetPath, expression);
    onExpressionChangeRef.current?.(expression);
  }, [expression, targetPath]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const selectMode = useCallback((mode: ArrayBuilderMode) => {
    setState((prev) => {
      const newCollectionState = createCollectionStateForMode(mode);
      // map ↔ filterMap: preserve source array path
      if (
        (prev.mode === 'map' || prev.mode === 'filterMap') &&
        (mode === 'map' || mode === 'filterMap')
      ) {
        const prevSourcePath =
          prev.collectionState.mode === 'map' || prev.collectionState.mode === 'filterMap'
            ? prev.collectionState.sourceArrayPath
            : '';
        const updatedCollection =
          mode === 'filterMap'
            ? {
                mode: 'filterMap' as const,
                sourceArrayPath: prevSourcePath,
                filterPredicate: createEmptyFilterPredicate(),
              }
            : { mode: 'map' as const, sourceArrayPath: prevSourcePath };
        const partial = {
          mode,
          collectionState: updatedCollection,
          itemTemplate: prev.itemTemplate,
          completionStatus: prev.completionStatus,
        };
        return { ...partial, completionStatus: deriveCompletionStatus(partial) };
      }

      const partial = {
        mode,
        collectionState: newCollectionState,
        itemTemplate: createEmptyItemTemplate(),
        completionStatus: prev.completionStatus,
      };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
  }, []);

  const setSourceArrayPath = useCallback((path: string) => {
    setState((prev) => {
      if (
        prev.collectionState.mode !== 'map' &&
        prev.collectionState.mode !== 'filterMap' &&
        prev.collectionState.mode !== 'splitString'
      ) {
        return prev;
      }
      const updatedCollection =
        prev.collectionState.mode === 'splitString'
          ? { ...prev.collectionState, sourceStringPath: path }
          : { ...prev.collectionState, sourceArrayPath: path };
      const partial = { ...prev, collectionState: updatedCollection };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
  }, []);

  const setSplitStringState = useCallback(
    (newCollectionState: import('../lib/array-builder-state').SplitStringCollectionState) => {
      setState((prev) => {
        const partial = { ...prev, collectionState: newCollectionState };
        return { ...partial, completionStatus: deriveCompletionStatus(partial) };
      });
    },
    [],
  );

  const setFilterPredicate = useCallback((predicate: FilterPredicateState) => {
    setState((prev) => {
      if (prev.collectionState.mode !== 'filterMap') return prev;
      const updatedCollection = { ...prev.collectionState, filterPredicate: predicate };
      const partial = { ...prev, collectionState: updatedCollection };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
  }, []);

  const addValueEntry = useCallback((entry: ValueEntry) => {
    setState((prev) => {
      if (prev.collectionState.mode !== 'buildFromValues') return prev;
      const updatedCollection = {
        ...prev.collectionState,
        entries: [...prev.collectionState.entries, entry],
      };
      const partial = { ...prev, collectionState: updatedCollection };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
  }, []);

  const removeValueEntry = useCallback((index: number) => {
    setState((prev) => {
      if (prev.collectionState.mode !== 'buildFromValues') return prev;
      const updatedCollection = {
        ...prev.collectionState,
        entries: prev.collectionState.entries.filter((_, i) => i !== index),
      };
      const partial = { ...prev, collectionState: updatedCollection };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
  }, []);

  const updateValueEntry = useCallback((index: number, entry: ValueEntry) => {
    setState((prev) => {
      if (prev.collectionState.mode !== 'buildFromValues') return prev;
      const updatedCollection = {
        ...prev.collectionState,
        entries: prev.collectionState.entries.map((e, i) => (i === index ? entry : e)),
      };
      const partial = { ...prev, collectionState: updatedCollection };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
  }, []);

  const reorderValueEntry = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      if (prev.collectionState.mode !== 'buildFromValues') return prev;
      const entries = [...prev.collectionState.entries];
      const [item] = entries.splice(fromIndex, 1);
      if (item === undefined) return prev;
      entries.splice(toIndex, 0, item);
      const updatedCollection = { ...prev.collectionState, entries };
      const partial = { ...prev, collectionState: updatedCollection };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
  }, []);

  const setNullFiltering = useCallback((enabled: boolean, filterField?: string) => {
    setState((prev) => {
      if (prev.collectionState.mode !== 'buildFromValues') return prev;
      const updatedCollection = {
        ...prev.collectionState,
        nullFilteringEnabled: enabled,
        ...(filterField !== undefined && { nullFilterField: filterField }),
      };
      const partial = { ...prev, collectionState: updatedCollection };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
  }, []);

  const setBuildFromValuesState = useCallback(
    (newCollectionState: import('../lib/array-builder-state').BuildFromValuesCollectionState) => {
      setState((prev) => {
        const partial = { ...prev, collectionState: newCollectionState };
        return { ...partial, completionStatus: deriveCompletionStatus(partial) };
      });
    },
    [],
  );

  const addBranch = useCallback(() => {
    setState((prev) => {
      if (prev.collectionState.mode !== 'mergeArrayBranches') return prev;
      if (prev.collectionState.branches.length >= 10) return prev;
      const updatedCollection = {
        ...prev.collectionState,
        branches: [...prev.collectionState.branches, createEmptyMergeBranch()],
      };
      const partial = { ...prev, collectionState: updatedCollection };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
  }, []);

  const removeBranch = useCallback((index: number) => {
    setState((prev) => {
      if (prev.collectionState.mode !== 'mergeArrayBranches') return prev;
      if (prev.collectionState.branches.length <= 2) return prev;
      const updatedCollection = {
        ...prev.collectionState,
        branches: prev.collectionState.branches.filter((_, i) => i !== index),
      };
      const partial = { ...prev, collectionState: updatedCollection };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
  }, []);

  const updateBranch = useCallback((index: number, branch: MergeBranch) => {
    setState((prev) => {
      if (prev.collectionState.mode !== 'mergeArrayBranches') return prev;
      const updatedCollection = {
        ...prev.collectionState,
        branches: prev.collectionState.branches.map((b, i) => (i === index ? branch : b)),
      };
      const partial = { ...prev, collectionState: updatedCollection };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
  }, []);

  const setMergeBranchesState = useCallback(
    (newCollectionState: import('../lib/array-builder-state').MergeBranchesCollectionState) => {
      setState((prev) => {
        const partial = { ...prev, collectionState: newCollectionState };
        return { ...partial, completionStatus: deriveCompletionStatus(partial) };
      });
    },
    [],
  );

  const setFieldMapping = useCallback((targetFieldPath: string, mapping: ItemFieldMapping) => {
    setState((prev) => {
      const scopeCandidates = [targetPath, leafSegment(targetPath)].filter(Boolean);
      const normalizedPath = normalizeRelativePath(targetFieldPath, scopeCandidates) || targetFieldPath;
      const normalizedMapping = remapFieldTargetPath(
        mapping,
        normalizeRelativePath(mapping.targetFieldPath, scopeCandidates) || normalizedPath,
      );

      const existingFields = prev.itemTemplate.fields;
      const idx = existingFields.findIndex((f) => f.targetFieldPath === normalizedPath);
      const updatedFields =
        idx >= 0
          ? existingFields.map((f, i) => (i === idx ? normalizedMapping : f))
          : [...existingFields, normalizedMapping];
      const updatedTemplate = { ...prev.itemTemplate, fields: updatedFields };
      const partial = { ...prev, itemTemplate: updatedTemplate };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
  }, [targetPath]);

  const removeFieldMapping = useCallback((targetFieldPath: string) => {
    setState((prev) => {
      const updatedFields = prev.itemTemplate.fields.filter(
        (f) => f.targetFieldPath !== targetFieldPath,
      );
      const updatedTemplate = { ...prev.itemTemplate, fields: updatedFields };
      const partial = { ...prev, itemTemplate: updatedTemplate };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // T-12: Custom Expression actions
  // ---------------------------------------------------------------------------

  const setCustomExpression = useCallback((rawExpression: string) => {
    setState((prev) => {
      if (prev.collectionState.mode !== 'customExpression') return prev;
      const updatedCollection = { ...prev.collectionState, rawExpression };
      const partial = { ...prev, collectionState: updatedCollection };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
    // Once the user edits the expression, it's no longer "from unrecognized"
    setIsFromUnrecognized(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Mode switch helpers
  // ---------------------------------------------------------------------------

  /**
   * Applies a mode switch with full preservation logic.
   * Called both for compatible (immediate) and confirmed (after dialog) switches.
   */
  function applyModeSwitch(prev: ArrayBuilderState, toMode: ArrayBuilderMode): ArrayBuilderState {
    const fromMode = prev.mode;

    // Same mode — no-op
    if (fromMode === toMode) return prev;

    // map → filterMap: add empty filter, preserve source + item template
    if (fromMode === 'map' && toMode === 'filterMap') {
      const sourceArrayPath =
        prev.collectionState.mode === 'map' ? prev.collectionState.sourceArrayPath : '';
      const partial = {
        mode: 'filterMap' as const,
        collectionState: {
          mode: 'filterMap' as const,
          sourceArrayPath,
          filterPredicate: createEmptyFilterPredicate(),
        },
        itemTemplate: prev.itemTemplate,
        completionStatus: prev.completionStatus,
      };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    }

    // filterMap → map: remove filter, preserve source + item template
    if (fromMode === 'filterMap' && toMode === 'map') {
      const sourceArrayPath =
        prev.collectionState.mode === 'filterMap' ? prev.collectionState.sourceArrayPath : '';
      const partial = {
        mode: 'map' as const,
        collectionState: { mode: 'map' as const, sourceArrayPath },
        itemTemplate: prev.itemTemplate,
        completionStatus: prev.completionStatus,
      };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    }

    // map/filterMap → mergeArrayBranches: wrap current as Branch 1, add empty Branch 2
    if ((fromMode === 'map' || fromMode === 'filterMap') && toMode === 'mergeArrayBranches') {
      const sourceArrayPath =
        prev.collectionState.mode === 'map' || prev.collectionState.mode === 'filterMap'
          ? prev.collectionState.sourceArrayPath
          : '';
      const branch1 = { sourceArrayPath, itemTemplate: prev.itemTemplate };
      const branch2 = createEmptyMergeBranch();
      const partial = {
        mode: 'mergeArrayBranches' as const,
        collectionState: {
          mode: 'mergeArrayBranches' as const,
          branches: [branch1, branch2] as const,
        },
        itemTemplate: createEmptyItemTemplate(),
        completionStatus: prev.completionStatus,
      };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    }

    // mergeArrayBranches → map/filterMap: use first branch
    if (fromMode === 'mergeArrayBranches' && (toMode === 'map' || toMode === 'filterMap')) {
      const firstBranch =
        prev.collectionState.mode === 'mergeArrayBranches'
          ? prev.collectionState.branches[0]
          : undefined;
      const sourceArrayPath = firstBranch?.sourceArrayPath ?? '';
      const itemTemplate = firstBranch?.itemTemplate ?? createEmptyItemTemplate();
      if (toMode === 'map') {
        const partial = {
          mode: 'map' as const,
          collectionState: { mode: 'map' as const, sourceArrayPath },
          itemTemplate,
          completionStatus: prev.completionStatus,
        };
        return { ...partial, completionStatus: deriveCompletionStatus(partial) };
      }
      const partial = {
        mode: 'filterMap' as const,
        collectionState: {
          mode: 'filterMap' as const,
          sourceArrayPath,
          filterPredicate: createEmptyFilterPredicate(),
        },
        itemTemplate,
        completionStatus: prev.completionStatus,
      };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    }

    // any structured → customExpression: generate DSL, store previous draft
    if (fromMode !== 'customExpression' && toMode === 'customExpression') {
      const rawExpression = generateArrayExpression(prev);
      const partial = {
        mode: 'customExpression' as const,
        collectionState: { mode: 'customExpression' as const, rawExpression },
        itemTemplate: createEmptyItemTemplate(),
        completionStatus: 'complete' as const,
        previousStructuredDraft: prev,
      };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    }

    // customExpression → structured: attempt decompose, else reset
    if (fromMode === 'customExpression' && toMode !== 'customExpression') {
      const rawExpr =
        prev.collectionState.mode === 'customExpression'
          ? prev.collectionState.rawExpression
          : '';
      const decomposed = decomposeArrayExpression(rawExpr);
      if (decomposed.success && decomposed.state.mode === toMode) {
        return { ...decomposed.state, completionStatus: deriveCompletionStatus(decomposed.state) };
      }
      // Reset to empty state for the target mode
      const newCollectionState = createCollectionStateForMode(toMode);
      const partial = {
        mode: toMode,
        collectionState: newCollectionState,
        itemTemplate: createEmptyItemTemplate(),
        completionStatus: prev.completionStatus,
      };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    }

    // All other switches: full reset
    const newCollectionState = createCollectionStateForMode(toMode);
    const partial = {
      mode: toMode,
      collectionState: newCollectionState,
      itemTemplate: createEmptyItemTemplate(),
      completionStatus: prev.completionStatus,
    };
    return { ...partial, completionStatus: deriveCompletionStatus(partial) };
  }

  const switchMode = useCallback((toMode: ArrayBuilderMode) => {
    setState((prev) => {
      if (prev.mode === toMode) return prev;
      const rules = getModePreservationRules(prev.mode, toMode);
      // If nothing has been configured yet, skip confirmation — there is nothing to discard
      if (!rules.requiresConfirmation || prev.completionStatus === 'notStarted') {
        return applyModeSwitch(prev, toMode);
      }
      // Incompatible — set pending for confirmation dialog
      setPendingModeSwitch(toMode);
      return prev;
    });
   
  }, []);

  const confirmModeSwitch = useCallback(() => {
    if (pendingModeSwitch === null) return;
    const toMode = pendingModeSwitch;
    setPendingModeSwitch(null);
    setState((prev) => applyModeSwitch(prev, toMode));
   
  }, [pendingModeSwitch]);

  const cancelModeSwitch = useCallback(() => {
    setPendingModeSwitch(null);
  }, []);

  const canRestorePreviousDraft =
    state.mode === 'customExpression' &&
    state.previousStructuredDraft !== undefined;

  const restorePreviousDraft = useCallback(() => {
    setState((prev) => {
      if (prev.mode !== 'customExpression' || !prev.previousStructuredDraft) return prev;
      const restored = prev.previousStructuredDraft;
      return { ...restored, completionStatus: deriveCompletionStatus(restored) };
    });
    setPendingModeSwitch(null);
  }, []);

  // ---------------------------------------------------------------------------
  // T-10: Nested array navigation
  // ---------------------------------------------------------------------------

  const enterNestedArray = useCallback((targetFieldPath: string) => {
    // Ensure a nested state exists for this path; create empty if not
    setState((prev) => {
      const existing = resolveNestedArrayEntry(prev.itemTemplate.nestedArrays, targetFieldPath, targetPath);
      if (existing) return prev; // already exists — no state change needed

      const newNestedState = createEmptyArrayBuilderState('map');
      const updatedNestedArrays = new Map(prev.itemTemplate.nestedArrays);
      const storageKey = toRelativeNestedArrayKey(targetFieldPath, targetPath);
      updatedNestedArrays.set(storageKey, newNestedState);
      const updatedTemplate = { ...prev.itemTemplate, nestedArrays: updatedNestedArrays };
      const partial = { ...prev, itemTemplate: updatedTemplate };
      return { ...partial, completionStatus: deriveCompletionStatus(partial) };
    });
    setActiveNestedPath(targetFieldPath);
  }, [targetPath]);

  const exitNestedArray = useCallback(() => {
    setActiveNestedPath(null);
  }, []);

  const setNestedFieldMapping = useCallback(
    (targetFieldPath: string, mapping: ItemFieldMapping) => {
      setState((prev) => {
        if (!activeNestedPath) return prev;
        const resolvedNested = resolveNestedArrayEntry(prev.itemTemplate.nestedArrays, activeNestedPath, targetPath);
        if (!resolvedNested) return prev;

        const nestedState = resolvedNested.state;
        const nestedScopeCandidates = [
          activeNestedPath,
          resolvedNested.key,
          leafSegment(activeNestedPath),
          leafSegment(resolvedNested.key),
        ].filter(Boolean);
        const normalizedPath = normalizeRelativePath(targetFieldPath, nestedScopeCandidates) || targetFieldPath;
        const normalizedMapping = remapFieldTargetPath(
          mapping,
          normalizeRelativePath(mapping.targetFieldPath, nestedScopeCandidates) || normalizedPath,
        );

        const existingFields = nestedState.itemTemplate.fields;
        const idx = existingFields.findIndex((f) => f.targetFieldPath === normalizedPath);
        const updatedFields =
          idx >= 0
            ? existingFields.map((f, i) => (i === idx ? normalizedMapping : f))
            : [...existingFields, normalizedMapping];
        const updatedNestedTemplate = { ...nestedState.itemTemplate, fields: updatedFields };
        const updatedNestedState = {
          ...nestedState,
          itemTemplate: updatedNestedTemplate,
          completionStatus: deriveCompletionStatus({ ...nestedState, itemTemplate: updatedNestedTemplate }),
        };
        const updatedNestedArrays = new Map(prev.itemTemplate.nestedArrays);
        updatedNestedArrays.set(resolvedNested.key, updatedNestedState);
        const updatedTemplate = { ...prev.itemTemplate, nestedArrays: updatedNestedArrays };
        const partial = { ...prev, itemTemplate: updatedTemplate };
        return { ...partial, completionStatus: deriveCompletionStatus(partial) };
      });
    },
     
    [activeNestedPath, targetPath],
  );

  const setNestedArrayBuilderState = useCallback(
    (nestedState: ArrayBuilderState) => {
      setState((prev) => {
        if (!activeNestedPath) return prev;
        const resolvedNested = resolveNestedArrayEntry(prev.itemTemplate.nestedArrays, activeNestedPath, targetPath);
        const storageKey = resolvedNested?.key ?? toRelativeNestedArrayKey(activeNestedPath, targetPath);
        const updatedNestedArrays = new Map(prev.itemTemplate.nestedArrays);
        updatedNestedArrays.set(storageKey, nestedState);
        const updatedTemplate = { ...prev.itemTemplate, nestedArrays: updatedNestedArrays };
        const partial = { ...prev, itemTemplate: updatedTemplate };
        return { ...partial, completionStatus: deriveCompletionStatus(partial) };
      });
    },
     
    [activeNestedPath, targetPath],
  );

  const activeNestedState: ArrayBuilderState | null =
    activeNestedPath !== null
      ? (
          resolveNestedArrayEntry(state.itemTemplate.nestedArrays, activeNestedPath, targetPath)?.state
          ?? createEmptyArrayBuilderState('map')
        )
      : null;

  // ---------------------------------------------------------------------------
  // T-11: Validation state
  // ---------------------------------------------------------------------------

  const validationState: ArrayValidationState = deriveArrayValidation(
    state,
    expression,
    parsedSourceSchema,
    targetArrayNode,
  );

  return {
    state,
    expression,
    selectMode,
    setSourceArrayPath,
    setFilterPredicate,
    addValueEntry,
    removeValueEntry,
    updateValueEntry,
    reorderValueEntry,
    setNullFiltering,
    setBuildFromValuesState,
    addBranch,
    removeBranch,
    updateBranch,
    setMergeBranchesState,
    setSplitStringState,
    setFieldMapping,
    removeFieldMapping,
    pendingModeSwitch,
    switchMode,
    confirmModeSwitch,
    cancelModeSwitch,
    canRestorePreviousDraft,
    restorePreviousDraft,
    validationState,
    activeNestedPath,
    enterNestedArray,
    exitNestedArray,
    setNestedFieldMapping,
    setNestedArrayBuilderState,
    activeNestedState,
    setCustomExpression,
    isFromUnrecognized,
  };
}
