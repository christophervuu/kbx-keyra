import { describe, expect, it } from 'vitest';

import type { SchemaTreeNode } from '@/lib/types';

import { parseJsonSchema } from '../parsers';
import { countAllNodes, treeToJsonSchema } from '../tree-to-json-schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function leaf(
  overrides: Partial<SchemaTreeNode> & { fieldName: string; path: string },
): SchemaTreeNode {
  return {
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

// ---------------------------------------------------------------------------
// treeToJsonSchema
// ---------------------------------------------------------------------------

describe('treeToJsonSchema', () => {
  it('produces a valid JSON Schema with properties', () => {
    const nodes: SchemaTreeNode[] = [
      leaf({ fieldName: 'name', path: 'name', isRequired: true }),
      leaf({ fieldName: 'age', path: 'age', type: 'number' }),
    ];
    const result = treeToJsonSchema(nodes);
    expect(result.type).toBe('object');
    expect((result.properties as Record<string, unknown>).name).toEqual({ type: 'string' });
    expect((result.properties as Record<string, unknown>).age).toEqual({ type: 'number' });
    expect(result.required).toEqual(['name']);
  });

  it('omits required when no required fields', () => {
    const nodes: SchemaTreeNode[] = [leaf({ fieldName: 'x', path: 'x' })];
    const result = treeToJsonSchema(nodes);
    expect(result.required).toBeUndefined();
  });

  it('handles nested object nodes', () => {
    const nodes: SchemaTreeNode[] = [
      {
        fieldName: 'address',
        path: 'address',
        type: 'object',
        depth: 0,
        isArray: false,
        isRequired: false,
        parentPath: null,
        childCount: 1,
        children: [
          leaf({ fieldName: 'city', path: 'address.city', depth: 1, parentPath: 'address', isRequired: true }),
        ],
      },
    ];
    const result = treeToJsonSchema(nodes);
    const address = (result.properties as Record<string, unknown>).address as Record<string, unknown>;
    expect(address.type).toBe('object');
    expect((address.properties as Record<string, unknown>).city).toEqual({ type: 'string' });
    expect(address.required).toEqual(['city']);
  });

  it('handles array nodes with no children (defaults to string items)', () => {
    const nodes: SchemaTreeNode[] = [
      leaf({ fieldName: 'tags', path: 'tags', type: 'array', isArray: true }),
    ];
    const result = treeToJsonSchema(nodes);
    const tags = (result.properties as Record<string, unknown>).tags as Record<string, unknown>;
    expect(tags.type).toBe('array');
    expect(tags.items).toEqual({ type: 'string' });
  });

  it('handles array nodes with object children', () => {
    const nodes: SchemaTreeNode[] = [
      {
        fieldName: 'items',
        path: 'items',
        type: 'array',
        depth: 0,
        isArray: true,
        isRequired: false,
        parentPath: null,
        childCount: 1,
        children: [
          leaf({ fieldName: 'id', path: 'items.id', depth: 1, parentPath: 'items', isRequired: true }),
        ],
      },
    ];
    const result = treeToJsonSchema(nodes);
    const items = (result.properties as Record<string, unknown>).items as Record<string, unknown>;
    expect(items.type).toBe('array');
    const itemsDef = items.items as Record<string, unknown>;
    expect(itemsDef.type).toBe('object');
    expect((itemsDef.properties as Record<string, unknown>).id).toEqual({ type: 'string' });
    expect(itemsDef.required).toEqual(['id']);
  });

  it('includes description when present', () => {
    const nodes: SchemaTreeNode[] = [
      leaf({ fieldName: 'id', path: 'id', description: 'Primary key' }),
    ];
    const result = treeToJsonSchema(nodes);
    const id = (result.properties as Record<string, unknown>).id as Record<string, unknown>;
    expect(id.description).toBe('Primary key');
  });

  it('preserves non-structural top-level keys from originalContent', () => {
    const original = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: 'MySchema',
      title: 'My Schema',
      type: 'object',
      properties: {},
    };
    const nodes: SchemaTreeNode[] = [leaf({ fieldName: 'x', path: 'x' })];
    const result = treeToJsonSchema(nodes, original);
    expect(result.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(result.$id).toBe('MySchema');
    expect(result.title).toBe('My Schema');
    // But structural keys come from the tree
    expect(result.type).toBe('object');
    expect((result.properties as Record<string, unknown>).x).toBeDefined();
  });

  it('preserves top-level keys from originalContent passed as JSON string', () => {
    const original = JSON.stringify({ $schema: 'draft-07', type: 'object', properties: {} });
    const nodes: SchemaTreeNode[] = [leaf({ fieldName: 'y', path: 'y' })];
    const result = treeToJsonSchema(nodes, original);
    expect(result.$schema).toBe('draft-07');
  });

  it('round-trips through parseJsonSchema', () => {
    const source = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name' },
        age: { type: 'number' },
      },
      required: ['name'],
    };
    const parsed = parseJsonSchema(source);
    const reconstructed = treeToJsonSchema(parsed.nodes, source);
    const reparsed = parseJsonSchema(reconstructed);

    // Field count and names should match
    expect(reparsed.totalFieldCount).toBe(parsed.totalFieldCount);
    const names = reparsed.nodes.map((n) => n.fieldName);
    expect(names).toEqual(parsed.nodes.map((n) => n.fieldName));
    expect(reparsed.nodes.find((n) => n.fieldName === 'name')?.isRequired).toBe(true);
    expect(reparsed.nodes.find((n) => n.fieldName === 'name')?.description).toBe('Full name');
  });
});

// ---------------------------------------------------------------------------
// countAllNodes
// ---------------------------------------------------------------------------

describe('countAllNodes', () => {
  it('counts flat nodes correctly', () => {
    expect(countAllNodes([leaf({ fieldName: 'a', path: 'a' }), leaf({ fieldName: 'b', path: 'b' })])).toBe(2);
  });

  it('counts nested nodes correctly', () => {
    const nodes: SchemaTreeNode[] = [
      {
        fieldName: 'root',
        path: 'root',
        type: 'object',
        depth: 0,
        isArray: false,
        isRequired: false,
        parentPath: null,
        childCount: 2,
        children: [
          leaf({ fieldName: 'a', path: 'root.a', depth: 1, parentPath: 'root' }),
          leaf({ fieldName: 'b', path: 'root.b', depth: 1, parentPath: 'root' }),
        ],
      },
    ];
    expect(countAllNodes(nodes)).toBe(3); // root + a + b
  });

  it('returns 0 for empty array', () => {
    expect(countAllNodes([])).toBe(0);
  });
});
