/**
 * array-builder-state.ts — FS-043
 *
 * Type system for the redesigned chain-aligned Array Builder.
 *
 * This file defines the complete state model for the new Array Builder,
 * including all collection-layer modes, item template state, cross-array
 * lookup state, completion status derivation, mode compatibility helpers,
 * and factory functions.
 *
 * Key design decisions (FS-043 Rev 2):
 *   - Q1: Max 10 merge branches in structured UI
 *   - Q2: Simplified boolean-focused FilterPredicateState (not full chain model)
 *   - Q3: ValueEntry[] is reorderable (order is semantically meaningful in array())
 *   - Q4: Preview truncated at 10 items
 *   - Q5: Nested arrays use focused panel model with "Back to parent"
 *
 * Reused from chain-builder-state.ts (FS-039):
 *   - ChainState — used for leaf field mappings inside ItemFieldMapping
 *   - StaticValueBranch — used for static value entries
 */

import type { ChainState, StaticValueBranch } from './chain-builder-state';

// Re-export ChainState so consumers can import from one place.
export type { ChainState, StaticValueBranch };

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

/**
 * The five entry modes for the Array Builder.
 *
 * - 'map'                — Transform each element of a source array
 * - 'filterMap'          — Filter, then transform a source array
 * - 'buildFromValues'    — Construct array entries from individual fields/statics
 * - 'mergeArrayBranches' — Combine multiple source arrays via merge()
 * - 'customExpression'   — Write raw DSL (advanced / escape hatch)
 */
export type ArrayBuilderMode =
  | 'map'
  | 'filterMap'
  | 'buildFromValues'
  | 'mergeArrayBranches'
  | 'customExpression';

// ---------------------------------------------------------------------------
// Filter predicate state (Q2: simplified boolean-focused builder)
// ---------------------------------------------------------------------------

/**
 * Comparison operators available in the simplified filter predicate builder.
 * Covers equality, ordering, and null checks.
 */
export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'isNull'
  | 'isNotNull';

/**
 * The left operand of a filter predicate.
 * In v1, the left operand is always an item field reference.
 */
export type FilterLeftOperand =
  | { readonly kind: 'itemField'; readonly fieldPath: string }
  | { readonly kind: 'expression'; readonly dsl: string };

/**
 * The right operand of a filter predicate.
 * Can be a static literal or a source field reference.
 * Not applicable for unary operators (isNull, isNotNull).
 */
export type FilterRightOperand =
  | { readonly kind: 'static'; readonly value: string }
  | { readonly kind: 'sourceField'; readonly path: string }
  | { readonly kind: 'itemField'; readonly fieldPath: string }
  | { readonly kind: 'none' };

/**
 * A single structured filter predicate.
 *
 * For unary operators (isNull, isNotNull), rightOperand should be { kind: 'none' }.
 *
 * The structured builder supports single-comparison predicates.
 * Complex predicates (AND/OR, nested logic) use the raw expression fallback.
 */
export interface StructuredFilterPredicate {
  readonly kind: 'structured';
  readonly left: FilterLeftOperand;
  readonly operator: FilterOperator;
  readonly right: FilterRightOperand;
}

/**
 * A raw DSL expression used as a filter predicate fallback.
 * Used when the predicate is too complex for the structured builder.
 */
export interface RawFilterPredicate {
  readonly kind: 'raw';
  readonly dsl: string;
}

/**
 * The filter predicate state — either structured (single comparison) or raw DSL.
 *
 * The structured builder handles the common cases (field comparisons, null checks).
 * The raw fallback handles complex predicates (AND/OR, nested conditions).
 */
export type FilterPredicateState = StructuredFilterPredicate | RawFilterPredicate;

// ---------------------------------------------------------------------------
// Value entry (Build from Values mode)
// ---------------------------------------------------------------------------

/**
 * A single value in a value entry field.
 * Can be a source field reference, a static literal, or a raw DSL expression.
 */
export type ValueEntryFieldValue =
  | { readonly kind: 'sourceField'; readonly path: string }
  | { readonly kind: 'static'; readonly value: StaticValueBranch }
  | { readonly kind: 'expression'; readonly dsl: string }
  | { readonly kind: 'empty' };

