/**
 * Tests for source-field-display.ts — FS-052 T-01
 */

import { describe, it, expect } from 'vitest';

import {
  SOURCE_TYPE_BADGES,
  getTypeBadge,
  getTypeBadgeCode,
  resolveFieldTestValue,
} from './source-field-display';

// ---------------------------------------------------------------------------
// SOURCE_TYPE_BADGES
// ---------------------------------------------------------------------------

describe('SOURCE_TYPE_BADGES', () => {
  const KNOWN_TYPES = [
    'string',
    'number',
    'integer',
    'boolean',
    'object',
    'array',
    'null',
    'enum',
    'any',
    'union',
  ] as const;

  it.each(KNOWN_TYPES)('has an entry for type "%s"', (type) => {
    expect(SOURCE_TYPE_BADGES[type]).toBeDefined();
    expect(SOURCE_TYPE_BADGES[type].code).toBeTruthy();
    expect(SOURCE_TYPE_BADGES[type].className).toBeTruthy();
  });

  it('has correct codes for core types', () => {
    expect(SOURCE_TYPE_BADGES.string.code).toBe('str');
    expect(SOURCE_TYPE_BADGES.number.code).toBe('num');
    expect(SOURCE_TYPE_BADGES.integer.code).toBe('int');
    expect(SOURCE_TYPE_BADGES.boolean.code).toBe('bool');
    expect(SOURCE_TYPE_BADGES.object.code).toBe('obj');
    expect(SOURCE_TYPE_BADGES.array.code).toBe('arr');
    expect(SOURCE_TYPE_BADGES.null.code).toBe('null');
    expect(SOURCE_TYPE_BADGES.enum.code).toBe('enum');
    expect(SOURCE_TYPE_BADGES.any.code).toBe('any');
    expect(SOURCE_TYPE_BADGES.union.code).toBe('|');
  });

  it('uses the correct color for string (blue)', () => {
    expect(SOURCE_TYPE_BADGES.string.className).toContain('blue');
  });

  it('uses the correct color for number (green)', () => {
    expect(SOURCE_TYPE_BADGES.number.className).toContain('green');
  });

  it('uses the correct color for boolean (purple)', () => {
    expect(SOURCE_TYPE_BADGES.boolean.className).toContain('purple');
  });

  it('uses the correct color for array (amber)', () => {
    expect(SOURCE_TYPE_BADGES.array.className).toContain('amber');
  });
});

// ---------------------------------------------------------------------------
// getTypeBadge
// ---------------------------------------------------------------------------

describe('getTypeBadge', () => {
  it('returns the correct badge for a known type', () => {
    const badge = getTypeBadge('string');
    expect(badge.code).toBe('str');
    expect(badge.className).toContain('blue');
  });

  it('falls back to "any" badge for an unknown type', () => {
    const badge = getTypeBadge('unknown-type-xyz');
    expect(badge.code).toBe('any');
  });

  it('falls back to "any" badge for an empty string', () => {
    const badge = getTypeBadge('');
    expect(badge.code).toBe('any');
  });
});

// ---------------------------------------------------------------------------
// getTypeBadgeCode
// ---------------------------------------------------------------------------

describe('getTypeBadgeCode', () => {
  it('returns the code for a known type', () => {
    expect(getTypeBadgeCode('string')).toBe('str');
    expect(getTypeBadgeCode('number')).toBe('num');
    expect(getTypeBadgeCode('integer')).toBe('int');
    expect(getTypeBadgeCode('boolean')).toBe('bool');
    expect(getTypeBadgeCode('object')).toBe('obj');
    expect(getTypeBadgeCode('array')).toBe('arr');
    expect(getTypeBadgeCode('null')).toBe('null');
    expect(getTypeBadgeCode('enum')).toBe('enum');
    expect(getTypeBadgeCode('any')).toBe('any');
    expect(getTypeBadgeCode('union')).toBe('|');
  });

  it('returns "any" for an unknown type', () => {
    expect(getTypeBadgeCode('mystery')).toBe('any');
  });
});

// ---------------------------------------------------------------------------
// resolveFieldTestValue
// ---------------------------------------------------------------------------

