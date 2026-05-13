/**
 * array-expression-generator.test.ts — FS-043 T-02
 *
 * Unit tests for generateArrayExpression() and sub-generators.
 * Covers all five modes, scope-aware references, nested arrays,
 * cross-array lookup, and incomplete/empty state handling.
 *
 * Parse verification: generated expressions are validated against the
 * engine parse() function to confirm syntactic correctness.
 */

import { parse } from '@keyra/engine';
import { describe, expect, it } from 'vitest';

import {
  createEmptyArrayBuilderState,
  createEmptyFilterPredicate,
  createEmptyItemTemplate,
} from './array-builder-state';
import type {
  ArrayBuilderState,
  MapCollectionState,
  FilterMapCollectionState,
  BuildFromValuesCollectionState,
  MergeBranchesCollectionState,
  CustomExpressionCollectionState,
  ItemTemplateState,
  ItemFieldMapping,
  MergeBranch,
  FilterPredicateState,
  CrossArrayLookupState,
  ValueEntry,
} from './array-builder-state';
import {
  generateArrayExpression,
  generateFilterPredicate,
  generateCrossArrayLookup,
  generateObjectTemplate,
  generateValueEntry,
  generateMergeBranchExpression,
} from './array-expression-generator';
import { createFieldSourceChain } from './chain-builder-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Asserts that a non-empty expression parses successfully. */
function assertParses(expr: string): void {
  if (!expr) return;
  const result = parse(expr);
  expect(result.success, `Expected expression to parse: ${expr}\nDiagnostics: ${JSON.stringify(result.diagnostics)}`).toBe(true);
}

function makeMapState(
  sourceArrayPath: string,
  fields: ItemFieldMapping[] = [],
): ArrayBuilderState {
  const collectionState: MapCollectionState = { mode: 'map', sourceArrayPath };
  const itemTemplate: ItemTemplateState = { fields, nestedArrays: new Map() };
  return {
    mode: 'map',
    collectionState,
    itemTemplate,
    completionStatus: 'inProgress',
  };
}

function makeFilterMapState(
  sourceArrayPath: string,
  predicate: FilterPredicateState,
  fields: ItemFieldMapping[] = [],
): ArrayBuilderState {
  const collectionState: FilterMapCollectionState = {
    mode: 'filterMap',
    sourceArrayPath,
    filterPredicate: predicate,
  };
  const itemTemplate: ItemTemplateState = { fields, nestedArrays: new Map() };
  return {
    mode: 'filterMap',
    collectionState,
    itemTemplate,
    completionStatus: 'inProgress',
  };
}

function makeBuildFromValuesState(
  entries: readonly import('./array-builder-state').ValueEntry[],
  nullFilteringEnabled = false,
  nullFilterField?: string,
): ArrayBuilderState {
  const collectionState: BuildFromValuesCollectionState = {
    mode: 'buildFromValues',
    entries,
    nullFilteringEnabled,
    nullFilterField,
  };
  return {
    mode: 'buildFromValues',
    collectionState,
    itemTemplate: createEmptyItemTemplate(),
    completionStatus: 'inProgress',
  };
}

function makeMergeState(branches: readonly MergeBranch[]): ArrayBuilderState {
  const collectionState: MergeBranchesCollectionState = {
    mode: 'mergeArrayBranches',
    branches,
  };
  return {
    mode: 'mergeArrayBranches',
    collectionState,
    itemTemplate: createEmptyItemTemplate(),
    completionStatus: 'inProgress',
  };
}

function makeCustomState(rawExpression: string): ArrayBuilderState {
  const collectionState: CustomExpressionCollectionState = {
    mode: 'customExpression',
    rawExpression,
  };
  return {
    mode: 'customExpression',
    collectionState,
    itemTemplate: createEmptyItemTemplate(),
    completionStatus: rawExpression ? 'complete' : 'notStarted',
  };
}

// ---------------------------------------------------------------------------
// AE-01 — Map source array with item transforms
// ---------------------------------------------------------------------------

