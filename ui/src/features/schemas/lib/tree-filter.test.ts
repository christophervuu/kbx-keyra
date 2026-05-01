import { describe, expect, it } from 'vitest';

import { filterTree } from './tree-filter';

import type { SchemaTreeNode } from '@/lib/types';

function makeNode(overrides: Partial<SchemaTreeNode> = {}): SchemaTreeNode {
  return {
    path: 'field',
    fieldName: 'field',
    type: 'string',
    depth: 0,
    isArray: false,
    isRequired: false,
    parentPath: null,
    childCount: 0,
    children: [],
    ...overrides,
  };
}

describe('filterTree', () => {
  const tree: SchemaTreeNode[] = [
    makeNode({
      path: 'name',
      fieldName: 'name',
      type: 'string',
    }),
    makeNode({
      path: 'age',
      fieldName: 'age',
      type: 'number',
    }),
    makeNode({
      path: 'address',
      fieldName: 'address',
      type: 'object',
      childCount: 3,
      children: [
        makeNode({
          path: 'address.street',
          fieldName: 'street',
          type: 'string',
          depth: 1,
          parentPath: 'address',
        }),
        makeNode({
          path: 'address.city',
          fieldName: 'city',
          type: 'string',
          depth: 1,
          parentPath: 'address',
        }),
        makeNode({
          path: 'address.state',
          fieldName: 'state',
          type: 'string',
          depth: 1,
          parentPath: 'address',
        }),
      ],
    }),
    makeNode({
      path: 'contacts',
      fieldName: 'contacts',
      type: 'array',
      childCount: 1,
      children: [
        makeNode({
          path: 'contacts.email',
          fieldName: 'email',
          type: 'string',
          depth: 1,
          parentPath: 'contacts',
        }),
      ],
    }),
  ];

  it('returns empty result for empty query', () => {
    const result = filterTree(tree, '');
    expect(result.matchCount).toBe(0);
    expect(result.matchingPaths.size).toBe(0);
    expect(result.visiblePaths.size).toBe(0);
  });

  it('returns empty result for whitespace-only query', () => {
    const result = filterTree(tree, '   ');
    expect(result.matchCount).toBe(0);
  });

  it('finds matching nodes (case-insensitive)', () => {
    const result = filterTree(tree, 'street');
    expect(result.matchingPaths.has('address.street')).toBe(true);
    expect(result.matchCount).toBe(1);
  });

  it('is case-insensitive', () => {
    const result = filterTree(tree, 'STREET');
    expect(result.matchingPaths.has('address.street')).toBe(true);
    expect(result.matchCount).toBe(1);
  });

  it('includes ancestors of matches in visiblePaths', () => {
    const result = filterTree(tree, 'street');
    expect(result.visiblePaths.has('address.street')).toBe(true);
    expect(result.visiblePaths.has('address')).toBe(true);
  });

  it('excludes non-matching branches', () => {
    const result = filterTree(tree, 'street');
    expect(result.visiblePaths.has('name')).toBe(false);
    expect(result.visiblePaths.has('age')).toBe(false);
    expect(result.visiblePaths.has('contacts')).toBe(false);
    expect(result.visiblePaths.has('contacts.email')).toBe(false);
  });

  it('finds multiple matches', () => {
    // "a" matches: name, age, address, state, contacts, email (all contain "a")
    const result = filterTree(tree, 'a');
    expect(result.matchCount).toBeGreaterThan(1);
    expect(result.matchingPaths.has('name')).toBe(true);
    expect(result.matchingPaths.has('age')).toBe(true);
    expect(result.matchingPaths.has('address')).toBe(true);
    expect(result.matchingPaths.has('address.state')).toBe(true);
  });

  it('finds matches in nested nodes and includes all ancestors', () => {
    const result = filterTree(tree, 'email');
    expect(result.matchingPaths.has('contacts.email')).toBe(true);
    expect(result.visiblePaths.has('contacts')).toBe(true);
    expect(result.matchCount).toBe(1);
  });

  it('returns no matches for query that does not exist', () => {
    const result = filterTree(tree, 'zzzzzzz');
    expect(result.matchCount).toBe(0);
    expect(result.matchingPaths.size).toBe(0);
    expect(result.visiblePaths.size).toBe(0);
  });

  it('handles substring matching (not just prefix)', () => {
    // "eet" matches "street"
    const result = filterTree(tree, 'eet');
    expect(result.matchingPaths.has('address.street')).toBe(true);
    expect(result.matchCount).toBe(1);
  });

  it('performs well with 23000 nodes (< 300ms)', () => {
    // Build a large tree for performance testing
    const largeTree: SchemaTreeNode[] = [];
    for (let i = 0; i < 230; i++) {
      const children: SchemaTreeNode[] = [];
      for (let j = 0; j < 100; j++) {
        children.push(makeNode({
          path: `group_${i}.field_${j}`,
          fieldName: `field_${j}`,
          depth: 1,
          parentPath: `group_${i}`,
        }));
      }
      largeTree.push(makeNode({
        path: `group_${i}`,
        fieldName: `group_${i}`,
        type: 'object',
        childCount: 100,
        children,
      }));
    }

    const start = performance.now();
    const result = filterTree(largeTree, 'field_5');
    const elapsed = performance.now() - start;

    // field_5, field_50-59 match per group = 11 per group * 230 = 2530
    expect(result.matchCount).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(300);
  });
});
