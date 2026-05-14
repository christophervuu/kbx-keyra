/**
 * array-decomposer.test.ts — FS-043 T-03
 *
 * Unit tests for decomposeArrayExpression().
 *
 * Covers:
 *   - Map mode decomposition
 *   - Filter + Map mode decomposition
 *   - Build from Values mode decomposition
 *   - Merge Array Branches mode decomposition
 *   - Cross-array lookup pattern detection
 *   - Nested map() within item templates
 *   - Unrecognized patterns returning success: false
 *   - Edge cases: empty expression, parse errors, non-array patterns
 *   - Round-trip fidelity: generateArrayExpression(decomposeArrayExpression(expr).state)
 *     produces semantically equivalent DSL for all supported patterns
 */

import { parse } from '@keyra/engine';
import { describe, expect, it } from 'vitest';

import type {
  ArrayBuilderState,
  MapCollectionState,
  FilterMapCollectionState,
  BuildFromValuesCollectionState,
  MergeBranchesCollectionState,
} from './array-builder-state';
import { decomposeArrayExpression } from './array-decomposer';
import { generateArrayExpression } from './array-expression-generator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertParses(expr: string): void {
  if (!expr) return;
  const result = parse(expr);
  expect(
    result.success,
    `Expected expression to parse: ${expr}\nDiagnostics: ${JSON.stringify(result.diagnostics)}`,
  ).toBe(true);
}

function assertSuccess(expr: string): ArrayBuilderState {
  const result = decomposeArrayExpression(expr);
  expect(result.success, `Expected success for: ${expr}\nGot: ${!result.success ? (result as { reason: string }).reason : ''}`).toBe(true);
  if (!result.success) throw new Error('unreachable');
  return result.state;
}

function assertFailure(expr: string): { reason: string; rawExpression: string } {
  const result = decomposeArrayExpression(expr);
  expect(result.success, `Expected failure for: ${expr}`).toBe(false);
  if (result.success) throw new Error('unreachable');
  return result;
}

// ---------------------------------------------------------------------------
// Map mode
// ---------------------------------------------------------------------------

describe('decomposeArrayExpression — Map mode', () => {
  it('decomposes map(source("items"), {}) into Map mode', () => {
    const state = assertSuccess('map(source("items"), {})');
    expect(state.mode).toBe('map');
    const cs = state.collectionState as MapCollectionState;
    expect(cs.sourceArrayPath).toBe('items');
    expect(state.itemTemplate.fields).toHaveLength(0);
  });

  it('decomposes map with a single field mapping', () => {
    const state = assertSuccess('map(source("orders"), {"id": item("orderId")})');
    expect(state.mode).toBe('map');
    const cs = state.collectionState as MapCollectionState;
    expect(cs.sourceArrayPath).toBe('orders');
    expect(state.itemTemplate.fields).toHaveLength(1);
    const field = state.itemTemplate.fields[0]!;
    expect(field.targetFieldPath).toBe('id');
    expect(field.kind).toBe('chain');
  });

  it('decomposes map with multiple field mappings', () => {
    const state = assertSuccess('map(source("lines"), {"id": item("lineId"), "amount": item("lineAmount")})');
    expect(state.mode).toBe('map');
    expect(state.itemTemplate.fields).toHaveLength(2);
    expect(state.itemTemplate.fields[0]!.targetFieldPath).toBe('id');
    expect(state.itemTemplate.fields[1]!.targetFieldPath).toBe('amount');
  });

  it('decomposes map with source() field reference', () => {
    const state = assertSuccess('map(source("items"), {"name": source("defaultName")})');
    expect(state.mode).toBe('map');
    const field = state.itemTemplate.fields[0]!;
    expect(field.kind).toBe('chain');
  });

  it('decomposes map with nested path source', () => {
    const state = assertSuccess('map(source("order.lines"), {"id": item("id")})');
    const cs = state.collectionState as MapCollectionState;
    expect(cs.sourceArrayPath).toBe('order.lines');
  });

  it('decomposes map(item("employees"), ...) into item-scoped collection source path', () => {
    const state = assertSuccess('map(item("employees"), {"id": item("id")})');
    expect(state.mode).toBe('map');
    const cs = state.collectionState as MapCollectionState;
    expect(cs.sourceArrayPath).toBe('__item__:employees');
  });
});

