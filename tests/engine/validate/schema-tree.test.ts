import { describe, expect, it } from 'vitest';

import { buildSchemaTree, getOrBuildSchemaTree } from '../../../src/engine/validate/index.js';

describe('SchemaTree', () => {
  it('buildSchemaTree() parses flat object schema paths, types, and required leaves', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        age: { type: 'integer' },
        active: { type: 'boolean' },
      },
      required: ['id', 'active'],
    };

    const tree = buildSchemaTree(schema);

    expect(tree.hasPath('id')).toBe(true);
    expect(tree.hasPath('age')).toBe(true);
    expect(tree.hasPath('active')).toBe(true);
    expect(tree.hasPath('missing')).toBe(false);

    expect(tree.getTypeAtPath('id')).toBe('string');
    expect(tree.getTypeAtPath('age')).toBe('number');
    expect(tree.getTypeAtPath('active')).toBe('boolean');

    expect(tree.getRequiredLeafPaths().sort()).toEqual(['active', 'id']);
  });

  it('supports nested object paths', () => {
    const schema = {
      type: 'object',
      properties: {
        customer: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: {
              type: 'object',
              properties: {
                city: { type: 'string' },
              },
            },
          },
          required: ['name'],
        },
      },
      required: ['customer'],
    };

    const tree = buildSchemaTree(schema);

    expect(tree.hasPath('customer.name')).toBe(true);
    expect(tree.hasPath('customer.address.city')).toBe(true);
    expect(tree.hasPath('customer.address.zip')).toBe(false);

    expect(tree.getTypeAtPath('customer')).toBe('object');
    expect(tree.getTypeAtPath('customer.name')).toBe('string');
    expect(tree.getRequiredLeafPaths()).toEqual(['customer.name']);
  });

  it('supports arrays and transparent traversal through array item nodes', () => {
    const schema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['sku'],
          },
        },
      },
      required: ['items'],
    };

    const tree = buildSchemaTree(schema);

    expect(tree.isArrayPath('items')).toBe(true);
    expect(tree.hasPath('items.sku')).toBe(true);
    expect(tree.hasPath('items[0].sku')).toBe(true);
    expect(tree.getTypeAtPath('items.sku')).toBe('string');
    expect(tree.getRequiredLeafPaths()).toEqual(['items.sku']);
  });

  it('resolves local refs from $defs and definitions', () => {
    const schema = {
      type: 'object',
      properties: {
        customer: { $ref: '#/$defs/Customer' },
        order: { $ref: '#/definitions/Order' },
      },
      required: ['customer'],
      $defs: {
        Customer: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
      definitions: {
        Order: {
          type: 'object',
          properties: {
            total: { type: 'number' },
          },
        },
      },
    };

    const tree = buildSchemaTree(schema);

    expect(tree.hasPath('customer.id')).toBe(true);
    expect(tree.getTypeAtPath('customer.id')).toBe('string');
    expect(tree.hasPath('order.total')).toBe(true);
    expect(tree.getTypeAtPath('order.total')).toBe('number');
    expect(tree.getRequiredLeafPaths()).toEqual(['customer.id']);
  });

  it('merges allOf object properties', () => {
    const schema = {
      allOf: [
        {
          type: 'object',
          properties: {
            a: { type: 'string' },
          },
          required: ['a'],
        },
        {
          type: 'object',
          properties: {
            b: { type: 'number' },
          },
          required: ['b'],
        },
      ],
    };

    const tree = buildSchemaTree(schema);

    expect(tree.hasPath('a')).toBe(true);
    expect(tree.hasPath('b')).toBe(true);
    expect(tree.getRequiredLeafPaths().sort()).toEqual(['a', 'b']);
  });

  it('returns best-effort tree for malformed schema', () => {
    const malformed = {
      type: 'not-a-real-json-schema-type',
      properties: 'oops',
    };

    const tree = buildSchemaTree(malformed);

    expect(tree.hasPath('anything')).toBe(false);
    expect(tree.getTypeAtPath('')).toBe('any');
    expect(tree.getRequiredLeafPaths()).toEqual([]);
  });

  it('supports empty schema gracefully', () => {
    const tree = buildSchemaTree({});

    expect(tree.hasPath('')).toBe(true);
    expect(tree.hasPath('x')).toBe(false);
    expect(tree.getTypeAtPath('x')).toBeUndefined();
    expect(tree.getRequiredLeafPaths()).toEqual([]);
  });

  it('getOrBuildSchemaTree() caches by object reference', () => {
    const schema = { type: 'object', properties: { id: { type: 'string' } } };

    const first = getOrBuildSchemaTree(schema);
    const second = getOrBuildSchemaTree(schema);

    expect(first).toBe(second);
  });

  it('getOrBuildSchemaTree() does not dedupe by deep equality', () => {
    const schemaA = { type: 'object', properties: { id: { type: 'string' } } };
    const schemaB = { type: 'object', properties: { id: { type: 'string' } } };

    const treeA = getOrBuildSchemaTree(schemaA);
    const treeB = getOrBuildSchemaTree(schemaB);

    expect(treeA).not.toBe(treeB);
    expect(treeA.getTypeAtPath('id')).toBe('string');
    expect(treeB.getTypeAtPath('id')).toBe('string');
  });

  it('buildSchemaTree() with xsd format returns permissive tree + info diagnostic', () => {
    const tree = buildSchemaTree('<xsd:schema/>', 'xsd');

    expect(tree.hasPath('anything.at.all')).toBe(true);
    expect(tree.getTypeAtPath('anything.at.all')).toBeUndefined();
    expect(tree.getRequiredLeafPaths()).toEqual([]);
    expect(tree.isArrayPath('items')).toBe(false);

    expect(tree.diagnostics).toHaveLength(1);
    expect(tree.diagnostics[0]).toMatchObject({
      severity: 'info',
      message:
        'XSD schema support is not yet implemented — schema-dependent validation checks are skipped',
    });
  });
});
