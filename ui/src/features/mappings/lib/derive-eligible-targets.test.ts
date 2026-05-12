import { describe, expect, it } from 'vitest';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

import { deriveEligibleTargets } from './derive-eligible-targets';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(
  path: string,
  type: SchemaTreeNode['type'],
  children: SchemaTreeNode[] = [],
): SchemaTreeNode {
  return {
    path,
    fieldName: path.split('.').at(-1) ?? path,
    type,
    depth: path.split('.').length - 1,
    isArray: type === 'array',
    isRequired: false,
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
// Tests
// ---------------------------------------------------------------------------

describe('deriveEligibleTargets', () => {
  it('returns empty string for null schema', () => {
    expect(deriveEligibleTargets(null)).toBe('');
  });

  it('returns empty string for undefined schema', () => {
    expect(deriveEligibleTargets(undefined)).toBe('');
  });

  it('excludes object-type nodes from output', () => {
    const schema = makeSchema([
      makeNode('Order', 'object'),
      makeNode('Order.Header', 'object'),
      makeNode('Order.Header.DocumentType', 'string'),
    ]);

    const result = deriveEligibleTargets(schema);
    expect(result).toBe('- Order.Header.DocumentType (string)');
  });

  it('includes all non-object types: string, number, boolean, array, enum, null, any, union', () => {
    const schema = makeSchema([
      makeNode('Root', 'object'),
      makeNode('Root.StrField', 'string'),
      makeNode('Root.NumField', 'number'),
      makeNode('Root.BoolField', 'boolean'),
      makeNode('Root.ArrField', 'array'),
      makeNode('Root.EnumField', 'enum'),
      makeNode('Root.NullField', 'null'),
      makeNode('Root.AnyField', 'any'),
      makeNode('Root.UnionField', 'union'),
    ]);

    const result = deriveEligibleTargets(schema);
    const lines = result.split('\n');
    expect(lines).toHaveLength(8);
    expect(lines).toContain('- Root.StrField (string)');
    expect(lines).toContain('- Root.NumField (number)');
    expect(lines).toContain('- Root.BoolField (boolean)');
    expect(lines).toContain('- Root.ArrField (array)');
    expect(lines).toContain('- Root.EnumField (enum)');
    expect(lines).toContain('- Root.NullField (null)');
    expect(lines).toContain('- Root.AnyField (any)');
    expect(lines).toContain('- Root.UnionField (union)');
    // Object root is excluded
    expect(result).not.toContain('Root (object)');
  });

  it('includes array-type nodes (AE-03)', () => {
    const schema = makeSchema([
      makeNode('Order.Header', 'object'),
      makeNode('Order.Header.LineItems', 'array'),
      makeNode('Order.Header.Currency', 'string'),
    ]);

    const result = deriveEligibleTargets(schema);
    expect(result).toContain('- Order.Header.LineItems (array)');
    expect(result).toContain('- Order.Header.Currency (string)');
  });

  it('filters to descendants of sectionPath when provided', () => {
    const schema = makeSchema([
      makeNode('Order', 'object'),
      makeNode('Order.Header', 'object'),
      makeNode('Order.Header.DocumentType', 'string'),
      makeNode('Order.Header.Currency', 'string'),
      makeNode('Order.Lines', 'array'),
      makeNode('Order.Lines.LineNumber', 'number'),
    ]);

    const result = deriveEligibleTargets(schema, 'Order.Header');
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines).toContain('- Order.Header.DocumentType (string)');
    expect(lines).toContain('- Order.Header.Currency (string)');
    // Nodes outside the section are excluded
    expect(result).not.toContain('Order.Lines');
    expect(result).not.toContain('Order.Lines.LineNumber');
  });

  it('excludes the sectionPath node itself (only descendants)', () => {
    const schema = makeSchema([
      makeNode('Order.Header', 'object'),
      makeNode('Order.Header.DocumentType', 'string'),
    ]);

    const result = deriveEligibleTargets(schema, 'Order.Header');
    expect(result).not.toContain('Order.Header (object)');
    expect(result).toBe('- Order.Header.DocumentType (string)');
  });

  it('returns empty string when all descendants are objects', () => {
    const schema = makeSchema([
      makeNode('Order', 'object'),
      makeNode('Order.Header', 'object'),
      makeNode('Order.Header.Address', 'object'),
    ]);

    const result = deriveEligibleTargets(schema, 'Order');
    expect(result).toBe('');
  });

  it('returns all eligible nodes when no sectionPath is provided (header mode, AE-04)', () => {
    const schema = makeSchema([
      makeNode('Order', 'object'),
      makeNode('Order.Header', 'object'),
      makeNode('Order.Header.Id', 'string'),
      makeNode('Order.Lines', 'array'),
      makeNode('Order.Lines.LineNumber', 'number'),
    ]);

    const result = deriveEligibleTargets(schema);
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines).toContain('- Order.Header.Id (string)');
    expect(lines).toContain('- Order.Lines (array)');
    expect(lines).toContain('- Order.Lines.LineNumber (number)');
    // Object nodes excluded
    expect(result).not.toContain('Order (object)');
    expect(result).not.toContain('Order.Header (object)');
  });

  it('caps output at 200 lines when schema has more than 200 eligible nodes', () => {
    const nodes: SchemaTreeNode[] = [makeNode('Root', 'object')];
    for (let i = 0; i < 250; i++) {
      nodes.push(makeNode(`Root.Field${i}`, 'string'));
    }
    const schema = makeSchema(nodes);

    const result = deriveEligibleTargets(schema);
    const lines = result.split('\n');
    expect(lines).toHaveLength(200);
  });

  it('returns empty string when schema has no nodes', () => {
    const schema = makeSchema([]);
    expect(deriveEligibleTargets(schema)).toBe('');
  });

  it('handles null sectionPath the same as omitted (header mode)', () => {
    const schema = makeSchema([
      makeNode('Order', 'object'),
      makeNode('Order.Id', 'string'),
    ]);

    const withNull = deriveEligibleTargets(schema, null);
    const withUndefined = deriveEligibleTargets(schema, undefined);
    const withOmitted = deriveEligibleTargets(schema);

    expect(withNull).toBe(withUndefined);
    expect(withNull).toBe(withOmitted);
    expect(withNull).toBe('- Order.Id (string)');
  });

  it('output format is "- {path} ({type})" per line (AE-05)', () => {
    const schema = makeSchema([
      makeNode('Order', 'object'),
      makeNode('Order.Header.Id', 'string'),
      makeNode('Order.Lines', 'array'),
    ]);

    const result = deriveEligibleTargets(schema);
    expect(result).toBe('- Order.Header.Id (string)\n- Order.Lines (array)');
  });

  it('recursively includes nested children when schema.nodes only contains top-level objects', () => {
    const schema = makeSchema([
      makeNode('transaction', 'object', [
        makeNode('transaction.id', 'string'),
        makeNode('transaction.createdDate', 'string'),
      ]),
      makeNode('buyer', 'object', [
        makeNode('buyer.fullName', 'string'),
      ]),
      makeNode('lineItems', 'array', [
        makeNode('lineItems.productCode', 'string'),
      ]),
    ]);

    const result = deriveEligibleTargets(schema);
    expect(result).toBe(
      [
        '- transaction.id (string)',
        '- transaction.createdDate (string)',
        '- buyer.fullName (string)',
        '- lineItems (array)',
        '- lineItems.productCode (string)',
      ].join('\n'),
    );
  });

  it('applies section filtering against recursively traversed child nodes', () => {
    const schema = makeSchema([
      makeNode('transaction', 'object', [
        makeNode('transaction.id', 'string'),
      ]),
      makeNode('buyer', 'object', [
        makeNode('buyer.fullName', 'string'),
        makeNode('buyer.email', 'string'),
      ]),
    ]);

    const result = deriveEligibleTargets(schema, 'buyer');
    expect(result).toBe('- buyer.fullName (string)\n- buyer.email (string)');
  });

  it('deduplicates paths when parser output includes both top-level and nested copies', () => {
    const schema = makeSchema([
      makeNode('buyer', 'object', [
        makeNode('buyer.email', 'string'),
      ]),
      makeNode('buyer.email', 'string'),
    ]);

    const result = deriveEligibleTargets(schema);
    expect(result).toBe('- buyer.email (string)');
  });
});