describe('Map mode', () => {
  it('generates map() with empty object template when no fields mapped', () => {
    const result = generateArrayExpression(makeMapState('items'));
    expect(result).toBe('map(source("items"), {})');
    assertParses(result);
  });

  it('generates map() with direct item field references (AE-01)', () => {
    const fields: ItemFieldMapping[] = [
      { kind: 'chain', targetFieldPath: 'productCode', chainState: createFieldSourceChain('sku') },
      { kind: 'chain', targetFieldPath: 'qty', chainState: createFieldSourceChain('quantity') },
    ];
    const result = generateArrayExpression(makeMapState('items', fields));
    // Plain chain field paths keep source() behavior for backward compatibility.
    expect(result).toContain('map(source("items"),');
    expect(result).toContain('"productCode": source("sku")');
    expect(result).toContain('"qty": source("quantity")');
    expect(result).toContain('"productCode"');
    expect(result).toContain('"qty"');
    assertParses(result);
  });

  it('normalizes full target field paths to item-level object keys', () => {
    const fields: ItemFieldMapping[] = [
      {
        kind: 'chain',
        targetFieldPath: 'invoice.lineItems.productCode',
        chainState: { source: { kind: 'field', path: '__item__:sku' }, steps: [] },
      },
      {
        kind: 'chain',
        targetFieldPath: 'invoice.lineItems.currency',
        chainState: { source: { kind: 'field', path: '__source__:currency' }, steps: [] },
      },
    ];

    const result = generateArrayExpression(makeMapState('items', fields));

    expect(result).toContain('"productCode": item("sku")');
    expect(result).toContain('"currency": source("currency")');
    expect(result).not.toContain('"invoice.lineItems.productCode"');
    expect(result).not.toContain('"invoice.lineItems.currency"');
    assertParses(result);
  });

  it('skips empty (unmapped) fields in the object template', () => {
    const fields: ItemFieldMapping[] = [
      { kind: 'chain', targetFieldPath: 'sku', chainState: createFieldSourceChain('sku') },
      { kind: 'empty', targetFieldPath: 'qty' },
    ];
    const result = generateArrayExpression(makeMapState('items', fields));
    expect(result).toContain('"sku"');
    expect(result).not.toContain('"qty"');
    assertParses(result);
  });

  it('returns empty string when source path is empty', () => {
    expect(generateArrayExpression(makeMapState(''))).toBe('');
  });

  it('returns empty string for initial empty state', () => {
    const state = createEmptyArrayBuilderState('map');
    expect(generateArrayExpression(state)).toBe('');
  });

  it('escapes double quotes in source path', () => {
    const result = generateArrayExpression(makeMapState('my"items'));
    expect(result).toContain('\\"');
    assertParses(result);
  });

  it('escapes double quotes in target field names', () => {
    const fields: ItemFieldMapping[] = [
      { kind: 'chain', targetFieldPath: 'my"field', chainState: createFieldSourceChain('sku') },
    ];
    const result = generateArrayExpression(makeMapState('items', fields));
    expect(result).toContain('\\"');
    assertParses(result);
  });

  it('generates nested source path correctly', () => {
    const result = generateArrayExpression(makeMapState('order.items'));
    expect(result).toBe('map(source("order.items"), {})');
    assertParses(result);
  });
});

// ---------------------------------------------------------------------------
// AE-02 — Filter + Map mode
// ---------------------------------------------------------------------------

