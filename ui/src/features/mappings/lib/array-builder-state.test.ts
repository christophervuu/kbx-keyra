/**
 * array-builder-state.test.ts — FS-043 T-01
 *
 * Unit tests for the array builder state model:
 *   - deriveCompletionStatus()
 *   - isCompatibleModeSwitch()
 *   - getModePreservationRules()
 *   - Factory functions
 */

import { describe, it, expect } from 'vitest';

import {
  deriveCompletionStatus,
  isCompatibleModeSwitch,
  getModePreservationRules,
  createEmptyArrayBuilderState,
  createInitialArrayBuilderState,
  createCollectionStateForMode,
  createEmptyItemTemplate,
  createEmptyItemFieldMapping,
  createEmptyFilterPredicate,
  createEmptyObjectValueEntry,
  createEmptyPrimitiveValueEntry,
  createEmptyMergeBranch,
  createEmptyCrossArrayLookup,
  isMapCollectionState,
  isFilterMapCollectionState,
  isBuildFromValuesCollectionState,
  isSplitStringCollectionState,
  isMergeBranchesCollectionState,
  isCustomExpressionCollectionState,
  isStructuredFilterPredicate,
  isRawFilterPredicate,
  isChainFieldMapping,
  isExpressionFieldMapping,
  isCrossArrayLookupMapping,
  isEmptyFieldMapping,
  isObjectValueEntry,
  isPrimitiveValueEntry,
} from './array-builder-state';
import type {
  ArrayBuilderState,
  ArrayBuilderMode,
  CollectionState,
  ItemTemplateState,
  ItemFieldMapping,
  MapCollectionState,
  FilterMapCollectionState,
  BuildFromValuesCollectionState,
  MergeBranchesCollectionState,
  CustomExpressionCollectionState,
} from './array-builder-state';
import { createEmptyChain } from './chain-builder-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(
  mode: ArrayBuilderMode,
  collectionOverride?: Partial<CollectionState>,
  templateOverride?: Partial<ItemTemplateState>,
): ArrayBuilderState {
  const base = createEmptyArrayBuilderState(mode);
  const collectionState = collectionOverride
    ? ({ ...base.collectionState, ...collectionOverride } as CollectionState)
    : base.collectionState;
  const itemTemplate = templateOverride
    ? { ...base.itemTemplate, ...templateOverride }
    : base.itemTemplate;
  return {
    ...base,
    collectionState,
    itemTemplate,
    completionStatus: deriveCompletionStatus({ ...base, collectionState, itemTemplate }),
  };
}

// ---------------------------------------------------------------------------
// deriveCompletionStatus
// ---------------------------------------------------------------------------

