import { describe, expect, it } from 'vitest';

import { flattenTree } from './use-flattened-tree';

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

describe('flattenTree', () => {
  it('returns empty array for empty input', () => {
    expect(flattenTree([], new Set())).toEqual([]);
  });

  it('returns top-level nodes in order', () => {
    const nodes = [
      makeNode({ path: 'a', fieldName: 'a' }),
      makeNode({ path: 'b', fieldName: 'b' }),
      makeNode({ path: 'c', fieldName: 'c' }),
    ];
    const result = flattenTree(nodes, new Set());
    expect(result.map((n) => n.path)).toEqual(['a', 'b', 'c']);
  });

  it('includes children of expanded nodes', () => {
    const nodes = [
      makeNode({
        path: 'parent',
        fieldName: 'parent',
        type: 'object',
        childCount: 2,
        children: [
          makeNode({ path: 'parent.child1', fieldName: 'child1', depth: 1, parentPath: 'parent' }),
          makeNode({ path: 'parent.child2', fieldName: 'child2', depth: 1, parentPath: 'parent' }),
        ],
      }),
    ];
    const expanded = new Set(['parent']);
    const result = flattenTree(nodes, expanded);
    expect(result.map((n) => n.path)).toEqual(['parent', 'parent.child1', 'parent.child2']);
  });

  it('excludes children of collapsed nodes', () => {
    const nodes = [
      makeNode({
        path: 'parent',
        fieldName: 'parent',
        type: 'object',
        childCount: 2,
        children: [
          makeNode({ path: 'parent.child1', fieldName: 'child1', depth: 1, parentPath: 'parent' }),
          makeNode({ path: 'parent.child2', fieldName: 'child2', depth: 1, parentPath: 'parent' }),
        ],
      }),
    ];
    const expanded = new Set<string>();
    const result = flattenTree(nodes, expanded);
    expect(result.map((n) => n.path)).toEqual(['parent']);
  });

  it('handles deeply nested expand/collapse', () => {
    const nodes = [
      makeNode({
        path: 'a',
        fieldName: 'a',
        type: 'object',
        childCount: 1,
        children: [
          makeNode({
            path: 'a.b',
            fieldName: 'b',
            type: 'object',
            depth: 1,
            parentPath: 'a',
            childCount: 1,
            children: [
              makeNode({
                path: 'a.b.c',
                fieldName: 'c',
                depth: 2,
                parentPath: 'a.b',
              }),
            ],
          }),
        ],
      }),
    ];

    // Only expand top-level
    expect(flattenTree(nodes, new Set(['a'])).map((n) => n.path)).toEqual(['a', 'a.b']);

    // Expand both levels
    expect(flattenTree(nodes, new Set(['a', 'a.b'])).map((n) => n.path)).toEqual(['a', 'a.b', 'a.b.c']);

    // Expand only nested (parent collapsed, so nested doesn't show)
    expect(flattenTree(nodes, new Set(['a.b'])).map((n) => n.path)).toEqual(['a']);
  });

  it('preserves order across multiple top-level nodes with children', () => {
    const nodes = [
      makeNode({
        path: 'x',
        fieldName: 'x',
        type: 'object',
        childCount: 1,
        children: [makeNode({ path: 'x.a', fieldName: 'a', depth: 1, parentPath: 'x' })],
      }),
      makeNode({ path: 'y', fieldName: 'y' }),
      makeNode({
        path: 'z',
        fieldName: 'z',
        type: 'object',
        childCount: 1,
        children: [makeNode({ path: 'z.b', fieldName: 'b', depth: 1, parentPath: 'z' })],
      }),
    ];

    const expanded = new Set(['x', 'z']);
    const result = flattenTree(nodes, expanded);
    expect(result.map((n) => n.path)).toEqual(['x', 'x.a', 'y', 'z', 'z.b']);
  });

  it('performs well with 23000 nodes', () => {
    // Build a flat tree of 23000 nodes
    const nodes: SchemaTreeNode[] = [];
    for (let i = 0; i < 23000; i++) {
      nodes.push(makeNode({ path: `f${i}`, fieldName: `f${i}` }));
    }

    const start = performance.now();
    const result = flattenTree(nodes, new Set());
    const elapsed = performance.now() - start;

    expect(result.length).toBe(23000);
    // Should complete in well under 3 seconds (spec requirement)
    expect(elapsed).toBeLessThan(500);
  });
});
