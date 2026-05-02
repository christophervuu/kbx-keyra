import { describe, expect, it } from 'vitest';

import {
  detectAutocompleteContext,
  filterSuggestions,
  flattenSchemaPaths,
} from './autocomplete-utils';
import type { AutocompleteItem } from './autocomplete-utils';
import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(path: string, type: SchemaTreeNode['type'], children: SchemaTreeNode[] = []): SchemaTreeNode {
  return {
    path,
    fieldName: path.split('.').at(-1) ?? path,
    type,
    depth: path.split('.').length - 1,
    isArray: false,
    isRequired: true,
    parentPath: path.includes('.') ? path.split('.').slice(0, -1).join('.') : null,
    childCount: children.length,
    children,
  };
}

function makeSchema(nodes: SchemaTreeNode[]): ParsedSchema {
  return {
    nodes,
    totalFieldCount: nodes.length,
    format: 'json-schema',
    parseTimeMs: 0,
    inferred: false,
  };
}

// ---------------------------------------------------------------------------
// detectAutocompleteContext
// ---------------------------------------------------------------------------

describe('detectAutocompleteContext', () => {
  it('returns function kind for empty expression at position 0', () => {
    const ctx = detectAutocompleteContext('', 0);
    expect(ctx.kind).toBe('function');
    expect(ctx.prefix).toBe('');
  });

  it('returns source-path kind when cursor is inside source("...")', () => {
    // source("ord|  (cursor after 'ord')
    const expr = 'source("ord';
    const ctx = detectAutocompleteContext(expr, expr.length);
    expect(ctx.kind).toBe('source-path');
    expect(ctx.prefix).toBe('ord');
    expect(ctx.insertStart).toBe(8); // after opening quote
    expect(ctx.insertEnd).toBe(11);
  });

  it('returns constant kind when cursor is inside constant("...")', () => {
    const expr = 'constant("';
    const ctx = detectAutocompleteContext(expr, expr.length);
    expect(ctx.kind).toBe('constant');
    expect(ctx.prefix).toBe('');
  });

  it('returns external kind when cursor is inside external("api...")', () => {
    const expr = 'external("api';
    const ctx = detectAutocompleteContext(expr, expr.length);
    expect(ctx.kind).toBe('external');
    expect(ctx.prefix).toBe('api');
  });

  it('returns function kind when cursor is at top-level with no prefix', () => {
    // concat(source("name"), |
    const expr = 'concat(source("name"), ';
    const ctx = detectAutocompleteContext(expr, expr.length);
    expect(ctx.kind).toBe('function');
    expect(ctx.prefix).toBe('');
  });

  it('returns function kind with prefix when typing a function name', () => {
    const expr = 'con';
    const ctx = detectAutocompleteContext(expr, expr.length);
    expect(ctx.kind).toBe('function');
    expect(ctx.prefix).toBe('con');
    expect(ctx.insertStart).toBe(0);
    expect(ctx.insertEnd).toBe(3);
  });

  it('returns source-path kind for item("...")', () => {
    const expr = 'item("sku';
    const ctx = detectAutocompleteContext(expr, expr.length);
    expect(ctx.kind).toBe('source-path');
    expect(ctx.prefix).toBe('sku');
  });

  it('returns source-path kind for parent("...")', () => {
    const expr = 'parent("ord';
    const ctx = detectAutocompleteContext(expr, expr.length);
    expect(ctx.kind).toBe('source-path');
    expect(ctx.prefix).toBe('ord');
  });

  it('returns none kind when inside an unrecognized function string argument', () => {
    const expr = 'static("val';
    const ctx = detectAutocompleteContext(expr, expr.length);
    expect(ctx.kind).toBe('none');
  });

  it('returns function kind after a closed string (not inside open string)', () => {
    // source("name") + cursor at end — we're outside the string
    const expr = 'source("name")';
    const ctx = detectAutocompleteContext(expr, expr.length);
    expect(ctx.kind).toBe('function');
  });

  it('handles escaped quotes inside string literals correctly', () => {
    // source("path\"escaped  — cursor still inside the string
    const expr = 'source("path\\"esc';
    const ctx = detectAutocompleteContext(expr, expr.length);
    expect(ctx.kind).toBe('source-path');
    expect(ctx.prefix).toBe('path\\"esc');
  });

  it('clamps cursor position to valid range', () => {
    const expr = 'source("x")';
    // cursor beyond end → treated as end
    expect(() => detectAutocompleteContext(expr, 999)).not.toThrow();
    expect(() => detectAutocompleteContext(expr, -5)).not.toThrow();
  });

  it('returns function prefix from partial word inside function argument position', () => {
    const expr = 'if(con';
    const ctx = detectAutocompleteContext(expr, expr.length);
    expect(ctx.kind).toBe('function');
    expect(ctx.prefix).toBe('con');
  });
});

