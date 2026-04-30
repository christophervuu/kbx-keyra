import { describe, expect, it } from 'vitest';

import { resolvePath } from '../../../src/engine/dsl/index.js';

describe('resolvePath()', () => {
  it('AE-09: resolves simple dot notation', () => {
    const obj = { address: { city: 'Seattle', zip: '98101' } };

    expect(resolvePath(obj, 'address.city')).toBe('Seattle');
  });

  it('AE-10: resolves mixed bracket and dot with numeric index', () => {
    const obj = { items: [{ sku: 'A1' }, { sku: 'B2' }] };

    expect(resolvePath(obj, 'items[1].sku')).toBe('B2');
  });

  it('AE-11: returns null when path traverses through null intermediate', () => {
    const obj = { a: { b: null } };

    expect(resolvePath(obj, 'a.b.c')).toBeNull();
  });

  it('returns whole object on empty path', () => {
    const obj = { a: 1, b: { c: 2 } };

    expect(resolvePath(obj, '')).toBe(obj);
  });

  it('returns null when root object is null or undefined', () => {
    expect(resolvePath(null, 'a.b')).toBeNull();
    expect(resolvePath(undefined, 'a.b')).toBeNull();
  });

  it('returns undefined for array index out of bounds', () => {
    const obj = { items: [1, 2] };

    expect(resolvePath(obj, 'items[99]')).toBeUndefined();
  });

  it('resolves deeply nested mixed paths', () => {
    const obj = {
      orders: [
        {
          items: [
            {
              details: {
                sku: 'SKU-001',
              },
            },
          ],
        },
      ],
    };

    expect(resolvePath(obj, "orders[0].items[0].details['sku']")).toBe('SKU-001');
  });

  it('resolves bracket keys with spaces and dots', () => {
    const obj = {
      customer: {
        'first name': 'Ada',
        'profile.email': 'ada@example.com',
      },
    };

    expect(resolvePath(obj, "customer['first name']")).toBe('Ada');
    expect(resolvePath(obj, "customer['profile.email']")).toBe('ada@example.com');
  });

  it('supports root-level array indexing', () => {
    const arr = [{ id: 1 }, { id: 2 }];

    expect(resolvePath(arr, '[1].id')).toBe(2);
  });

  it('returns null for invalid paths (trailing dot, empty segment, malformed bracket)', () => {
    const obj = { a: { b: 1 } };

    expect(resolvePath(obj, 'a.')).toBeNull();
    expect(resolvePath(obj, 'a..b')).toBeNull();
    expect(resolvePath(obj, "a['b'")).toBeNull();
    expect(resolvePath(obj, 'a[]')).toBeNull();
  });

  it('returns null when traversing into non-object/non-array', () => {
    const obj = { a: 1 };

    expect(resolvePath(obj, 'a.b')).toBeNull();
    expect(resolvePath(obj, 'a[0]')).toBeNull();
  });
});