/**
 * A single entry in Build from Values mode.
 *
 * For object-shaped target items: `fields` maps target field names to values.
 * For primitive target items: `primitiveValue` holds the single value.
 *
 * Order is semantically meaningful — array() preserves element order.
 * Entries are reorderable via drag-and-drop + keyboard controls (Q3).
 */
export type ValueEntry =
  | {
      readonly kind: 'object';
      /** Maps target item field name → value for this entry. */
      readonly fields: Readonly<Record<string, ValueEntryFieldValue>>;
    }
  | {
      readonly kind: 'primitive';
      readonly value: ValueEntryFieldValue;
    };

// ---------------------------------------------------------------------------
// Merge branch
// ---------------------------------------------------------------------------

/**
 * A single branch in Merge Array Branches mode.
 *
 * Each branch has its own source array and item template.
 * The final result merges all branches: merge(map(source("a"), {...}), ...).
 *
 * Maximum 10 branches in the structured UI (Q1).
 * The DSL supports unlimited branches; >10 requires Custom Expression mode.
 */
export interface MergeBranch {
  /** The source array path for this branch. */
  readonly sourceArrayPath: string;
  /** The inferred type of the source array elements (optional, for validation). */
  readonly sourceArrayType?: string;
  /** The item template for this branch. */
  readonly itemTemplate: ItemTemplateState;
}

// ---------------------------------------------------------------------------
// Collection state (discriminated union by mode)
// ---------------------------------------------------------------------------

/** Collection state for Map mode. */
export interface MapCollectionState {
  readonly mode: 'map';
  readonly sourceArrayPath: string;
  readonly sourceArrayType?: string;
}

/** Collection state for Filter + Map mode. */
export interface FilterMapCollectionState {
  readonly mode: 'filterMap';
  readonly sourceArrayPath: string;
  readonly sourceArrayType?: string;
  /** The filter predicate — simplified boolean builder + raw fallback (Q2). */
  readonly filterPredicate: FilterPredicateState;
}

/** Collection state for Build from Values mode. */
export interface BuildFromValuesCollectionState {
  readonly mode: 'buildFromValues';
  /**
   * Ordered list of value entries.
   * Reorderable via drag-and-drop + keyboard controls (Q3).
   * Order is semantically meaningful in array().
   */
  readonly entries: readonly ValueEntry[];
  /**
   * When true, the generated expression wraps array() in a filter()
   * to remove entries with null values.
   */
  readonly nullFilteringEnabled: boolean;
  /**
   * The target field name to use for null filtering.
   * Required when nullFilteringEnabled is true.
   */
  readonly nullFilterField?: string;
}

/** Collection state for Merge Array Branches mode. */
export interface MergeBranchesCollectionState {
  readonly mode: 'mergeArrayBranches';
  /**
   * The list of merge branches.
   * Minimum 2, maximum 10 (Q1).
   */
  readonly branches: readonly MergeBranch[];
}

/** Collection state for Custom Expression mode. */
export interface CustomExpressionCollectionState {
  readonly mode: 'customExpression';
  readonly rawExpression: string;
}

/**
 * Discriminated union of all collection-layer states.
 * Discriminated on the `mode` field.
 */
export type CollectionState =
  | MapCollectionState
  | FilterMapCollectionState
  | BuildFromValuesCollectionState
  | MergeBranchesCollectionState
  | CustomExpressionCollectionState;

// ---------------------------------------------------------------------------
// Cross-array lookup state
// ---------------------------------------------------------------------------

/**
 * State for the cross-array lookup guided helper.
 *
 * Generates: default(get(find(source("lookupArray"), eq(item("matchField"), parent("compareField"))), "returnField"), fallback)
 */
export interface CrossArrayLookupState {
  readonly kind: 'crossArrayLookup';
  /** The source array to search (e.g. "taxLines"). */
  readonly lookupArrayPath: string;
  /** The field in the lookup array to match against (e.g. "lineRef"). */
  readonly matchField: string;
  /**
   * The field to compare against from the current or parent item.
   * - 'item'   — item("compareField") — current array element
   * - 'parent' — parent("compareField") — parent array element (nested context)
   */
  readonly compareScope: 'item' | 'parent';
  readonly compareField: string;
  /** The field to extract from the matched element (e.g. "taxAmount"). */
  readonly returnField: string;
  /**
   * Optional fallback value when no match is found.
   * When undefined, no default() wrapper is generated.
   */
  readonly fallback?: StaticValueBranch;
}