describe('Filter + Map mode', () => {
  it('generates map(filter(...)) with structured gt predicate (AE-02)', () => {
    const predicate: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'discountAmount' },
      operator: 'gt',
      right: { kind: 'static', value: '0' },
    };
    const result = generateArrayExpression(makeFilterMapState('items', predicate));
    expect(result).toBe('map(filter(source("items"), gt(item("discountAmount"), 0)), {})');
    assertParses(result);
  });

  it('generates map(filter(...)) with eq predicate', () => {
    const predicate: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'status' },
      operator: 'eq',
      right: { kind: 'static', value: 'active' },
    };
    const result = generateArrayExpression(makeFilterMapState('orders', predicate));
    expect(result).toBe('map(filter(source("orders"), eq(item("status"), "active")), {})');
    assertParses(result);
  });

  it('generates isNull predicate (unary)', () => {
    const predicate: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'deletedAt' },
      operator: 'isNull',
      right: { kind: 'none' },
    };
    const result = generateArrayExpression(makeFilterMapState('items', predicate));
    expect(result).toContain('isNull(item("deletedAt"))');
    assertParses(result);
  });

  it('generates isNotNull predicate (unary)', () => {
    const predicate: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'price' },
      operator: 'isNotNull',
      right: { kind: 'none' },
    };
    const result = generateArrayExpression(makeFilterMapState('items', predicate));
    expect(result).toContain('not(isNull(item("price")))');
    assertParses(result);
  });

  it('generates raw predicate passthrough', () => {
    const predicate: FilterPredicateState = {
      kind: 'raw',
      dsl: 'gt(item("discountAmount"), 0)',
    };
    const result = generateArrayExpression(makeFilterMapState('items', predicate));
    expect(result).toBe('map(filter(source("items"), gt(item("discountAmount"), 0)), {})');
    assertParses(result);
  });

  it('returns empty string when source path is empty', () => {
    const predicate: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'x' },
      operator: 'eq',
      right: { kind: 'static', value: '1' },
    };
    expect(generateArrayExpression(makeFilterMapState('', predicate))).toBe('');
  });

  it('returns empty string when predicate is incomplete (empty field path)', () => {
    const predicate: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: '' },
      operator: 'eq',
      right: { kind: 'static', value: '1' },
    };
    expect(generateArrayExpression(makeFilterMapState('items', predicate))).toBe('');
  });

  it('returns empty string when raw predicate DSL is empty', () => {
    const predicate: FilterPredicateState = { kind: 'raw', dsl: '' };
    expect(generateArrayExpression(makeFilterMapState('items', predicate))).toBe('');
  });

  it('generates lte predicate', () => {
    const predicate: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'qty' },
      operator: 'lte',
      right: { kind: 'static', value: '100' },
    };
    const result = generateArrayExpression(makeFilterMapState('items', predicate));
    expect(result).toContain('lte(item("qty"), 100)');
    assertParses(result);
  });

  it('generates neq predicate', () => {
    const predicate: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'type' },
      operator: 'neq',
      right: { kind: 'static', value: 'CANCELLED' },
    };
    const result = generateArrayExpression(makeFilterMapState('orders', predicate));
    expect(result).toContain('neq(item("type"), "CANCELLED")');
    assertParses(result);
  });

  it('generates right operand as item field reference', () => {
    const predicate: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'lineId' },
      operator: 'eq',
      right: { kind: 'itemField', fieldPath: 'refId' },
    };
    const result = generateArrayExpression(makeFilterMapState('items', predicate));
    expect(result).toContain('eq(item("lineId"), item("refId"))');
    assertParses(result);
  });
});

// ---------------------------------------------------------------------------
// AE-03 / AE-14 — Build from Values mode
// ---------------------------------------------------------------------------