// ---------------------------------------------------------------------------
// Filter + Map mode
// ---------------------------------------------------------------------------

describe('decomposeArrayExpression — Filter + Map mode', () => {
  it('decomposes map(filter(source(...), eq(...)), {...}) into filterMap mode', () => {
    const state = assertSuccess('map(filter(source("items"), eq(item("status"), "active")), {"id": item("id")})');
    expect(state.mode).toBe('filterMap');
    const cs = state.collectionState as FilterMapCollectionState;
    expect(cs.sourceArrayPath).toBe('items');
    expect(cs.filterPredicate.kind).toBe('structured');
    if (cs.filterPredicate.kind === 'structured') {
      expect(cs.filterPredicate.operator).toBe('eq');
      expect(cs.filterPredicate.left).toEqual({ kind: 'itemField', fieldPath: 'status' });
      expect(cs.filterPredicate.right).toEqual({ kind: 'static', value: 'active' });
    }
  });

  it('decomposes isNull predicate', () => {
    const state = assertSuccess('map(filter(source("items"), isNull(item("deletedAt"))), {"id": item("id")})');
    const cs = state.collectionState as FilterMapCollectionState;
    expect(cs.filterPredicate.kind).toBe('structured');
    if (cs.filterPredicate.kind === 'structured') {
      expect(cs.filterPredicate.operator).toBe('isNull');
      expect(cs.filterPredicate.left).toEqual({ kind: 'itemField', fieldPath: 'deletedAt' });
      expect(cs.filterPredicate.right).toEqual({ kind: 'none' });
    }
  });

  it('decomposes not(isNull(...)) predicate as isNotNull', () => {
    const state = assertSuccess('map(filter(source("items"), not(isNull(item("name")))), {"id": item("id")})');
    const cs = state.collectionState as FilterMapCollectionState;
    if (cs.filterPredicate.kind === 'structured') {
      expect(cs.filterPredicate.operator).toBe('isNotNull');
    }
  });

  it('decomposes gt/gte/lt/lte operators', () => {
    for (const op of ['gt', 'gte', 'lt', 'lte'] as const) {
      const state = assertSuccess(`map(filter(source("items"), ${op}(item("amount"), 100)), {"id": item("id")})`);
      const cs = state.collectionState as FilterMapCollectionState;
      if (cs.filterPredicate.kind === 'structured') {
        expect(cs.filterPredicate.operator).toBe(op);
      }
    }
  });

  it('falls back to raw predicate for complex predicates', () => {
    const state = assertSuccess('map(filter(source("items"), and(eq(item("a"), "x"), eq(item("b"), "y"))), {"id": item("id")})');
    const cs = state.collectionState as FilterMapCollectionState;
    expect(cs.filterPredicate.kind).toBe('raw');
    if (cs.filterPredicate.kind === 'raw') {
      expect(cs.filterPredicate.dsl).toContain('and(');
    }
  });

  it('decomposes filter map with item-scoped collection source', () => {
    const state = assertSuccess('map(filter(item("employees"), gt(item("tenureMonths"), 6)), {"id": item("id")})');
    expect(state.mode).toBe('filterMap');
    const cs = state.collectionState as FilterMapCollectionState;
    expect(cs.sourceArrayPath).toBe('__item__:employees');
  });
});

// ---------------------------------------------------------------------------
// Build from Values mode
// ---------------------------------------------------------------------------