describe('deriveCompletionStatus', () => {
  describe('notStarted', () => {
    it('returns notStarted for map mode with empty source path', () => {
      const state = createEmptyArrayBuilderState('map');
      expect(state.completionStatus).toBe('notStarted');
    });

    it('returns notStarted for filterMap mode with empty source path', () => {
      const state = createEmptyArrayBuilderState('filterMap');
      expect(state.completionStatus).toBe('notStarted');
    });

    it('returns notStarted for buildFromValues mode with no entries', () => {
      const state = createEmptyArrayBuilderState('buildFromValues');
      expect(state.completionStatus).toBe('notStarted');
    });

    it('returns notStarted for splitString mode with empty source path', () => {
      const state = createEmptyArrayBuilderState('splitString');
      expect(state.completionStatus).toBe('notStarted');
    });

    it('returns notStarted for mergeArrayBranches mode with fewer than 2 branches', () => {
      const state = makeState('mergeArrayBranches', {
        mode: 'mergeArrayBranches',
        branches: [createEmptyMergeBranch()],
      } as MergeBranchesCollectionState);
      expect(state.completionStatus).toBe('notStarted');
    });

    it('returns notStarted for customExpression mode with empty raw expression', () => {
      const state = createEmptyArrayBuilderState('customExpression');
      expect(state.completionStatus).toBe('notStarted');
    });
  });

  describe('inProgress', () => {
    it('returns inProgress for map mode with source but no item fields', () => {
      const state = makeState('map', { mode: 'map', sourceArrayPath: 'items' } as MapCollectionState);
      // No fields in item template → inProgress
      expect(state.completionStatus).toBe('inProgress');
    });

    it('returns inProgress when some item fields are empty', () => {
      const fields: ItemFieldMapping[] = [
        { kind: 'chain', targetFieldPath: 'sku', chainState: createEmptyChain() },
        { kind: 'empty', targetFieldPath: 'qty' },
      ];
      const state = makeState(
        'map',
        { mode: 'map', sourceArrayPath: 'items' } as MapCollectionState,
        { fields, nestedArrays: new Map() },
      );
      expect(state.completionStatus).toBe('inProgress');
    });

    it('returns inProgress for filterMap mode with source but no item fields', () => {
      const state = makeState('filterMap', {
        mode: 'filterMap',
        sourceArrayPath: 'items',
        filterPredicate: {
          kind: 'structured',
          left: { kind: 'itemField', fieldPath: 'sku' },
          operator: 'eq',
          right: { kind: 'static', value: 'A' },
        },
      } as FilterMapCollectionState);
      expect(state.completionStatus).toBe('inProgress');
    });

    it('returns inProgress for buildFromValues with entries but no item fields', () => {
      const state = makeState('buildFromValues', {
        mode: 'buildFromValues',
        entries: [createEmptyObjectValueEntry()],
        nullFilteringEnabled: false,
      } as BuildFromValuesCollectionState);
      expect(state.completionStatus).toBe('inProgress');
    });

    it('returns inProgress for mergeArrayBranches with 2 branches but no item fields', () => {
      const state = makeState('mergeArrayBranches', {
        mode: 'mergeArrayBranches',
        branches: [createEmptyMergeBranch(), createEmptyMergeBranch()],
      } as MergeBranchesCollectionState);
      expect(state.completionStatus).toBe('inProgress');
    });

    it('returns inProgress for mergeArrayBranches when any branch has unmapped item fields', () => {
      const mappedBranch = {
        ...createEmptyMergeBranch(),
        sourceArrayPath: 'domesticStops',
        itemTemplate: {
          fields: [
            { kind: 'chain', targetFieldPath: 'city', chainState: createEmptyChain() },
            { kind: 'chain', targetFieldPath: 'code', chainState: createEmptyChain() },
          ],
          nestedArrays: new Map(),
        },
      };
      const incompleteBranch = {
        ...createEmptyMergeBranch(),
        sourceArrayPath: 'internationalStops',
        itemTemplate: {
          fields: [
            { kind: 'chain', targetFieldPath: 'city', chainState: createEmptyChain() },
            { kind: 'empty', targetFieldPath: 'code' },
          ],
          nestedArrays: new Map(),
        },
      };

      const state = makeState('mergeArrayBranches', {
        mode: 'mergeArrayBranches',
        branches: [mappedBranch, incompleteBranch],
      } as MergeBranchesCollectionState);

      expect(state.completionStatus).toBe('inProgress');
    });
  });

  describe('complete', () => {
    it('returns complete when all item fields are mapped', () => {
      const fields: ItemFieldMapping[] = [
        { kind: 'chain', targetFieldPath: 'sku', chainState: createEmptyChain() },
        { kind: 'chain', targetFieldPath: 'qty', chainState: createEmptyChain() },
      ];
      const state = makeState(
        'map',
        { mode: 'map', sourceArrayPath: 'items' } as MapCollectionState,
        { fields, nestedArrays: new Map() },
      );
      expect(state.completionStatus).toBe('complete');
    });

    it('returns complete for customExpression mode with non-empty raw expression', () => {
      const state = makeState('customExpression', {
        mode: 'customExpression',
        rawExpression: 'map(source("items"), {"sku": item("sku")})',
      } as CustomExpressionCollectionState);
      expect(state.completionStatus).toBe('complete');
    });

    it('returns complete for splitString mode when source path and delimiter are set', () => {
      const state = makeState('splitString', {
        mode: 'splitString',
        sourceStringPath: 'tags',
        delimiter: ',',
        trimItems: true,
        dropEmpty: false,
      } as CollectionState);
      expect(state.completionStatus).toBe('complete');
    });

    it('returns complete for crossArrayLookup field mappings when all required fields are set', () => {
      const fields: ItemFieldMapping[] = [
        {
          kind: 'crossArrayLookup',
          targetFieldPath: 'tax',
          lookupState: {
            kind: 'crossArrayLookup',
            lookupArrayPath: 'taxLines',
            matchField: 'lineRef',
            compareScope: 'item',
            compareField: 'lineId',
            returnField: 'taxAmount',
          },
        },
      ];
      const state = makeState(
        'map',
        { mode: 'map', sourceArrayPath: 'items' } as MapCollectionState,
        { fields, nestedArrays: new Map() },
      );
      expect(state.completionStatus).toBe('complete');
    });

    it('returns complete for mergeArrayBranches when all branch item fields are mapped', () => {
      const makeMappedBranch = (sourceArrayPath: string) => ({
        ...createEmptyMergeBranch(),
        sourceArrayPath,
        itemTemplate: {
          fields: [
            { kind: 'chain', targetFieldPath: 'city', chainState: createEmptyChain() },
            { kind: 'chain', targetFieldPath: 'code', chainState: createEmptyChain() },
          ],
          nestedArrays: new Map(),
        },
      });

      const state = makeState('mergeArrayBranches', {
        mode: 'mergeArrayBranches',
        branches: [makeMappedBranch('domesticStops'), makeMappedBranch('internationalStops')],
      } as MergeBranchesCollectionState);

      expect(state.completionStatus).toBe('complete');
    });
  });

  describe('hasErrors', () => {
    it('returns hasErrors when filterMap has raw predicate with empty DSL', () => {
      const fields: ItemFieldMapping[] = [
        { kind: 'chain', targetFieldPath: 'sku', chainState: createEmptyChain() },
      ];
      const state = makeState(
        'filterMap',
        {
          mode: 'filterMap',
          sourceArrayPath: 'items',
          filterPredicate: { kind: 'raw', dsl: '' },
        } as FilterMapCollectionState,
        { fields, nestedArrays: new Map() },
      );
      expect(state.completionStatus).toBe('hasErrors');
    });

    it('returns hasErrors when filterMap has structured predicate with empty field path', () => {
      const fields: ItemFieldMapping[] = [
        { kind: 'chain', targetFieldPath: 'sku', chainState: createEmptyChain() },
      ];
      const state = makeState(
        'filterMap',
        {
          mode: 'filterMap',
          sourceArrayPath: 'items',
          filterPredicate: {
            kind: 'structured',
            left: { kind: 'itemField', fieldPath: '' },
            operator: 'eq',
            right: { kind: 'none' },
          },
        } as FilterMapCollectionState,
        { fields, nestedArrays: new Map() },
      );
      expect(state.completionStatus).toBe('hasErrors');
    });

    it('returns hasErrors when mergeArrayBranches has more than 10 branches', () => {
      const branches = Array.from({ length: 11 }, () => createEmptyMergeBranch());
      const state = makeState('mergeArrayBranches', {
        mode: 'mergeArrayBranches',
        branches,
      } as MergeBranchesCollectionState);
      expect(state.completionStatus).toBe('hasErrors');
    });

    it('returns hasErrors when crossArrayLookup has empty required fields', () => {
      const fields: ItemFieldMapping[] = [
        {
          kind: 'crossArrayLookup',
          targetFieldPath: 'tax',
          lookupState: {
            kind: 'crossArrayLookup',
            lookupArrayPath: '',
            matchField: '',
            compareScope: 'item',
            compareField: '',
            returnField: '',
          },
        },
      ];
      const state = makeState(
        'map',
        { mode: 'map', sourceArrayPath: 'items' } as MapCollectionState,
        { fields, nestedArrays: new Map() },
      );
      expect(state.completionStatus).toBe('hasErrors');
    });

    it('returns hasErrors for splitString mode when delimiter is empty', () => {
      const state = makeState('splitString', {
        mode: 'splitString',
        sourceStringPath: 'tags',
        delimiter: '',
        trimItems: true,
        dropEmpty: false,
      } as CollectionState);
      expect(state.completionStatus).toBe('hasErrors');
    });
  });
});