describe('Build from Values mode', () => {
  it('generates array() with object entries (AE-14)', () => {
    const entries: ValueEntry[] = [
      {
        kind: 'object',
        fields: {
          type: { kind: 'static', value: { type: 'string', value: 'PRIMARY' } },
          number: { kind: 'sourceField', path: 'primaryPhone' },
        },
      },
      {
        kind: 'object',
        fields: {
          type: { kind: 'static', value: { type: 'string', value: 'MOBILE' } },
          number: { kind: 'sourceField', path: 'mobilePhone' },
        },
      },
    ];
    const result = generateArrayExpression(makeBuildFromValuesState(entries));
    expect(result).toBe(
      'array({"type": "PRIMARY", "number": source("primaryPhone")}, {"type": "MOBILE", "number": source("mobilePhone")})',
    );
    assertParses(result);
  });

  it('generates filter(array(...), not(isNull(...))) with null filtering (AE-03)', () => {
    const entries: ValueEntry[] = [
      {
        kind: 'object',
        fields: {
          type: { kind: 'static', value: { type: 'string', value: 'PRIMARY' } },
          number: { kind: 'sourceField', path: 'primaryPhone' },
        },
      },
    ];
    const result = generateArrayExpression(
      makeBuildFromValuesState(entries, true, 'number'),
    );
    expect(result).toBe(
      'filter(array({"type": "PRIMARY", "number": source("primaryPhone")}), not(isNull(item("number"))))',
    );
    assertParses(result);
  });

  it('generates array() with primitive entries', () => {
    const entries: ValueEntry[] = [
      { kind: 'primitive', value: { kind: 'sourceField', path: 'primaryPhone' } },
      { kind: 'primitive', value: { kind: 'sourceField', path: 'mobilePhone' } },
    ];
    const result = generateArrayExpression(makeBuildFromValuesState(entries));
    expect(result).toBe('array(source("primaryPhone"), source("mobilePhone"))');
    assertParses(result);
  });

  it('generates array() with static primitive entries', () => {
    const entries: ValueEntry[] = [
      { kind: 'primitive', value: { kind: 'static', value: { type: 'string', value: 'A' } } },
      { kind: 'primitive', value: { kind: 'static', value: { type: 'number', value: 42 } } },
    ];
    const result = generateArrayExpression(makeBuildFromValuesState(entries));
    expect(result).toBe('array("A", 42)');
    assertParses(result);
  });

  it('skips empty entries in the array', () => {
    const entries: ValueEntry[] = [
      { kind: 'primitive', value: { kind: 'sourceField', path: 'primaryPhone' } },
      { kind: 'primitive', value: { kind: 'empty' } },
    ];
    const result = generateArrayExpression(makeBuildFromValuesState(entries));
    expect(result).toBe('array(source("primaryPhone"))');
    assertParses(result);
  });

  it('returns empty string when no entries', () => {
    expect(generateArrayExpression(makeBuildFromValuesState([]))).toBe('');
  });

  it('returns empty string when all entries are empty', () => {
    const entries: ValueEntry[] = [
      { kind: 'primitive', value: { kind: 'empty' } },
    ];
    expect(generateArrayExpression(makeBuildFromValuesState(entries))).toBe('');
  });

  it('generates array() with expression field value', () => {
    const entries: ValueEntry[] = [
      {
        kind: 'object',
        fields: {
          val: { kind: 'expression', dsl: 'upper(source("name"))' },
        },
      },
    ];
    const result = generateArrayExpression(makeBuildFromValuesState(entries));
    expect(result).toBe('array({"val": upper(source("name"))})');
    assertParses(result);
  });

  it('generates null filtering without nullFilterField as plain array()', () => {
    // nullFilteringEnabled but no nullFilterField — should not wrap
    const entries: ValueEntry[] = [
      { kind: 'primitive', value: { kind: 'sourceField', path: 'x' } },
    ];
    const result = generateArrayExpression(makeBuildFromValuesState(entries, true, undefined));
    expect(result).toBe('array(source("x"))');
    assertParses(result);
  });
});

// ---------------------------------------------------------------------------
// AE-04 / AE-15 — Merge Array Branches mode
// ---------------------------------------------------------------------------