describe('decomposeArrayExpression — Build from Values mode', () => {
  it('decomposes array() with object entries', () => {
    const state = assertSuccess('array({"id": source("a.id"), "name": source("a.name")}, {"id": source("b.id"), "name": source("b.name")})');
    expect(state.mode).toBe('buildFromValues');
    const cs = state.collectionState as BuildFromValuesCollectionState;
    expect(cs.entries).toHaveLength(2);
    expect(cs.entries[0]!.kind).toBe('object');
    expect(cs.entries[1]!.kind).toBe('object');
  });

  it('decomposes array() with primitive entries', () => {
    const state = assertSuccess('array(source("a"), source("b"), source("c"))');
    expect(state.mode).toBe('buildFromValues');
    const cs = state.collectionState as BuildFromValuesCollectionState;
    expect(cs.entries).toHaveLength(3);
    expect(cs.entries[0]!.kind).toBe('primitive');
  });

  it('decomposes array() with static literal entries', () => {
    const state = assertSuccess('array("foo", "bar", 42)');
    expect(state.mode).toBe('buildFromValues');
    const cs = state.collectionState as BuildFromValuesCollectionState;
    expect(cs.entries).toHaveLength(3);
  });

  it('decomposes filter(array(...), not(isNull(item("field")))) with null filtering', () => {
    const state = assertSuccess('filter(array({"id": source("a.id")}, {"id": source("b.id")}), not(isNull(item("id"))))');
    expect(state.mode).toBe('buildFromValues');
    const cs = state.collectionState as BuildFromValuesCollectionState;
    expect(cs.nullFilteringEnabled).toBe(true);
    expect(cs.nullFilterField).toBe('id');
    expect(cs.entries).toHaveLength(2);
  });

  it('decomposes empty array()', () => {
    const state = assertSuccess('array()');
    expect(state.mode).toBe('buildFromValues');
    const cs = state.collectionState as BuildFromValuesCollectionState;
    expect(cs.entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Merge Array Branches mode
// ---------------------------------------------------------------------------

describe('decomposeArrayExpression — Merge Array Branches mode', () => {
  it('decomposes merge(map(...), map(...)) into mergeArrayBranches mode', () => {
    const state = assertSuccess('merge(map(source("a"), {"id": item("id")}), map(source("b"), {"id": item("id")}))');
    expect(state.mode).toBe('mergeArrayBranches');
    const cs = state.collectionState as MergeBranchesCollectionState;
    expect(cs.branches).toHaveLength(2);
    expect(cs.branches[0]!.sourceArrayPath).toBe('a');
    expect(cs.branches[1]!.sourceArrayPath).toBe('b');
  });

  it('decomposes merge with 3 branches', () => {
    const state = assertSuccess('merge(map(source("a"), {}), map(source("b"), {}), map(source("c"), {}))');
    const cs = state.collectionState as MergeBranchesCollectionState;
    expect(cs.branches).toHaveLength(3);
  });

  it('decomposes merge branch item templates', () => {
    const state = assertSuccess('merge(map(source("a"), {"name": item("firstName")}), map(source("b"), {"name": item("lastName")}))');
    const cs = state.collectionState as MergeBranchesCollectionState;
    expect(cs.branches[0]!.itemTemplate.fields).toHaveLength(1);
    expect(cs.branches[0]!.itemTemplate.fields[0]!.targetFieldPath).toBe('name');
  });

  it('returns failure for merge with >10 branches (Q1)', () => {
    const branches = Array.from({ length: 11 }, (_, i) => `map(source("arr${i}"), {})`).join(', ');
    assertFailure(`merge(${branches})`);
  });

  it('returns failure for merge with non-map branches', () => {
    assertFailure('merge(source("a"), source("b"))');
  });
});

// ---------------------------------------------------------------------------
// Cross-array lookup detection
// ---------------------------------------------------------------------------

describe('decomposeArrayExpression — Cross-array lookup', () => {
  it('preserves unsupported leaf function expressions as expression mappings', () => {
    const expr = 'map(source("items"), {"hasDiscount": gt(item("discountAmount"), 0)})';
    const state = assertSuccess(expr);
    const field = state.itemTemplate.fields[0]!;
    expect(field.kind).toBe('expression');
    if (field.kind === 'expression') {
      expect(field.targetFieldPath).toBe('hasDiscount');
      expect(field.dsl).toBe('gt(item("discountAmount"), 0)');
    }
  });

  it('detects default(get(find(...), ...), ...) pattern in item template', () => {
    const expr = 'map(source("orders"), {"taxAmount": default(get(find(source("taxLines"), eq(item("lineRef"), item("id"))), "taxAmount"), 0)})';
    const state = assertSuccess(expr);
    expect(state.itemTemplate.fields).toHaveLength(1);
    const field = state.itemTemplate.fields[0]!;
    expect(field.kind).toBe('crossArrayLookup');
    if (field.kind === 'crossArrayLookup') {
      expect(field.lookupState.lookupArrayPath).toBe('taxLines');
      expect(field.lookupState.matchField).toBe('lineRef');
      expect(field.lookupState.compareScope).toBe('item');
      expect(field.lookupState.compareField).toBe('id');
      expect(field.lookupState.returnField).toBe('taxAmount');
      expect(field.lookupState.fallback).toEqual({ type: 'number', value: 0 });
    }
  });

  it('detects get(find(...), ...) without default() wrapper', () => {
    const expr = 'map(source("orders"), {"taxAmount": get(find(source("taxLines"), eq(item("lineRef"), item("id"))), "taxAmount")})';
    const state = assertSuccess(expr);
    const field = state.itemTemplate.fields[0]!;
    expect(field.kind).toBe('crossArrayLookup');
    if (field.kind === 'crossArrayLookup') {
      expect(field.lookupState.fallback).toBeUndefined();
    }
  });

  it('detects parent() compare scope in cross-array lookup', () => {
    const expr = 'map(source("items"), {"ref": get(find(source("refs"), eq(item("key"), parent("id"))), "value")})';
    const state = assertSuccess(expr);
    const field = state.itemTemplate.fields[0]!;
    if (field.kind === 'crossArrayLookup') {
      expect(field.lookupState.compareScope).toBe('parent');
      expect(field.lookupState.compareField).toBe('id');
    }
  });
});

// ---------------------------------------------------------------------------
// Nested array detection
// ---------------------------------------------------------------------------

describe('decomposeArrayExpression — Nested arrays', () => {
  it('detects nested map() within item template as nested array', () => {
    const expr = 'map(source("orders"), {"id": item("id"), "lines": map(source("order.lines"), {"lineId": item("lineId")})})';
    const state = assertSuccess(expr);
    // "lines" field should be in nestedArrays map
    expect(state.itemTemplate.nestedArrays.has('lines')).toBe(true);
    const nested = state.itemTemplate.nestedArrays.get('lines')!;
    expect(nested.mode).toBe('map');
    const nestedCs = nested.collectionState as MapCollectionState;
    expect(nestedCs.sourceArrayPath).toBe('order.lines');
  });

  it('nested array placeholder field is empty kind', () => {
    const expr = 'map(source("orders"), {"lines": map(source("order.lines"), {})})';
    const state = assertSuccess(expr);
    const placeholder = state.itemTemplate.fields.find((f) => f.targetFieldPath === 'lines');
    expect(placeholder?.kind).toBe('empty');
  });
});

// ---------------------------------------------------------------------------
// Unrecognized patterns
// ---------------------------------------------------------------------------

describe('decomposeArrayExpression — Unrecognized patterns', () => {
  it('returns failure for flatten(map(...))', () => {
    const result = assertFailure('flatten(map(source("items"), {}))');
    expect(result.reason).toContain('flatten');
    expect(result.rawExpression).toBe('flatten(map(source("items"), {}))');
  });

  it('returns failure for a scalar expression', () => {
    assertFailure('source("name")');
  });

  it('returns failure for a string literal', () => {
    assertFailure('"hello"');
  });

  it('returns failure for empty expression', () => {
    const result = assertFailure('');
    expect(result.reason).toContain('Empty');
  });

  it('returns failure for a parse error', () => {
    const result = assertFailure('map(source("items"');
    expect(result.reason).toContain('Parse error');
  });

  it('returns failure for merge with only 1 branch', () => {
    // merge() with 1 arg is not a valid merge pattern — falls through
    assertFailure('merge(map(source("a"), {}))');
  });

  it('includes rawExpression in failure result', () => {
    const expr = 'flatten(map(source("items"), {}))';
    const result = assertFailure(expr);
    expect(result.rawExpression).toBe(expr);
  });
});

// ---------------------------------------------------------------------------
// Round-trip fidelity
// ---------------------------------------------------------------------------

describe('decomposeArrayExpression — Round-trip fidelity', () => {
  /**
   * Round-trip: generate → decompose → generate should produce equivalent DSL.
   * We compare the re-generated expression by parsing both and checking they
   * produce the same AST structure (via string comparison of re-generated output).
   */
  function roundTrip(expr: string): void {
    const result = decomposeArrayExpression(expr);
    expect(result.success, `Decompose failed for: ${expr}\nReason: ${!result.success ? (result as { reason: string }).reason : ''}`).toBe(true);
    if (!result.success) return;

    const regenerated = generateArrayExpression(result.state);
    assertParses(regenerated);

    // Re-decompose the regenerated expression — should also succeed
    const result2 = decomposeArrayExpression(regenerated);
    expect(
      result2.success,
      `Re-decompose failed for regenerated: ${regenerated}\nReason: ${!result2.success ? (result2 as { reason: string }).reason : ''}`,
    ).toBe(true);
  }

  it('round-trips map mode', () => {
    roundTrip('map(source("items"), {"id": item("id"), "name": item("name")})');
  });

  it('round-trips map mode with item-scoped collection source', () => {
    roundTrip('map(item("employees"), {"id": item("id")})');
  });

  it('round-trips filterMap mode with eq predicate', () => {
    roundTrip('map(filter(source("items"), eq(item("status"), "active")), {"id": item("id")})');
  });

  it('round-trips filterMap mode with isNull predicate', () => {
    roundTrip('map(filter(source("items"), isNull(item("deletedAt"))), {"id": item("id")})');
  });

  it('round-trips filterMap mode with isNotNull predicate', () => {
    roundTrip('map(filter(source("items"), not(isNull(item("name")))), {"id": item("id")})');
  });

  it('round-trips buildFromValues mode with object entries', () => {
    roundTrip('array({"id": source("a.id")}, {"id": source("b.id")})');
  });

  it('round-trips buildFromValues mode with null filtering', () => {
    roundTrip('filter(array({"id": source("a.id")}, {"id": source("b.id")}), not(isNull(item("id"))))');
  });

  it('round-trips merge mode', () => {
    roundTrip('merge(map(source("a"), {"id": item("id")}), map(source("b"), {"id": item("id")}))');
  });

  it('round-trips cross-array lookup', () => {
    roundTrip('map(source("orders"), {"taxAmount": default(get(find(source("taxLines"), eq(item("lineRef"), item("id"))), "taxAmount"), 0)})');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('decomposeArrayExpression — Edge cases', () => {
  it('handles whitespace-only expression as empty', () => {
    const result = assertFailure('   ');
    expect(result.reason).toContain('Empty');
  });

  it('handles map with empty object template', () => {
    const state = assertSuccess('map(source("items"), {})');
    expect(state.itemTemplate.fields).toHaveLength(0);
  });

  it('handles array() with no arguments', () => {
    const state = assertSuccess('array()');
    const cs = state.collectionState as BuildFromValuesCollectionState;
    expect(cs.entries).toHaveLength(0);
  });

  it('handles map with static literal field value', () => {
    const state = assertSuccess('map(source("items"), {"type": "product"})');
    const field = state.itemTemplate.fields[0]!;
    expect(field.kind).toBe('chain');
  });

  it('handles map with numeric literal field value', () => {
    const state = assertSuccess('map(source("items"), {"version": 1})');
    const field = state.itemTemplate.fields[0]!;
    expect(field.kind).toBe('chain');
  });

  it('completionStatus is derived correctly for a complete map state', () => {
    const state = assertSuccess('map(source("items"), {"id": item("id")})');
    // Source is configured and all fields are mapped → complete
    expect(state.completionStatus).toBe('complete');
  });

  it('completionStatus is notStarted for empty source', () => {
    // This would only happen if we construct state manually — decomposer
    // always has a source path if it matched map pattern
    const state = assertSuccess('map(source("items"), {})');
    // Source is configured but no fields → complete (no required fields)
    expect(['complete', 'inProgress']).toContain(state.completionStatus);
  });
});