// ---------------------------------------------------------------------------
// Item field mapping
// ---------------------------------------------------------------------------

/**
 * A single field mapping within an item template.
 *
 * Discriminated on `kind`:
 * - 'chain'            — leaf field mapped via a ChainState (scalar chain builder)
 * - 'crossArrayLookup' — leaf field mapped via the cross-array lookup helper
 * - 'empty'            — field not yet mapped (incomplete, not an error)
 */
export type ItemFieldMapping =
  | {
      readonly kind: 'chain';
      /** The target item field path this mapping applies to. */
      readonly targetFieldPath: string;
      /** The chain state for this leaf field. */
      readonly chainState: ChainState;
    }
  | {
      readonly kind: 'crossArrayLookup';
      readonly targetFieldPath: string;
      readonly lookupState: CrossArrayLookupState;
    }
  | {
      readonly kind: 'empty';
      readonly targetFieldPath: string;
    };

// ---------------------------------------------------------------------------
// Item template state
// ---------------------------------------------------------------------------

/**
 * The item template layer — how each array element is constructed.
 *
 * Contains leaf field mappings and recursive nested array states.
 * The `nestedArrays` map uses the target field path as the key.
 */
export interface ItemTemplateState {
  /**
   * Ordered list of item field mappings.
   * One entry per target item field (including unmapped 'empty' entries).
   */
  readonly fields: readonly ItemFieldMapping[];
  /**
   * Recursive nested array builder states.
   * Key: target field path of the nested array field.
   * Value: the full ArrayBuilderState for that nested array.
   *
   * Focused panel model (Q5): nested arrays open in a separate panel,
   * not inline. This map stores the state while the panel is not active.
   */
  readonly nestedArrays: ReadonlyMap<string, ArrayBuilderState>;
}

// ---------------------------------------------------------------------------
// Completion status
// ---------------------------------------------------------------------------

/**
 * The completion status of the array builder state.
 *
 * - 'notStarted'  — no mode selected, or mode selected but no collection source
 * - 'inProgress'  — mode configured but item template incomplete
 * - 'complete'    — collection logic valid + all required item fields satisfied
 * - 'hasErrors'   — validation errors exist at any level
 */
export type CompletionStatus = 'notStarted' | 'inProgress' | 'complete' | 'hasErrors';

// ---------------------------------------------------------------------------
// Top-level array builder state
// ---------------------------------------------------------------------------

/**
 * The top-level state for the redesigned Array Builder (FS-043).
 *
 * Replaces the legacy ArrayBuilderState from useArrayBuilder.
 *
 * Two-layer model:
 *   1. collectionState — how the target array is produced (mode-specific)
 *   2. itemTemplate    — how each array item is constructed
 */
export interface ArrayBuilderState {
  /** The active array builder mode. */
  readonly mode: ArrayBuilderMode;
  /** Mode-specific collection-layer state. */
  readonly collectionState: CollectionState;
  /**
   * Item template state.
   * Not applicable for customExpression mode (ignored in generation).
   */
  readonly itemTemplate: ItemTemplateState;
  /** Derived completion status. */
  readonly completionStatus: CompletionStatus;
  /**
   * The previous structured draft, preserved when switching to Custom Expression mode.
   * Allows returning to the structured state if the user switches back.
   * Only set when mode === 'customExpression'.
   */
  readonly previousStructuredDraft?: Omit<ArrayBuilderState, 'previousStructuredDraft'>;
}

// ---------------------------------------------------------------------------
// Mode compatibility
// ---------------------------------------------------------------------------

/**
 * Describes how state is preserved when switching between modes.
 */
export interface ModeSwitchPreservationRules {
  /** Whether this switch requires a confirmation dialog. */
  readonly requiresConfirmation: boolean;
  /** Human-readable description of what will be preserved. */
  readonly preserved: readonly string[];
  /** Human-readable description of what will be discarded. */
  readonly discarded: readonly string[];
}

/**
 * Returns true when switching from `from` to `to` is compatible —
 * i.e., no confirmation dialog is needed.
 *
 * Compatible switches (per spec mode-switch table):
 *   - map ↔ filterMap (adds/removes filter only; source + item template preserved)
 *
 * All other switches require confirmation or have conditional behavior.
 */
