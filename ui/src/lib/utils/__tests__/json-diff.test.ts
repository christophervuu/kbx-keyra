import { describe, expect, it } from 'vitest';

import { computeDiff } from '../json-diff';

describe('computeDiff', () => {
  it('returns isEqual true and no entries for identical objects', () => {
    const result = computeDiff({ a: 1, nested: { b: 'x' } }, { a: 1, nested: { b: 'x' } });

    expect(result).toEqual({ entries: [], isEqual: true });
  });

  it('detects added keys at top level and nested paths', () => {
    const result = computeDiff(
      { name: 'Alice', profile: { active: true, role: 'admin' } },
      { name: 'Alice', profile: { active: true } },
    );

    expect(result.isEqual).toBe(false);
    expect(result.entries).toEqual([
      {
        path: 'root.profile.role',
        type: 'added',
        actual: 'admin',
      },
    ]);
  });

  it('detects removed keys at top level and nested paths', () => {
    const result = computeDiff(
      { profile: { active: true } },
      { role: 'user', profile: { active: true, team: 'platform' } },
    );

    expect(result.isEqual).toBe(false);
    expect(result.entries).toEqual([
      {
        path: 'root.profile.team',
        type: 'removed',
        expected: 'platform',
      },
      {
        path: 'root.role',
        type: 'removed',
        expected: 'user',
      },
    ]);
  });

  it('detects changed primitive values', () => {
    const result = computeDiff({ age: 30 }, { age: 31 });

    expect(result.entries).toEqual([
      {
        path: 'root.age',
        type: 'changed',
        actual: 30,
        expected: 31,
      },
    ]);
  });

  it('detects changed types (object to primitive)', () => {
    const result = computeDiff({ value: { nested: true } }, { value: 'text' });

    expect(result.entries).toEqual([
      {
        path: 'root.value',
        type: 'changed',
        actual: { nested: true },
        expected: 'text',
      },
    ]);
  });

  it('detects array length differences', () => {
    const result = computeDiff({ items: [1, 2, 3] }, { items: [1, 2] });

    expect(result.entries).toEqual([
      {
        path: 'root.items[2]',
        type: 'added',
        actual: 3,
      },
    ]);
  });

  it('detects array element changes', () => {
    const result = computeDiff({ values: [1, 20, 3] }, { values: [1, 2, 3] });

    expect(result.entries).toEqual([
      {
        path: 'root.values[1]',
        type: 'changed',
        actual: 20,
        expected: 2,
      },
    ]);
  });

  it('detects nested object differences within arrays', () => {
    const result = computeDiff(
      { items: [{ id: 1, name: 'A' }, { id: 2, name: 'B2' }] },
      { items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] },
    );

    expect(result.entries).toEqual([
      {
        path: 'root.items[1].name',
        type: 'changed',
        actual: 'B2',
        expected: 'B',
      },
    ]);
  });

  it('distinguishes null from missing key', () => {
    const addedResult = computeDiff({ value: null }, {});
    expect(addedResult.entries).toEqual([
      {
        path: 'root.value',
        type: 'added',
        actual: null,
      },
    ]);

    const removedResult = computeDiff({}, { value: null });
    expect(removedResult.entries).toEqual([
      {
        path: 'root.value',
        type: 'removed',
        expected: null,
      },
    ]);
  });

  it('compares top-level primitive values', () => {
    const same = computeDiff('hello', 'hello');
    expect(same).toEqual({ entries: [], isEqual: true });

    const changed = computeDiff(1, 2);
    expect(changed.entries).toEqual([
      {
        path: 'root',
        type: 'changed',
        actual: 1,
        expected: 2,
      },
    ]);
  });

  it('matches acceptance examples for added and changed entries', () => {
    const result = computeDiff(
      { name: 'Alice', age: 30, active: true },
      { name: 'Alice', age: 31 },
    );

    expect(result.entries).toEqual([
      {
        path: 'root.active',
        type: 'added',
        actual: true,
      },
      {
        path: 'root.age',
        type: 'changed',
        actual: 30,
        expected: 31,
      },
    ]);
  });
});