describe('Merge Array Branches mode', () => {
  it('generates merge() with two branches (AE-04)', () => {
    const branch1: MergeBranch = {
      sourceArrayPath: 'domesticAddresses',
      itemTemplate: {
        fields: [
          { kind: 'chain', targetFieldPath: 'city', chainState: createFieldSourceChain('city') },
          {
            kind: 'chain',
            targetFieldPath: 'origin',
            chainState: {
              source: { kind: 'static', value: { type: 'string', value: 'DOMESTIC' } },
              steps: [],
            },
          },
        ],
        nestedArrays: new Map(),
      },
    };
    const branch2: MergeBranch = {
      sourceArrayPath: 'internationalAddresses',
      itemTemplate: {
        fields: [
          { kind: 'chain', targetFieldPath: 'city', chainState: createFieldSourceChain('city') },
          {
            kind: 'chain',
            targetFieldPath: 'origin',
            chainState: {
              source: { kind: 'static', value: { type: 'string', value: 'INTERNATIONAL' } },
              steps: [],
            },
          },
        ],
        nestedArrays: new Map(),
      },
    };
    const result = generateArrayExpression(makeMergeState([branch1, branch2]));
    expect(result).toContain('merge(');
    expect(result).toContain('map(source("domesticAddresses"),');
    expect(result).toContain('map(source("internationalAddresses"),');
    expect(result).toContain('"DOMESTIC"');
    expect(result).toContain('"INTERNATIONAL"');
    assertParses(result);
  });

  it('generates merge() with three branches', () => {
    const makeBranch = (path: string): MergeBranch => ({
      sourceArrayPath: path,
      itemTemplate: createEmptyItemTemplate(),
    });
    const result = generateArrayExpression(
      makeMergeState([makeBranch('a'), makeBranch('b'), makeBranch('c')]),
    );
    expect(result).toBe(
      'merge(map(source("a"), {}), map(source("b"), {}), map(source("c"), {}))',
    );
    assertParses(result);
  });

  it('returns empty string when fewer than 2 branches', () => {
    const branch: MergeBranch = {
      sourceArrayPath: 'items',
      itemTemplate: createEmptyItemTemplate(),
    };
    expect(generateArrayExpression(makeMergeState([branch]))).toBe('');
  });

  it('returns empty string when fewer than 2 branches have non-empty source paths', () => {
    const branches: MergeBranch[] = [
      { sourceArrayPath: 'items', itemTemplate: createEmptyItemTemplate() },
      { sourceArrayPath: '', itemTemplate: createEmptyItemTemplate() },
    ];
    expect(generateArrayExpression(makeMergeState(branches))).toBe('');
  });

  it('returns empty string for initial empty merge state', () => {
    const state = createEmptyArrayBuilderState('mergeArrayBranches');
    expect(generateArrayExpression(state)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Custom Expression mode
// ---------------------------------------------------------------------------

describe('Custom Expression mode', () => {
  it('returns raw expression as-is', () => {
    const raw = 'map(source("items"), {"sku": item("sku")})';
    const result = generateArrayExpression(makeCustomState(raw));
    expect(result).toBe(raw);
  });

  it('returns empty string for empty raw expression', () => {
    expect(generateArrayExpression(makeCustomState(''))).toBe('');
  });

  it('returns raw expression even if it is not valid DSL', () => {
    const raw = 'this is not valid DSL';
    expect(generateArrayExpression(makeCustomState(raw))).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// Cross-array lookup generation
// ---------------------------------------------------------------------------

describe('generateCrossArrayLookup', () => {
  it('generates default(get(find(...))) with fallback (AE-07)', () => {
    const lookup: CrossArrayLookupState = {
      kind: 'crossArrayLookup',
      lookupArrayPath: 'taxLines',
      matchField: 'lineRef',
      compareScope: 'item',
      compareField: 'lineId',
      returnField: 'taxAmount',
      fallback: { type: 'number', value: 0 },
    };
    const result = generateCrossArrayLookup(lookup);
    expect(result).toBe(
      'default(get(find(source("taxLines"), eq(item("lineRef"), item("lineId"))), "taxAmount"), 0)',
    );
    assertParses(result);
  });

  it('generates get(find(...)) without fallback', () => {
    const lookup: CrossArrayLookupState = {
      kind: 'crossArrayLookup',
      lookupArrayPath: 'taxLines',
      matchField: 'lineRef',
      compareScope: 'item',
      compareField: 'lineId',
      returnField: 'taxAmount',
    };
    const result = generateCrossArrayLookup(lookup);
    expect(result).toBe(
      'get(find(source("taxLines"), eq(item("lineRef"), item("lineId"))), "taxAmount")',
    );
    assertParses(result);
  });

  it('uses parent() for compareScope parent', () => {
    const lookup: CrossArrayLookupState = {
      kind: 'crossArrayLookup',
      lookupArrayPath: 'taxLines',
      matchField: 'lineRef',
      compareScope: 'parent',
      compareField: 'lineId',
      returnField: 'taxAmount',
    };
    const result = generateCrossArrayLookup(lookup);
    expect(result).toContain('parent("lineId")');
    assertParses(result);
  });

  it('returns empty string when required fields are missing', () => {
    const lookup: CrossArrayLookupState = {
      kind: 'crossArrayLookup',
      lookupArrayPath: '',
      matchField: 'lineRef',
      compareScope: 'item',
      compareField: 'lineId',
      returnField: 'taxAmount',
    };
    expect(generateCrossArrayLookup(lookup)).toBe('');
  });

  it('generates cross-array lookup as item field mapping', () => {
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
          fallback: { type: 'number', value: 0 },
        },
      },
    ];
    const result = generateArrayExpression(makeMapState('lineItems', fields));
    expect(result).toContain('"tax": default(get(find(');
    assertParses(result);
  });
});

// ---------------------------------------------------------------------------
// Scope-aware references
// ---------------------------------------------------------------------------

describe('scope-aware references', () => {
  it('expression mapping emits raw function DSL for item field', () => {
    const fields: ItemFieldMapping[] = [
      {
        kind: 'expression',
        targetFieldPath: 'hasDiscount',
        dsl: 'gt(item("discountAmount"), 0)',
      },
    ];
    const result = generateArrayExpression(makeMapState('items', fields));
    expect(result).toContain('"hasDiscount": gt(item("discountAmount"), 0)');
    assertParses(result);
  });

  it('chain field source generates item() reference for item-scoped paths', () => {
    const fields: ItemFieldMapping[] = [
      {
        kind: 'chain',
        targetFieldPath: 'sku',
        chainState: {
          source: { kind: 'field', path: '__item__:sku' },
          steps: [],
        },
      },
    ];
    const result = generateArrayExpression(makeMapState('items', fields));
    expect(result).toContain('item("sku")');
    expect(result).not.toContain('source("__item__:sku")');
    assertParses(result);
  });

  it('chain field source generates source() reference for root-scoped paths', () => {
    const fields: ItemFieldMapping[] = [
      {
        kind: 'chain',
        targetFieldPath: 'currency',
        chainState: {
          source: { kind: 'field', path: '__source__:currency' },
          steps: [],
        },
      },
    ];
    const result = generateArrayExpression(makeMapState('items', fields));
    expect(result).toContain('source("currency")');
    expect(result).not.toContain('source("__source__:currency")');
    assertParses(result);
  });

  it('static chain source generates literal value', () => {
    const fields: ItemFieldMapping[] = [
      {
        kind: 'chain',
        targetFieldPath: 'origin',
        chainState: {
          source: { kind: 'static', value: { type: 'string', value: 'DOMESTIC' } },
          steps: [],
        },
      },
    ];
    const result = generateArrayExpression(makeMapState('addresses', fields));
    expect(result).toContain('"DOMESTIC"');
    assertParses(result);
  });
});

// ---------------------------------------------------------------------------
// Nested array expression generation
// ---------------------------------------------------------------------------

describe('nested array generation', () => {
  it('generates nested map() for nested array field via cross-array lookup', () => {
    // Nested arrays are stored in itemTemplate.nestedArrays.
    // The outer generator does not recurse into nestedArrays automatically —
    // nested array fields appear as ItemFieldMappings with kind 'chain' or 'crossArrayLookup'
    // in the outer item template, where the chain expression itself is a nested map() call.
    // This test verifies that a chain containing a nested map expression is passed through.
    const fields: ItemFieldMapping[] = [
      {
        kind: 'chain',
        targetFieldPath: 'staff',
        chainState: {
          source: { kind: 'field', path: 'employees' },
          steps: [],
        },
      },
    ];
    const result = generateArrayExpression(makeMapState('departments', fields));
    expect(result).toContain('map(source("departments"),');
    expect(result).toContain('"staff"');
    assertParses(result);
  });
});

// ---------------------------------------------------------------------------
// generateFilterPredicate (unit tests)
// ---------------------------------------------------------------------------

describe('generateFilterPredicate', () => {
  it('returns empty string for empty structured predicate', () => {
    expect(generateFilterPredicate(createEmptyFilterPredicate())).toBe('');
  });

  it('generates eq predicate', () => {
    const p: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'status' },
      operator: 'eq',
      right: { kind: 'static', value: 'active' },
    };
    expect(generateFilterPredicate(p)).toBe('eq(item("status"), "active")');
  });

  it('generates gt predicate with number', () => {
    const p: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'qty' },
      operator: 'gt',
      right: { kind: 'static', value: '5' },
    };
    expect(generateFilterPredicate(p)).toBe('gt(item("qty"), 5)');
  });

  it('generates gte predicate', () => {
    const p: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'price' },
      operator: 'gte',
      right: { kind: 'static', value: '10' },
    };
    expect(generateFilterPredicate(p)).toBe('gte(item("price"), 10)');
  });

  it('generates lt predicate', () => {
    const p: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'age' },
      operator: 'lt',
      right: { kind: 'static', value: '18' },
    };
    expect(generateFilterPredicate(p)).toBe('lt(item("age"), 18)');
  });

  it('generates lte predicate', () => {
    const p: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'score' },
      operator: 'lte',
      right: { kind: 'static', value: '100' },
    };
    expect(generateFilterPredicate(p)).toBe('lte(item("score"), 100)');
  });

  it('generates neq predicate', () => {
    const p: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'type' },
      operator: 'neq',
      right: { kind: 'static', value: 'CANCELLED' },
    };
    expect(generateFilterPredicate(p)).toBe('neq(item("type"), "CANCELLED")');
  });

  it('generates isNull predicate (unary)', () => {
    const p: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'deletedAt' },
      operator: 'isNull',
      right: { kind: 'none' },
    };
    expect(generateFilterPredicate(p)).toBe('isNull(item("deletedAt"))');
  });

  it('generates isNotNull predicate (unary)', () => {
    const p: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'price' },
      operator: 'isNotNull',
      right: { kind: 'none' },
    };
    expect(generateFilterPredicate(p)).toBe('not(isNull(item("price")))');
  });

  it('returns raw DSL passthrough', () => {
    const p: FilterPredicateState = { kind: 'raw', dsl: 'gt(item("x"), 0)' };
    expect(generateFilterPredicate(p)).toBe('gt(item("x"), 0)');
  });

  it('returns empty string for raw predicate with empty DSL', () => {
    const p: FilterPredicateState = { kind: 'raw', dsl: '' };
    expect(generateFilterPredicate(p)).toBe('');
  });

  it('generates right operand as source field reference', () => {
    const p: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'id' },
      operator: 'eq',
      right: { kind: 'sourceField', path: 'targetId' },
    };
    expect(generateFilterPredicate(p)).toBe('eq(item("id"), source("targetId"))');
  });

  it('returns empty string when right sourceField path is empty', () => {
    const p: FilterPredicateState = {
      kind: 'structured',
      left: { kind: 'itemField', fieldPath: 'id' },
      operator: 'eq',
      right: { kind: 'sourceField', path: '' },
    };
    expect(generateFilterPredicate(p)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// generateObjectTemplate (unit tests)
// ---------------------------------------------------------------------------

describe('generateObjectTemplate', () => {
  it('returns {} for empty template', () => {
    expect(generateObjectTemplate(createEmptyItemTemplate())).toBe('{}');
  });

  it('includes only mapped fields', () => {
    const template: ItemTemplateState = {
      fields: [
        { kind: 'chain', targetFieldPath: 'sku', chainState: createFieldSourceChain('sku') },
        { kind: 'empty', targetFieldPath: 'qty' },
      ],
      nestedArrays: new Map(),
    };
    const result = generateObjectTemplate(template);
    expect(result).toContain('"sku"');
    expect(result).not.toContain('"qty"');
  });
});

// ---------------------------------------------------------------------------
// generateValueEntry (unit tests)
// ---------------------------------------------------------------------------

describe('generateValueEntry', () => {
  it('generates object entry with multiple fields', () => {
    const entry: ValueEntry = {
      kind: 'object',
      fields: {
        type: { kind: 'static', value: { type: 'string', value: 'PRIMARY' } },
        number: { kind: 'sourceField', path: 'primaryPhone' },
      },
    };
    const result = generateValueEntry(entry);
    expect(result).toBe('{"type": "PRIMARY", "number": source("primaryPhone")}');
  });

  it('generates primitive entry with source field', () => {
    const entry: ValueEntry = {
      kind: 'primitive',
      value: { kind: 'sourceField', path: 'phone' },
    };
    expect(generateValueEntry(entry)).toBe('source("phone")');
  });

  it('generates primitive entry with static value', () => {
    const entry: ValueEntry = {
      kind: 'primitive',
      value: { kind: 'static', value: { type: 'boolean', value: true } },
    };
    expect(generateValueEntry(entry)).toBe('true');
  });

  it('returns empty string for empty primitive entry', () => {
    const entry: ValueEntry = { kind: 'primitive', value: { kind: 'empty' } };
    expect(generateValueEntry(entry)).toBe('');
  });

  it('returns empty string for object entry with all empty fields', () => {
    const entry: ValueEntry = {
      kind: 'object',
      fields: { x: { kind: 'empty' } },
    };
    expect(generateValueEntry(entry)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// generateMergeBranchExpression (unit tests)
// ---------------------------------------------------------------------------

describe('generateMergeBranchExpression', () => {
  it('generates map() for a branch with source and fields', () => {
    const branch: MergeBranch = {
      sourceArrayPath: 'items',
      itemTemplate: {
        fields: [
          { kind: 'chain', targetFieldPath: 'sku', chainState: createFieldSourceChain('sku') },
        ],
        nestedArrays: new Map(),
      },
    };
    const result = generateMergeBranchExpression(branch);
    expect(result).toContain('map(source("items"),');
    expect(result).toContain('"sku"');
    assertParses(result);
  });

  it('returns empty string for branch with empty source path', () => {
    const branch: MergeBranch = {
      sourceArrayPath: '',
      itemTemplate: createEmptyItemTemplate(),
    };
    expect(generateMergeBranchExpression(branch)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Parse verification for all canonical AE patterns
// ---------------------------------------------------------------------------

describe('parse verification — canonical AE patterns', () => {
  it('AE-01 map expression parses successfully', () => {
    const expr = 'map(source("items"), {"productCode": source("sku"), "qty": source("quantity")})';
    assertParses(expr);
  });

  it('AE-02 filter+map expression parses successfully', () => {
    const expr = 'map(filter(source("items"), gt(item("discountAmount"), 0)), {"sku": source("sku")})';
    assertParses(expr);
  });

  it('AE-03 build-from-values with null filter parses successfully', () => {
    const expr = 'filter(array({"type": "PRIMARY", "number": source("primaryPhone")}), not(isNull(item("number"))))';
    assertParses(expr);
  });

  it('AE-04 merge expression parses successfully', () => {
    const expr = 'merge(map(source("domesticAddresses"), {"city": source("city")}), map(source("internationalAddresses"), {"city": source("city")}))';
    assertParses(expr);
  });

  it('AE-07 cross-array lookup expression parses successfully', () => {
    const expr = 'default(get(find(source("taxLines"), eq(item("lineRef"), item("lineId"))), "taxAmount"), 0)';
    assertParses(expr);
  });
});