export function isCompatibleModeSwitch(from: ArrayBuilderMode, to: ArrayBuilderMode): boolean {
  if (from === to) return true;
  // map ↔ filterMap: compatible in both directions
  if (from === 'map' && to === 'filterMap') return true;
  if (from === 'filterMap' && to === 'map') return true;
  // All other switches require confirmation
  return false;
}

/**
 * Returns the preservation rules for a mode switch.
 *
 * Describes what state is kept and what is discarded, for use in
 * confirmation dialogs and state transition logic.
 */
export function getModePreservationRules(
  from: ArrayBuilderMode,
  to: ArrayBuilderMode,
): ModeSwitchPreservationRules {
  // Same mode — no-op
  if (from === to) {
    return { requiresConfirmation: false, preserved: ['All state'], discarded: [] };
  }

  // map → filterMap: add empty filter predicate; preserve source + item template
  if (from === 'map' && to === 'filterMap') {
    return {
      requiresConfirmation: false,
      preserved: ['Source array selection', 'Item template field mappings'],
      discarded: [],
    };
  }

  // filterMap → map: remove filter predicate; preserve source + item template
  if (from === 'filterMap' && to === 'map') {
    return {
      requiresConfirmation: false,
      preserved: ['Source array selection', 'Item template field mappings'],
      discarded: ['Filter predicate configuration'],
    };
  }

  // map/filterMap → mergeArrayBranches: preserve as Branch 1
  if ((from === 'map' || from === 'filterMap') && to === 'mergeArrayBranches') {
    return {
      requiresConfirmation: false,
      preserved: ['Current source and item template (becomes Branch 1)'],
      discarded: [],
    };
  }

  // mergeArrayBranches → map/filterMap: conditional (1 branch: auto-convert; 2+: pick branch)
  if (from === 'mergeArrayBranches' && (to === 'map' || to === 'filterMap')) {
    return {
      requiresConfirmation: true,
      preserved: ['One branch (source array and item template)'],
      discarded: ['All other branches'],
    };
  }

  // buildFromValues → any structured mode
  if (from === 'buildFromValues' && to !== 'customExpression') {
    return {
      requiresConfirmation: true,
      preserved: [],
      discarded: ['Build from values entries', 'Item template'],
    };
  }

  // any structured → buildFromValues
  if (from !== 'customExpression' && to === 'buildFromValues') {
    return {
      requiresConfirmation: true,
      preserved: [],
      discarded: ['Current source configuration', 'Item template field mappings'],
    };
  }

  // any structured → customExpression: generate best-effort DSL; preserve structured draft
  if (from !== 'customExpression' && to === 'customExpression') {
    return {
      requiresConfirmation: false,
      preserved: ['Generated DSL expression (best-effort)', 'Previous structured draft (in-session)'],
      discarded: [],
    };
  }

  // customExpression → any structured: conditional (if expression matches pattern: decompose; else: reset)
  if (from === 'customExpression' && to !== 'customExpression') {
    return {
      requiresConfirmation: true,
      preserved: ['Structured state if expression matches a recognized pattern'],
      discarded: ['Raw expression (if pattern not recognized)'],
    };
  }

  // Fallback — should not be reached given the exhaustive cases above
  return {
    requiresConfirmation: true,
    preserved: [],
    discarded: ['Current configuration'],
  };
}

// ---------------------------------------------------------------------------
// Completion status derivation
// ---------------------------------------------------------------------------

/**
 * Returns true when a collection state has a valid source configured.
 * Used to distinguish 'notStarted' from 'inProgress'.
 */
function isCollectionSourceConfigured(state: CollectionState): boolean {
  switch (state.mode) {
    case 'map':
      return state.sourceArrayPath.trim().length > 0;
    case 'filterMap':
      return state.sourceArrayPath.trim().length > 0;
    case 'buildFromValues':
      return state.entries.length > 0;
    case 'mergeArrayBranches':
      return state.branches.length >= 2;
    case 'customExpression':
      return state.rawExpression.trim().length > 0;
  }
}

/**
 * Returns true when a collection state has validation errors.
 */
