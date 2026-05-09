import { describe, expect, it } from 'vitest';

import { computeDiff } from '../json-diff';

// ---------------------------------------------------------------------------
// isEqual / identical objects
// ---------------------------------------------------------------------------

describe('computeDiff — identical values', () => {
  it('returns isEqual true, no entries, and zero summary for identical objects', () => {
    const result = computeDiff({ a: 1, nested: { b: 'x' } }, { a: 1, nested: { b: 'x' } });

    expect(result.isEqual).toBe(true);
    expect(result.entries).toEqual([]);
    expect(result.summary.total).toBe(0);
  });

  it('returns isEqual true for identical top-level primitives', () => {
    expect(computeDiff('hello', 'hello').isEqual).toBe(true);
    expect(computeDiff(42, 42).isEqual).toBe(true);
    expect(computeDiff(true, true).isEqual).toBe(true);
    expect(computeDiff(null, null).isEqual).toBe(true);
  });

  it('returns isEqual true for identical arrays', () => {
    expect(computeDiff([1, 2, 3], [1, 2, 3]).isEqual).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// missing_field
// ---------------------------------------------------------------------------

describe('computeDiff — missing_field', () => {
  it('detects a key present in expected but absent in actual', () => {
    const result = computeDiff(
      { name: 'Alice' },
      { name: 'Alice', role: 'admin' },
    );

    expect(result.isEqual).toBe(false);
    expect(result.entries).toEqual([
      { path: 'root.role', type: 'missing_field', expected: 'admin' },
    ]);
    expect(result.summary.byCategory.missing_field).toBe(1);
  });

  it('detects nested missing fields', () => {
    const result = computeDiff(
      { profile: { active: true } },
      { profile: { active: true, team: 'platform' } },
    );

    expect(result.entries).toEqual([
      { path: 'root.profile.team', type: 'missing_field', expected: 'platform' },
    ]);
  });

  it('detects a missing array element', () => {
    const result = computeDiff({ items: [1, 2] }, { items: [1, 2, 3] });

    expect(result.entries).toEqual([
      { path: 'root.items[2]', type: 'missing_field', expected: 3 },
    ]);
  });

  it('treats a null expected value as missing_field when key is absent in actual', () => {
    const result = computeDiff({}, { value: null });
    expect(result.entries).toEqual([
      { path: 'root.value', type: 'missing_field', expected: null },
    ]);
  });
});

// ---------------------------------------------------------------------------
// extra_field
// ---------------------------------------------------------------------------

describe('computeDiff — extra_field', () => {
  it('detects a key present in actual but absent in expected', () => {
    const result = computeDiff(
      { name: 'Alice', extra: true },
      { name: 'Alice' },
    );

    expect(result.isEqual).toBe(false);
    expect(result.entries).toEqual([
      { path: 'root.extra', type: 'extra_field', actual: true },
    ]);
    expect(result.summary.byCategory.extra_field).toBe(1);
  });

  it('detects nested extra fields', () => {
    const result = computeDiff(
      { profile: { active: true, role: 'admin' } },
      { profile: { active: true } },
    );

    expect(result.entries).toEqual([
      { path: 'root.profile.role', type: 'extra_field', actual: 'admin' },
    ]);
  });

  it('detects an extra array element', () => {
    const result = computeDiff({ items: [1, 2, 3] }, { items: [1, 2] });

    expect(result.entries).toEqual([
      { path: 'root.items[2]', type: 'extra_field', actual: 3 },
    ]);
  });

  it('treats a null actual value as extra_field when key is absent in expected', () => {
    const result = computeDiff({ value: null }, {});
    expect(result.entries).toEqual([
      { path: 'root.value', type: 'extra_field', actual: null },
    ]);
  });
});

// ---------------------------------------------------------------------------
// value_mismatch
// ---------------------------------------------------------------------------

describe('computeDiff — value_mismatch', () => {
  it('detects a number value mismatch', () => {
    const result = computeDiff({ age: 30 }, { age: 31 });

    expect(result.entries).toEqual([
      { path: 'root.age', type: 'value_mismatch', actual: 30, expected: 31 },
    ]);
    expect(result.summary.byCategory.value_mismatch).toBe(1);
  });

  it('detects a string value mismatch', () => {
    const result = computeDiff({ name: 'Alice' }, { name: 'Bob' });

    expect(result.entries).toEqual([
      { path: 'root.name', type: 'value_mismatch', actual: 'Alice', expected: 'Bob' },
    ]);
  });

  it('detects a boolean value mismatch', () => {
    const result = computeDiff({ active: true }, { active: false });

    expect(result.entries).toEqual([
      { path: 'root.active', type: 'value_mismatch', actual: true, expected: false },
    ]);
  });

  it('detects a value mismatch in an array element', () => {
    const result = computeDiff({ values: [1, 20, 3] }, { values: [1, 2, 3] });

    expect(result.entries).toEqual([
      { path: 'root.values[1]', type: 'value_mismatch', actual: 20, expected: 2 },
    ]);
  });

  it('detects a value mismatch in a nested object within an array', () => {
    const result = computeDiff(
      { items: [{ id: 1, name: 'A' }, { id: 2, name: 'B2' }] },
      { items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] },
    );

    expect(result.entries).toEqual([
      { path: 'root.items[1].name', type: 'value_mismatch', actual: 'B2', expected: 'B' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// type_mismatch
// ---------------------------------------------------------------------------

describe('computeDiff — type_mismatch', () => {
  it('detects string vs number', () => {
    const result = computeDiff({ age: '30' }, { age: 30 });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      path: 'root.age',
      type: 'type_mismatch',
      actual: '30',
      expected: 30,
      actualType: 'string',
      expectedType: 'number',
    });
    expect(result.summary.byCategory.type_mismatch).toBe(1);
  });

  it('detects number vs boolean', () => {
    const result = computeDiff({ flag: 1 }, { flag: true });

    expect(result.entries[0]).toMatchObject({
      type: 'type_mismatch',
      actualType: 'number',
      expectedType: 'boolean',
    });
  });

  it('detects string vs boolean', () => {
    const result = computeDiff({ active: 'true' }, { active: true });

    expect(result.entries[0]).toMatchObject({
      type: 'type_mismatch',
      actualType: 'string',
      expectedType: 'boolean',
    });
  });
});

// ---------------------------------------------------------------------------
// null_mismatch
// ---------------------------------------------------------------------------

describe('computeDiff — null_mismatch', () => {
  it('detects null actual vs non-null expected', () => {
    const result = computeDiff({ score: null }, { score: 95 });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      path: 'root.score',
      type: 'null_mismatch',
      actual: null,
      expected: 95,
      actualType: 'null',
      expectedType: 'number',
    });
    expect(result.summary.byCategory.null_mismatch).toBe(1);
  });

  it('detects non-null actual vs null expected', () => {
    const result = computeDiff({ score: 95 }, { score: null });

    expect(result.entries[0]).toMatchObject({
      type: 'null_mismatch',
      actual: 95,
      expected: null,
      actualType: 'number',
      expectedType: 'null',
    });
  });

  it('detects null vs string', () => {
    const result = computeDiff({ name: null }, { name: 'Alice' });

    expect(result.entries[0]).toMatchObject({
      type: 'null_mismatch',
      actualType: 'null',
      expectedType: 'string',
    });
  });
});

// ---------------------------------------------------------------------------
// structural_mismatch
// ---------------------------------------------------------------------------

describe('computeDiff — structural_mismatch', () => {
  it('detects object vs string (AE-07)', () => {
    const result = computeDiff(
      { address: { street: '123 Main' } },
      { address: '123 Main St' },
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      path: 'root.address',
      type: 'structural_mismatch',
      actualType: 'object',
      expectedType: 'primitive',
    });
    expect(result.summary.byCategory.structural_mismatch).toBe(1);
  });

  it('detects array vs object', () => {
    const result = computeDiff({ items: [1, 2] }, { items: { a: 1 } });

    expect(result.entries[0]).toMatchObject({
      type: 'structural_mismatch',
      actualType: 'array',
      expectedType: 'object',
    });
  });

  it('detects array vs primitive', () => {
    const result = computeDiff({ items: [1, 2] }, { items: 'list' });

    expect(result.entries[0]).toMatchObject({
      type: 'structural_mismatch',
      actualType: 'array',
      expectedType: 'primitive',
    });
  });

  it('detects primitive vs object', () => {
    const result = computeDiff({ value: 'text' }, { value: { nested: true } });

    expect(result.entries[0]).toMatchObject({
      type: 'structural_mismatch',
      actualType: 'primitive',
      expectedType: 'object',
    });
  });
});

// ---------------------------------------------------------------------------
// Mixed categories (AE-03)
// ---------------------------------------------------------------------------

describe('computeDiff — mixed categories (AE-03)', () => {
  it('classifies all four mismatch types in a single diff', () => {
    // AE-03: actual = { name: 'Alice', age: '30', score: null, extra: true }
    //        expected = { name: 'Alice', age: 30, score: 95, role: 'admin' }
    const result = computeDiff(
      { name: 'Alice', age: '30', score: null, extra: true },
      { name: 'Alice', age: 30, score: 95, role: 'admin' },
    );

    expect(result.isEqual).toBe(false);

    const byPath = Object.fromEntries(result.entries.map((e) => [e.path, e]));

    // age: type_mismatch (string vs number)
    expect(byPath['root.age']).toMatchObject({ type: 'type_mismatch' });

    // score: null_mismatch (null vs number)
    expect(byPath['root.score']).toMatchObject({ type: 'null_mismatch' });

    // extra: extra_field (in actual, not in expected)
    expect(byPath['root.extra']).toMatchObject({ type: 'extra_field' });

    // role: missing_field (in expected, not in actual)
    expect(byPath['root.role']).toMatchObject({ type: 'missing_field' });

    // name: no entry (values match)
    expect(byPath['root.name']).toBeUndefined();

    expect(result.summary.total).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// DiffSummary aggregation
// ---------------------------------------------------------------------------

describe('computeDiff — DiffSummary', () => {
  it('aggregates counts correctly across multiple categories', () => {
    const result = computeDiff(
      { a: 1, b: 'x', c: null, extra: true },
      { a: 2, b: 10, c: 5, role: 'admin' },
    );

    // a: value_mismatch (number vs number, different value)
    // b: type_mismatch (string vs number)
    // c: null_mismatch (null vs number)
    // extra: extra_field
    // role: missing_field
    expect(result.summary.total).toBe(5);
    expect(result.summary.byCategory.value_mismatch).toBe(1);
    expect(result.summary.byCategory.type_mismatch).toBe(1);
    expect(result.summary.byCategory.null_mismatch).toBe(1);
    expect(result.summary.byCategory.extra_field).toBe(1);
    expect(result.summary.byCategory.missing_field).toBe(1);
    expect(result.summary.byCategory.structural_mismatch).toBe(0);
  });

  it('returns zero summary for equal objects', () => {
    const result = computeDiff({ a: 1 }, { a: 1 });

    expect(result.summary.total).toBe(0);
    for (const count of Object.values(result.summary.byCategory)) {
      expect(count).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Top-level primitive comparison
// ---------------------------------------------------------------------------

describe('computeDiff — top-level primitives', () => {
  it('detects a value mismatch at root level', () => {
    const result = computeDiff(1, 2);

    expect(result.entries).toEqual([
      { path: 'root', type: 'value_mismatch', actual: 1, expected: 2 },
    ]);
  });

  it('detects a type mismatch at root level', () => {
    const result = computeDiff('hello', 42);

    expect(result.entries[0]).toMatchObject({
      path: 'root',
      type: 'type_mismatch',
      actualType: 'string',
      expectedType: 'number',
    });
  });
});