describe('resolveFieldTestValue', () => {
  // --- null / undefined sourceData ---

  it('returns undefined when sourceData is null', () => {
    expect(resolveFieldTestValue(null, 'name')).toBeUndefined();
  });

  it('returns undefined when sourceData is undefined', () => {
    expect(resolveFieldTestValue(undefined, 'name')).toBeUndefined();
  });

  // --- simple paths ---

  it('resolves a top-level string field', () => {
    expect(resolveFieldTestValue({ name: 'Alice' }, 'name')).toBe('"Alice"');
  });

  it('resolves a top-level number field', () => {
    expect(resolveFieldTestValue({ age: 30 }, 'age')).toBe('30');
  });

  it('resolves a top-level boolean field', () => {
    expect(resolveFieldTestValue({ active: true }, 'active')).toBe('true');
  });

  it('resolves a top-level null field', () => {
    expect(resolveFieldTestValue({ value: null }, 'value')).toBe('null');
  });

  // --- nested paths ---

  it('resolves a nested string field', () => {
    expect(
      resolveFieldTestValue({ address: { city: 'SF' } }, 'address.city'),
    ).toBe('"SF"');
  });

  it('resolves a deeply nested field', () => {
    expect(
      resolveFieldTestValue({ a: { b: { c: 42 } } }, 'a.b.c'),
    ).toBe('42');
  });

  // --- missing / null intermediates ---

  it('returns undefined when an intermediate key is missing', () => {
    expect(resolveFieldTestValue({ x: {} }, 'x.y.z')).toBeUndefined();
  });

  it('returns undefined when an intermediate value is null', () => {
    expect(resolveFieldTestValue({ x: null }, 'x.y')).toBeUndefined();
  });

  it('returns undefined when an intermediate value is a primitive', () => {
    expect(resolveFieldTestValue({ x: 'string' }, 'x.y')).toBeUndefined();
  });

  it('returns undefined when the top-level key is missing', () => {
    expect(resolveFieldTestValue({ a: 1 }, 'b')).toBeUndefined();
  });

  // --- bracket notation ---

  it('resolves array bracket notation', () => {
    expect(
      resolveFieldTestValue({ orders: [{ id: 1 }, { id: 2 }] }, 'orders[0].id'),
    ).toBe('1');
  });

  it('resolves bracket notation at the top level', () => {
    expect(resolveFieldTestValue([10, 20, 30], '[1]')).toBe('20');
  });

  // --- string truncation ---

  it('returns a short string quoted without truncation', () => {
    expect(resolveFieldTestValue({ d: 'hello' }, 'd')).toBe('"hello"');
  });

  it('truncates a long string at 30 chars with ...', () => {
    const longStr = 'a'.repeat(50);
    const result = resolveFieldTestValue({ d: longStr }, 'd');
    expect(result).toBeDefined();
    expect(result!.endsWith('...')).toBe(true);
    // Total visible chars (including quotes and ...) should be 33
    expect(result!.length).toBe(33);
  });

  it('does not truncate a string that fits exactly at 30 chars', () => {
    // 28 chars of content + 2 quotes = 30 total
    const str = 'a'.repeat(28);
    const result = resolveFieldTestValue({ d: str }, 'd');
    expect(result).toBe(`"${str}"`);
    expect(result!.endsWith('...')).toBe(false);
  });

  // --- object serialization ---

  it('serializes a small object as JSON', () => {
    expect(
      resolveFieldTestValue({ obj: { a: 1, b: 2 } }, 'obj'),
    ).toBe('{"a":1,"b":2}');
  });

  it('truncates a large object JSON with ...', () => {
    const bigObj = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`key${i}`, `value${i}`]),
    );
    const result = resolveFieldTestValue({ obj: bigObj }, 'obj');
    expect(result).toBeDefined();
    expect(result!.endsWith('...')).toBe(true);
    expect(result!.length).toBe(33);
  });

  // --- array serialization ---

  it('serializes a small array as JSON', () => {
    expect(resolveFieldTestValue({ arr: [1, 2, 3] }, 'arr')).toBe('[1,2,3]');
  });

  it('truncates a large array JSON with ...', () => {
    const bigArr = Array(20).fill(0);
    const result = resolveFieldTestValue({ arr: bigArr }, 'arr');
    expect(result).toBeDefined();
    expect(result!.endsWith('...')).toBe(true);
    expect(result!.length).toBe(33);
  });

  // --- email example from spec AE-02 ---

  it('resolves email field from spec AE-02', () => {
    expect(
      resolveFieldTestValue({ email: 'test@example.com' }, 'email'),
    ).toBe('"test@example.com"');
  });

  // --- spec AE-05: long description ---

  it('truncates a long description string (AE-05)', () => {
    const result = resolveFieldTestValue(
      { description: 'This is a very long description that should be truncated in the display' },
      'description',
    );
    expect(result).toBeDefined();
    expect(result!.endsWith('...')).toBe(true);
    // Should start with the quoted beginning of the string
    expect(result!.startsWith('"This is a very long descript')).toBe(true);
  });
});