function hasCollectionErrors(state: CollectionState): boolean {
  switch (state.mode) {
    case 'map':
      // Source path errors are detected externally (schema validation)
      return false;
    case 'filterMap':
      // Raw predicate with empty DSL is an error
      if (state.filterPredicate.kind === 'raw' && state.filterPredicate.dsl.trim().length === 0) {
        return true;
      }
      // Structured predicate with empty left operand field path
      if (
        state.filterPredicate.kind === 'structured' &&
        state.filterPredicate.left.kind === 'itemField' &&
        state.filterPredicate.left.fieldPath.trim().length === 0
      ) {
        return true;
      }
      return false;
    case 'buildFromValues':
      return false;
    case 'mergeArrayBranches':
      // More than 10 branches is a structural error (should not happen via UI)
      return state.branches.length > 10;
    case 'customExpression':
      return false;
  }
}

/**
 * Returns true when an item template has all fields mapped (none are 'empty').
 */
function isItemTemplateComplete(template: ItemTemplateState): boolean {
  return template.fields.every((f) => f.kind !== 'empty');
}

/**
 * Returns true when an item template has any validation errors.
 * Currently checks for cross-array lookup states with missing required fields.
 */
function hasItemTemplateErrors(template: ItemTemplateState): boolean {
  return template.fields.some((f) => {
    if (f.kind === 'crossArrayLookup') {
      const s = f.lookupState;
      return (
        s.lookupArrayPath.trim().length === 0 ||
        s.matchField.trim().length === 0 ||
        s.compareField.trim().length === 0 ||
        s.returnField.trim().length === 0
      );
    }
    return false;
  });
}

/**
 * Derives the completion status from the array builder state.
 *
 * Status derivation:
 *   - 'notStarted'  — no collection source configured
 *   - 'hasErrors'   — validation errors at collection or item level
 *   - 'inProgress'  — source configured but item template has unmapped fields
 *   - 'complete'    — collection valid + all item fields mapped
 *
 * Note: 'hasErrors' takes precedence over 'inProgress'.
 * External validation (schema resolution, type compatibility) may further
 * downgrade 'complete' to 'hasErrors' — that is handled by the validation hook.
 */