// ---------------------------------------------------------------------------
// flattenSchemaPaths
// ---------------------------------------------------------------------------

describe('flattenSchemaPaths', () => {
  it('returns empty array for schema with no nodes', () => {
    const schema = makeSchema([]);
    expect(flattenSchemaPaths(schema)).toEqual([]);
  });

  it('returns flat paths for a schema with flat nodes', () => {
    const schema = makeSchema([
      makeNode('name', 'string'),
      makeNode('age', 'number'),
    ]);
    const paths = flattenSchemaPaths(schema);
    expect(paths.map((p) => p.path)).toEqual(['name', 'age']);
    expect(paths[0].type).toBe('string');
    expect(paths[1].type).toBe('number');
  });

  it('returns dot-notation paths for nested schema', () => {
    const schema = makeSchema([
      makeNode('order', 'object', [
        makeNode('order.customer', 'object', [
          makeNode('order.customer.name', 'string'),
        ]),
        makeNode('order.total', 'number'),
      ]),
    ]);
    const paths = flattenSchemaPaths(schema).map((p) => p.path);
    expect(paths).toEqual(['order', 'order.customer', 'order.customer.name', 'order.total']);
  });

  it('includes array nodes', () => {
    const itemsNode: SchemaTreeNode = {
      ...makeNode('items', 'array'),
      isArray: true,
      children: [makeNode('items.sku', 'string')],
      childCount: 1,
    };
    const schema = makeSchema([itemsNode]);
    const paths = flattenSchemaPaths(schema).map((p) => p.path);
    expect(paths).toContain('items');
    expect(paths).toContain('items.sku');
  });

  it('includes description when present', () => {
    const nodeWithDesc: SchemaTreeNode = {
      ...makeNode('id', 'string'),
      description: 'Unique identifier',
    };
    const schema = makeSchema([nodeWithDesc]);
    const paths = flattenSchemaPaths(schema);
    expect(paths[0].description).toBe('Unique identifier');
  });
});

// ---------------------------------------------------------------------------
// filterSuggestions
// ---------------------------------------------------------------------------

describe('filterSuggestions', () => {
  const items: AutocompleteItem[] = [
    { label: 'concat', insertText: 'concat()', detail: 'String (1+ args)', kind: 'function' },
    { label: 'contains', insertText: 'contains()', detail: 'String (2 args)', kind: 'function' },
    { label: 'cast', insertText: 'cast()', detail: 'TypeConversion (2 args)', kind: 'function' },
    { label: 'upper', insertText: 'upper()', detail: 'String (1 arg)', kind: 'function' },
  ];

  it('returns all items when prefix is empty', () => {
    expect(filterSuggestions(items, '')).toHaveLength(4);
  });

  it('filters items by prefix (case-insensitive)', () => {
    const result = filterSuggestions(items, 'con');
    expect(result.map((i) => i.label)).toEqual(['concat', 'contains']);
  });

  it('filters case-insensitively with uppercase prefix', () => {
    const result = filterSuggestions(items, 'CON');
    expect(result.map((i) => i.label)).toEqual(['concat', 'contains']);
  });

  it('returns empty when no match', () => {
    expect(filterSuggestions(items, 'xyz')).toHaveLength(0);
  });

  it('exact prefix match returns one item', () => {
    const result = filterSuggestions(items, 'upper');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('upper');
  });
});
