import { describe, expect, it } from 'vitest';

import { suggestSourceFields } from './suggest-source-fields';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNode(
  path: string,
  fieldName: string,
  type: SchemaTreeNode['type'],
): SchemaTreeNode {
  return {
    path,
    fieldName,
    type,
    depth: 0,
    isArray: false,
    isRequired: false,
    parentPath: null,
    childCount: 0,
    children: [],
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

const SOURCE_SCHEMA = makeSchema([
  makeNode('firstName', 'firstName', 'string'),
  makeNode('FirstName', 'FirstName', 'string'),   // case-insensitive match for 'firstname'
  makeNode('lastName', 'lastName', 'string'),
  makeNode('fullName', 'fullName', 'string'),      // contains 'name'
  makeNode('age', 'age', 'number'),
  makeNode('isActive', 'isActive', 'boolean'),
  makeNode('address', 'address', 'object'),        // should be excluded (object)
  makeNode('tags', 'tags', 'array'),               // should be excluded (array)
  makeNode('score', 'score', 'integer'),           // compatible with 'number' target
]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('suggestSourceFields', () => {
  it('returns empty array when parsedSourceSchema is null', () => {
    expect(suggestSourceFields('firstName', 'string', null)).toEqual([]);
  });

  it('returns empty array when schema has no nodes', () => {
    expect(suggestSourceFields('firstName', 'string', makeSchema([]))).toEqual([]);
  });

  it('returns exact match first', () => {
    const results = suggestSourceFields('firstName', 'string', SOURCE_SCHEMA);
    expect(results[0].path).toBe('firstName');
    expect(results[0].matchKind).toBe('exact');
  });

  it('returns case-insensitive match when no exact match', () => {
    // Target 'firstname' (lowercase) — source has 'FirstName' (different casing)
    const schema = makeSchema([makeNode('FirstName', 'FirstName', 'string')]);
    const results = suggestSourceFields('firstname', 'string', schema);
    expect(results[0].matchKind).toBe('case-insensitive');
    expect(results[0].path).toBe('FirstName');
  });

  it('returns contains match when no exact or case-insensitive match', () => {
    const results = suggestSourceFields('name', 'string', SOURCE_SCHEMA);
    const paths = results.map((r) => r.path);
    // fullName contains 'name', firstName contains 'name', lastName contains 'name'
    expect(paths.some((p) => p.includes('Name') || p.includes('name'))).toBe(true);
    results.forEach((r) => expect(r.matchKind).toBe('contains'));
  });

  it('excludes type-incompatible fields', () => {
    // Target is boolean — should not suggest string/number fields
    const results = suggestSourceFields('isActive', 'boolean', SOURCE_SCHEMA);
    results.forEach((r) => {
      expect(['boolean', 'any']).toContain(r.type);
    });
  });

  it('excludes object and array nodes', () => {
    const results = suggestSourceFields('address', 'string', SOURCE_SCHEMA);
    results.forEach((r) => {
      expect(r.type).not.toBe('object');
      expect(r.type).not.toBe('array');
    });
  });

  it('returns at most maxResults suggestions (default 5)', () => {
    const manyNodes = Array.from({ length: 20 }, (_, i) =>
      makeNode(`nameField${i}`, `nameField${i}`, 'string'),
    );
    const results = suggestSourceFields('name', 'string', makeSchema(manyNodes));
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('respects custom maxResults', () => {
    const manyNodes = Array.from({ length: 20 }, (_, i) =>
      makeNode(`nameField${i}`, `nameField${i}`, 'string'),
    );
    const results = suggestSourceFields('name', 'string', makeSchema(manyNodes), 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array when no fields match', () => {
    const schema = makeSchema([makeNode('zzz', 'zzz', 'string')]);
    const results = suggestSourceFields('firstName', 'string', schema);
    expect(results).toEqual([]);
  });

  it('integer source is compatible with number target', () => {
    const schema = makeSchema([makeNode('score', 'score', 'integer')]);
    const results = suggestSourceFields('score', 'number', schema);
    expect(results.length).toBe(1);
    expect(results[0].path).toBe('score');
  });

  it('number source is compatible with integer target', () => {
    const schema = makeSchema([makeNode('count', 'count', 'number')]);
    const results = suggestSourceFields('count', 'integer', schema);
    expect(results.length).toBe(1);
  });

  it('enum source is compatible with string target', () => {
    const schema = makeSchema([makeNode('status', 'status', 'enum')]);
    const results = suggestSourceFields('status', 'string', schema);
    expect(results.length).toBe(1);
  });

  it('any source is compatible with any target type', () => {
    const schema = makeSchema([makeNode('data', 'data', 'any')]);
    const results = suggestSourceFields('data', 'boolean', schema);
    expect(results.length).toBe(1);
  });

  it('exact match ranks above case-insensitive match', () => {
    // Both 'firstName' (exact) and 'FirstName' (case-insensitive) present
    const results = suggestSourceFields('firstName', 'string', SOURCE_SCHEMA);
    expect(results[0].matchKind).toBe('exact');
    expect(results[0].path).toBe('firstName');
  });
});