export function deriveCompletionStatus(state: ArrayBuilderState): CompletionStatus {
  // Custom expression mode: status based on whether raw expression is non-empty
  if (state.mode === 'customExpression') {
    const cs = state.collectionState as CustomExpressionCollectionState;
    if (cs.rawExpression.trim().length === 0) return 'notStarted';
    return 'complete';
  }

  // Check if collection source is configured
  if (!isCollectionSourceConfigured(state.collectionState)) {
    return 'notStarted';
  }

  // Check for errors
  if (hasCollectionErrors(state.collectionState) || hasItemTemplateErrors(state.itemTemplate)) {
    return 'hasErrors';
  }

  // Check item template completeness
  if (!isItemTemplateComplete(state.itemTemplate)) {
    return 'inProgress';
  }

  return 'complete';
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Creates an empty item template with no fields and no nested arrays.
 */
export function createEmptyItemTemplate(): ItemTemplateState {
  return {
    fields: [],
    nestedArrays: new Map(),
  };
}

/**
 * Creates an empty item field mapping for a given target field path.
 */
export function createEmptyItemFieldMapping(targetFieldPath: string): ItemFieldMapping {
  return { kind: 'empty', targetFieldPath };
}

/**
 * Creates an empty structured filter predicate.
 * Defaults to an item field comparison with 'eq' operator.
 */
export function createEmptyFilterPredicate(): FilterPredicateState {
  return {
    kind: 'structured',
    left: { kind: 'itemField', fieldPath: '' },
    operator: 'eq',
    right: { kind: 'none' },
  };
}

/**
 * Creates an empty value entry for an object-shaped target item.
 * The `fields` record starts empty — callers should populate it
 * based on the target item schema.
 */
export function createEmptyObjectValueEntry(): ValueEntry {
  return { kind: 'object', fields: {} };
}

/**
 * Creates an empty value entry for a primitive target item.
 */
export function createEmptyPrimitiveValueEntry(): ValueEntry {
  return { kind: 'primitive', value: { kind: 'empty' } };
}

/**
 * Creates an empty merge branch with no source and an empty item template.
 */
export function createEmptyMergeBranch(): MergeBranch {
  return {
    sourceArrayPath: '',
    sourceArrayType: undefined,
    itemTemplate: createEmptyItemTemplate(),
  };
}

/**
 * Creates an empty cross-array lookup state.
 */
export function createEmptyCrossArrayLookup(targetFieldPath: string): CrossArrayLookupState {
  return {
    kind: 'crossArrayLookup',
    lookupArrayPath: '',
    matchField: '',
    compareScope: 'item',
    compareField: '',
    returnField: '',
    fallback: undefined,
  };
}

/**
 * Creates the default collection state for a given mode.
 */
export function createCollectionStateForMode(mode: ArrayBuilderMode): CollectionState {
  switch (mode) {
    case 'map':
      return { mode: 'map', sourceArrayPath: '', sourceArrayType: undefined };
    case 'filterMap':
      return {
        mode: 'filterMap',
        sourceArrayPath: '',
        sourceArrayType: undefined,
        filterPredicate: createEmptyFilterPredicate(),
      };
    case 'buildFromValues':
      return { mode: 'buildFromValues', entries: [], nullFilteringEnabled: false };
    case 'mergeArrayBranches':
      return {
        mode: 'mergeArrayBranches',
        // Initialize with 2 empty branches (minimum required)
        branches: [createEmptyMergeBranch(), createEmptyMergeBranch()],
      };
    case 'customExpression':
      return { mode: 'customExpression', rawExpression: '' };
  }
}

/**
 * Creates an empty ArrayBuilderState for a given mode.
 *
 * The completionStatus is derived immediately from the initial state.
 */
export function createEmptyArrayBuilderState(mode: ArrayBuilderMode): ArrayBuilderState {
  const collectionState = createCollectionStateForMode(mode);
  const itemTemplate = createEmptyItemTemplate();
  const partial = {
    mode,
    collectionState,
    itemTemplate,
    completionStatus: 'notStarted' as CompletionStatus,
    previousStructuredDraft: undefined,
  };
  return {
    ...partial,
    completionStatus: deriveCompletionStatus(partial),
  };
}

/**
 * Creates the initial ArrayBuilderState with no mode selected.
 * Used when a target array field is first selected with no existing rule.
 *
 * Defaults to 'map' mode with empty collection state.
 * The UI will show the mode selector before the collection layer.
 */
export function createInitialArrayBuilderState(): ArrayBuilderState {
  return createEmptyArrayBuilderState('map');
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isMapCollectionState(s: CollectionState): s is MapCollectionState {
  return s.mode === 'map';
}

export function isFilterMapCollectionState(s: CollectionState): s is FilterMapCollectionState {
  return s.mode === 'filterMap';
}

export function isBuildFromValuesCollectionState(
  s: CollectionState,
): s is BuildFromValuesCollectionState {
  return s.mode === 'buildFromValues';
}

export function isMergeBranchesCollectionState(
  s: CollectionState,
): s is MergeBranchesCollectionState {
  return s.mode === 'mergeArrayBranches';
}

export function isCustomExpressionCollectionState(
  s: CollectionState,
): s is CustomExpressionCollectionState {
  return s.mode === 'customExpression';
}

export function isStructuredFilterPredicate(
  p: FilterPredicateState,
): p is StructuredFilterPredicate {
  return p.kind === 'structured';
}

export function isRawFilterPredicate(p: FilterPredicateState): p is RawFilterPredicate {
  return p.kind === 'raw';
}

export function isChainFieldMapping(
  m: ItemFieldMapping,
): m is { kind: 'chain'; targetFieldPath: string; chainState: ChainState } {
  return m.kind === 'chain';
}

export function isCrossArrayLookupMapping(
  m: ItemFieldMapping,
): m is { kind: 'crossArrayLookup'; targetFieldPath: string; lookupState: CrossArrayLookupState } {
  return m.kind === 'crossArrayLookup';
}

export function isEmptyFieldMapping(
  m: ItemFieldMapping,
): m is { kind: 'empty'; targetFieldPath: string } {
  return m.kind === 'empty';
}

export function isObjectValueEntry(e: ValueEntry): e is { kind: 'object'; fields: Readonly<Record<string, ValueEntryFieldValue>> } {
  return e.kind === 'object';
}

export function isPrimitiveValueEntry(e: ValueEntry): e is { kind: 'primitive'; value: ValueEntryFieldValue } {
  return e.kind === 'primitive';
}