// ---------------------------------------------------------------------------
// isCompatibleModeSwitch
// ---------------------------------------------------------------------------

describe('isCompatibleModeSwitch', () => {
  it('returns true for same mode (all modes)', () => {
    const modes: ArrayBuilderMode[] = [
      'map',
      'filterMap',
      'splitString',
      'buildFromValues',
      'customExpression',
    ];
    for (const mode of modes) {
      expect(isCompatibleModeSwitch(mode, mode)).toBe(true);
    }
  });

  it('returns true for map → filterMap', () => {
    expect(isCompatibleModeSwitch('map', 'filterMap')).toBe(true);
  });

  it('returns true for filterMap → map', () => {
    expect(isCompatibleModeSwitch('filterMap', 'map')).toBe(true);
  });

  it('returns false for map → mergeArrayBranches', () => {
    expect(isCompatibleModeSwitch('map', 'mergeArrayBranches')).toBe(false);
  });

  it('returns false for map → buildFromValues', () => {
    expect(isCompatibleModeSwitch('map', 'buildFromValues')).toBe(false);
  });

  it('returns false for map → customExpression', () => {
    expect(isCompatibleModeSwitch('map', 'customExpression')).toBe(false);
  });

  it('returns false for filterMap → mergeArrayBranches', () => {
    expect(isCompatibleModeSwitch('filterMap', 'mergeArrayBranches')).toBe(false);
  });

  it('returns false for filterMap → buildFromValues', () => {
    expect(isCompatibleModeSwitch('filterMap', 'buildFromValues')).toBe(false);
  });

  it('returns false for filterMap → customExpression', () => {
    expect(isCompatibleModeSwitch('filterMap', 'customExpression')).toBe(false);
  });

  it('returns false for buildFromValues → map', () => {
    expect(isCompatibleModeSwitch('buildFromValues', 'map')).toBe(false);
  });

  it('returns false for buildFromValues → filterMap', () => {
    expect(isCompatibleModeSwitch('buildFromValues', 'filterMap')).toBe(false);
  });

  it('returns false for buildFromValues → mergeArrayBranches', () => {
    expect(isCompatibleModeSwitch('buildFromValues', 'mergeArrayBranches')).toBe(false);
  });

  it('returns false for buildFromValues → customExpression', () => {
    expect(isCompatibleModeSwitch('buildFromValues', 'customExpression')).toBe(false);
  });

  it('returns false for mergeArrayBranches → map', () => {
    expect(isCompatibleModeSwitch('mergeArrayBranches', 'map')).toBe(false);
  });

  it('returns false for mergeArrayBranches → filterMap', () => {
    expect(isCompatibleModeSwitch('mergeArrayBranches', 'filterMap')).toBe(false);
  });

  it('returns false for mergeArrayBranches → buildFromValues', () => {
    expect(isCompatibleModeSwitch('mergeArrayBranches', 'buildFromValues')).toBe(false);
  });

  it('returns false for mergeArrayBranches → customExpression', () => {
    expect(isCompatibleModeSwitch('mergeArrayBranches', 'customExpression')).toBe(false);
  });

  it('returns false for customExpression → map', () => {
    expect(isCompatibleModeSwitch('customExpression', 'map')).toBe(false);
  });

  it('returns false for customExpression → filterMap', () => {
    expect(isCompatibleModeSwitch('customExpression', 'filterMap')).toBe(false);
  });

  it('returns false for customExpression → buildFromValues', () => {
    expect(isCompatibleModeSwitch('customExpression', 'buildFromValues')).toBe(false);
  });

  it('returns false for customExpression → mergeArrayBranches', () => {
    expect(isCompatibleModeSwitch('customExpression', 'mergeArrayBranches')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getModePreservationRules
// ---------------------------------------------------------------------------

describe('getModePreservationRules', () => {
  it('same mode: no confirmation, all state preserved', () => {
    const rules = getModePreservationRules('map', 'map');
    expect(rules.requiresConfirmation).toBe(false);
    expect(rules.discarded).toHaveLength(0);
  });

  it('map → filterMap: no confirmation, source + item template preserved', () => {
    const rules = getModePreservationRules('map', 'filterMap');
    expect(rules.requiresConfirmation).toBe(false);
    expect(rules.preserved).toContain('Source array selection');
    expect(rules.preserved).toContain('Item template field mappings');
    expect(rules.discarded).toHaveLength(0);
  });

  it('filterMap → map: no confirmation, filter predicate discarded', () => {
    const rules = getModePreservationRules('filterMap', 'map');
    expect(rules.requiresConfirmation).toBe(false);
    expect(rules.preserved).toContain('Source array selection');
    expect(rules.discarded).toContain('Filter predicate configuration');
  });

  it('map → mergeArrayBranches: no confirmation, current setup becomes Branch 1', () => {
    const rules = getModePreservationRules('map', 'mergeArrayBranches');
    expect(rules.requiresConfirmation).toBe(false);
    expect(rules.preserved.some((p) => p.includes('Branch 1'))).toBe(true);
  });

  it('filterMap → mergeArrayBranches: no confirmation, current setup becomes Branch 1', () => {
    const rules = getModePreservationRules('filterMap', 'mergeArrayBranches');
    expect(rules.requiresConfirmation).toBe(false);
  });

  it('mergeArrayBranches → map: requires confirmation', () => {
    const rules = getModePreservationRules('mergeArrayBranches', 'map');
    expect(rules.requiresConfirmation).toBe(true);
    expect(rules.discarded.some((d) => d.includes('branch'))).toBe(true);
  });

  it('mergeArrayBranches → filterMap: requires confirmation', () => {
    const rules = getModePreservationRules('mergeArrayBranches', 'filterMap');
    expect(rules.requiresConfirmation).toBe(true);
  });

  it('buildFromValues → map: requires confirmation, entries discarded', () => {
    const rules = getModePreservationRules('buildFromValues', 'map');
    expect(rules.requiresConfirmation).toBe(true);
    expect(rules.discarded.some((d) => d.includes('values'))).toBe(true);
  });

  it('buildFromValues → filterMap: requires confirmation', () => {
    const rules = getModePreservationRules('buildFromValues', 'filterMap');
    expect(rules.requiresConfirmation).toBe(true);
  });

  it('buildFromValues → mergeArrayBranches: requires confirmation', () => {
    const rules = getModePreservationRules('buildFromValues', 'mergeArrayBranches');
    expect(rules.requiresConfirmation).toBe(true);
  });

  it('map → buildFromValues: requires confirmation', () => {
    const rules = getModePreservationRules('map', 'buildFromValues');
    expect(rules.requiresConfirmation).toBe(true);
  });

  it('any structured → customExpression: no confirmation, structured draft preserved', () => {
    for (const from of ['map', 'filterMap', 'splitString', 'buildFromValues', 'mergeArrayBranches'] as ArrayBuilderMode[]) {
      const rules = getModePreservationRules(from, 'customExpression');
      expect(rules.requiresConfirmation).toBe(false);
      expect(rules.preserved.some((p) => p.includes('structured draft'))).toBe(true);
    }
  });

  it('customExpression → any structured: requires confirmation', () => {
    for (const to of ['map', 'filterMap', 'splitString', 'buildFromValues', 'mergeArrayBranches'] as ArrayBuilderMode[]) {
      const rules = getModePreservationRules('customExpression', to);
      expect(rules.requiresConfirmation).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

describe('createEmptyItemTemplate', () => {
  it('creates template with empty fields and empty nestedArrays map', () => {
    const t = createEmptyItemTemplate();
    expect(t.fields).toHaveLength(0);
    expect(t.nestedArrays.size).toBe(0);
  });
});

describe('createEmptyItemFieldMapping', () => {
  it('creates an empty mapping for the given target field path', () => {
    const m = createEmptyItemFieldMapping('productCode');
    expect(m.kind).toBe('empty');
    expect(m.targetFieldPath).toBe('productCode');
  });
});

describe('createEmptyFilterPredicate', () => {
  it('creates a structured predicate with empty field path and eq operator', () => {
    const p = createEmptyFilterPredicate();
    expect(p.kind).toBe('structured');
    if (p.kind === 'structured') {
      expect(p.left.kind).toBe('itemField');
      expect(p.operator).toBe('eq');
      expect(p.right.kind).toBe('none');
    }
  });
});

describe('createEmptyObjectValueEntry', () => {
  it('creates an object entry with empty fields record', () => {
    const e = createEmptyObjectValueEntry();
    expect(e.kind).toBe('object');
    if (e.kind === 'object') {
      expect(Object.keys(e.fields)).toHaveLength(0);
    }
  });
});

describe('createEmptyPrimitiveValueEntry', () => {
  it('creates a primitive entry with empty value', () => {
    const e = createEmptyPrimitiveValueEntry();
    expect(e.kind).toBe('primitive');
    if (e.kind === 'primitive') {
      expect(e.value.kind).toBe('empty');
    }
  });
});

describe('createEmptyMergeBranch', () => {
  it('creates a branch with empty source path and empty item template', () => {
    const b = createEmptyMergeBranch();
    expect(b.sourceArrayPath).toBe('');
    expect(b.itemTemplate.fields).toHaveLength(0);
  });
});

describe('createEmptyCrossArrayLookup', () => {
  it('creates a lookup state with all empty required fields', () => {
    const s = createEmptyCrossArrayLookup('tax');
    expect(s.kind).toBe('crossArrayLookup');
    expect(s.lookupArrayPath).toBe('');
    expect(s.matchField).toBe('');
    expect(s.compareField).toBe('');
    expect(s.returnField).toBe('');
    expect(s.compareScope).toBe('item');
    expect(s.fallback).toBeUndefined();
  });
});

describe('createCollectionStateForMode', () => {
  it('creates map collection state with empty source path', () => {
    const s = createCollectionStateForMode('map');
    expect(s.mode).toBe('map');
    if (s.mode === 'map') expect(s.sourceArrayPath).toBe('');
  });

  it('creates filterMap collection state with empty filter predicate', () => {
    const s = createCollectionStateForMode('filterMap');
    expect(s.mode).toBe('filterMap');
    if (s.mode === 'filterMap') {
      expect(s.filterPredicate.kind).toBe('structured');
    }
  });

  it('creates buildFromValues collection state with empty entries', () => {
    const s = createCollectionStateForMode('buildFromValues');
    expect(s.mode).toBe('buildFromValues');
    if (s.mode === 'buildFromValues') {
      expect(s.entries).toHaveLength(0);
      expect(s.nullFilteringEnabled).toBe(false);
    }
  });

  it('creates splitString collection state with default options', () => {
    const s = createCollectionStateForMode('splitString');
    expect(s.mode).toBe('splitString');
    if (s.mode === 'splitString') {
      expect(s.sourceStringPath).toBe('');
      expect(s.delimiter).toBe(',');
      expect(s.trimItems).toBe(true);
      expect(s.dropEmpty).toBe(false);
    }
  });

  it('creates mergeArrayBranches collection state with 2 initial branches', () => {
    const s = createCollectionStateForMode('mergeArrayBranches');
    expect(s.mode).toBe('mergeArrayBranches');
    if (s.mode === 'mergeArrayBranches') {
      expect(s.branches).toHaveLength(2);
    }
  });

  it('creates customExpression collection state with empty raw expression', () => {
    const s = createCollectionStateForMode('customExpression');
    expect(s.mode).toBe('customExpression');
    if (s.mode === 'customExpression') {
      expect(s.rawExpression).toBe('');
    }
  });
});

describe('createEmptyArrayBuilderState', () => {
  it('creates state with correct mode and notStarted status for map', () => {
    const s = createEmptyArrayBuilderState('map');
    expect(s.mode).toBe('map');
    expect(s.completionStatus).toBe('notStarted');
    expect(s.previousStructuredDraft).toBeUndefined();
  });

  it('creates state with notStarted status for all modes', () => {
    const modes: ArrayBuilderMode[] = [
      'map',
      'filterMap',
      'splitString',
      'buildFromValues',
      'customExpression',
    ];
    for (const mode of modes) {
      const s = createEmptyArrayBuilderState(mode);
      expect(s.completionStatus).toBe('notStarted');
    }
  });
});

describe('createInitialArrayBuilderState', () => {
  it('creates initial state defaulting to map mode', () => {
    const s = createInitialArrayBuilderState();
    expect(s.mode).toBe('map');
    expect(s.completionStatus).toBe('notStarted');
  });
});

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

describe('type guards', () => {
  it('isMapCollectionState', () => {
    expect(isMapCollectionState(createCollectionStateForMode('map'))).toBe(true);
    expect(isMapCollectionState(createCollectionStateForMode('filterMap'))).toBe(false);
  });

  it('isFilterMapCollectionState', () => {
    expect(isFilterMapCollectionState(createCollectionStateForMode('filterMap'))).toBe(true);
    expect(isFilterMapCollectionState(createCollectionStateForMode('map'))).toBe(false);
  });

  it('isBuildFromValuesCollectionState', () => {
    expect(isBuildFromValuesCollectionState(createCollectionStateForMode('buildFromValues'))).toBe(true);
    expect(isBuildFromValuesCollectionState(createCollectionStateForMode('map'))).toBe(false);
  });

  it('isSplitStringCollectionState', () => {
    expect(isSplitStringCollectionState(createCollectionStateForMode('splitString'))).toBe(true);
    expect(isSplitStringCollectionState(createCollectionStateForMode('map'))).toBe(false);
  });

  it('isMergeBranchesCollectionState', () => {
    expect(isMergeBranchesCollectionState(createCollectionStateForMode('mergeArrayBranches'))).toBe(true);
    expect(isMergeBranchesCollectionState(createCollectionStateForMode('map'))).toBe(false);
  });

  it('isCustomExpressionCollectionState', () => {
    expect(isCustomExpressionCollectionState(createCollectionStateForMode('customExpression'))).toBe(true);
    expect(isCustomExpressionCollectionState(createCollectionStateForMode('map'))).toBe(false);
  });

  it('isStructuredFilterPredicate', () => {
    expect(isStructuredFilterPredicate(createEmptyFilterPredicate())).toBe(true);
    expect(isStructuredFilterPredicate({ kind: 'raw', dsl: 'gt(item("x"), 0)' })).toBe(false);
  });

  it('isRawFilterPredicate', () => {
    expect(isRawFilterPredicate({ kind: 'raw', dsl: 'gt(item("x"), 0)' })).toBe(true);
    expect(isRawFilterPredicate(createEmptyFilterPredicate())).toBe(false);
  });

  it('isChainFieldMapping', () => {
    const m: ItemFieldMapping = { kind: 'chain', targetFieldPath: 'sku', chainState: createEmptyChain() };
    expect(isChainFieldMapping(m)).toBe(true);
    expect(isChainFieldMapping(createEmptyItemFieldMapping('sku'))).toBe(false);
  });

  it('isCrossArrayLookupMapping', () => {
    const m: ItemFieldMapping = {
      kind: 'crossArrayLookup',
      targetFieldPath: 'tax',
      lookupState: createEmptyCrossArrayLookup('tax'),
    };
    expect(isCrossArrayLookupMapping(m)).toBe(true);
    expect(isCrossArrayLookupMapping(createEmptyItemFieldMapping('tax'))).toBe(false);
  });

  it('isExpressionFieldMapping', () => {
    const m: ItemFieldMapping = {
      kind: 'expression',
      targetFieldPath: 'hasDiscount',
      dsl: 'gt(item("discountAmount"), 0)',
    };
    expect(isExpressionFieldMapping(m)).toBe(true);
    expect(isExpressionFieldMapping(createEmptyItemFieldMapping('hasDiscount'))).toBe(false);
  });

  it('isEmptyFieldMapping', () => {
    expect(isEmptyFieldMapping(createEmptyItemFieldMapping('sku'))).toBe(true);
    const m: ItemFieldMapping = { kind: 'chain', targetFieldPath: 'sku', chainState: createEmptyChain() };
    expect(isEmptyFieldMapping(m)).toBe(false);
  });

  it('isObjectValueEntry', () => {
    expect(isObjectValueEntry(createEmptyObjectValueEntry())).toBe(true);
    expect(isObjectValueEntry(createEmptyPrimitiveValueEntry())).toBe(false);
  });

  it('isPrimitiveValueEntry', () => {
    expect(isPrimitiveValueEntry(createEmptyPrimitiveValueEntry())).toBe(true);
    expect(isPrimitiveValueEntry(createEmptyObjectValueEntry())).toBe(false);
  });
});
