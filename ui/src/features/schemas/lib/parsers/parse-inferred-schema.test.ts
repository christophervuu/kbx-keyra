import { describe, expect, it } from 'vitest';

import { parseInferredSchema, SchemaParseError } from '@/features/schemas';

describe('parseInferredSchema', () => {
  describe('AE-07: Basic JSON inference', () => {
    it('infers types from simple JSON sample', () => {
      const result = parseInferredSchema(
        JSON.stringify({ name: 'Alice', age: 30, active: true }),
        'json',
      );
      expect(result.nodes).toHaveLength(3);
      expect(result.nodes[0].fieldName).toBe('name');
      expect(result.nodes[0].type).toBe('string');
      expect(result.nodes[1].fieldName).toBe('age');
      expect(result.nodes[1].type).toBe('number');
      expect(result.nodes[2].fieldName).toBe('active');
      expect(result.nodes[2].type).toBe('boolean');
    });

    it('marks all nodes as inferred', () => {
      const result = parseInferredSchema(JSON.stringify({ name: 'Alice', scores: [95, 88] }), 'json');
      expect(result.inferred).toBe(true);
      for (const node of result.nodes) {
        expect(node.inferred).toBe(true);
      }
    });

    it('infers array type from array values (AE-07 scores)', () => {
      const result = parseInferredSchema(JSON.stringify({ name: 'Alice', scores: [95, 88] }), 'json');
      const scores = result.nodes.find((n) => n.fieldName === 'scores');
      expect(scores).toBeDefined();
      expect(scores!.type).toBe('array');
      expect(scores!.isArray).toBe(true);
    });

    it('infers string type for name field (AE-07)', () => {
      const result = parseInferredSchema(JSON.stringify({ name: 'Alice', scores: [95, 88] }), 'json');
      const name = result.nodes.find((n) => n.fieldName === 'name');
      expect(name!.type).toBe('string');
    });

    it('sets isRequired to false for all inferred nodes', () => {
      const result = parseInferredSchema(JSON.stringify({ a: 1, b: 'x' }), 'json');
      for (const node of result.nodes) {
        expect(node.isRequired).toBe(false);
      }
    });

    it('records parseTimeMs', () => {
      const result = parseInferredSchema(JSON.stringify({ x: 1 }), 'json');
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('sets format to json-schema', () => {
      const result = parseInferredSchema(JSON.stringify({ x: 1 }), 'json');
      expect(result.format).toBe('json-schema');
    });
  });

  describe('JSON nested objects', () => {
    it('infers nested object structure', () => {
      const result = parseInferredSchema(
        JSON.stringify({ address: { street: 'Main', city: 'NYC' } }),
        'json',
      );
      expect(result.nodes).toHaveLength(1);
      const address = result.nodes[0];
      expect(address.type).toBe('object');
      expect(address.fieldName).toBe('address');
      expect(address.children).toHaveLength(2);
      expect(address.childCount).toBe(2);
    });

    it('sets correct paths for nested nodes', () => {
      const result = parseInferredSchema(
        JSON.stringify({ address: { street: 'Main', city: 'NYC' } }),
        'json',
      );
      const address = result.nodes[0];
      expect(address.path).toBe('address');
      expect(address.children[0].path).toBe('address.street');
      expect(address.children[1].path).toBe('address.city');
    });

    it('sets correct depth for nested nodes', () => {
      const result = parseInferredSchema(
        JSON.stringify({ address: { street: 'Main' } }),
        'json',
      );
      expect(result.nodes[0].depth).toBe(0);
      expect(result.nodes[0].children[0].depth).toBe(1);
    });

    it('sets parentPath correctly', () => {
      const result = parseInferredSchema(
        JSON.stringify({ address: { street: 'Main' } }),
        'json',
      );
      expect(result.nodes[0].parentPath).toBeNull();
      expect(result.nodes[0].children[0].parentPath).toBe('address');
    });

    it('marks nested nodes as inferred', () => {
      const result = parseInferredSchema(
        JSON.stringify({ address: { street: 'Main' } }),
        'json',
      );
      expect(result.nodes[0].inferred).toBe(true);
      expect(result.nodes[0].children[0].inferred).toBe(true);
    });
  });

  describe('JSON arrays', () => {
    it('infers array of primitives (no children)', () => {
      const result = parseInferredSchema(JSON.stringify({ scores: [95, 88, 72] }), 'json');
      const scores = result.nodes[0];
      expect(scores.type).toBe('array');
      expect(scores.isArray).toBe(true);
      expect(scores.children).toHaveLength(0);
    });

    it('infers array of objects with children from first element', () => {
      const result = parseInferredSchema(
        JSON.stringify({ items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] }),
        'json',
      );
      const items = result.nodes[0];
      expect(items.type).toBe('array');
      expect(items.isArray).toBe(true);
      expect(items.children).toHaveLength(2);
      expect(items.children[0].fieldName).toBe('id');
      expect(items.children[0].type).toBe('number');
      expect(items.children[1].fieldName).toBe('name');
      expect(items.children[1].type).toBe('string');
    });

    it('sets correct paths for array item children', () => {
      const result = parseInferredSchema(
        JSON.stringify({ items: [{ id: 1 }] }),
        'json',
      );
      expect(result.nodes[0].children[0].path).toBe('items.id');
      expect(result.nodes[0].children[0].parentPath).toBe('items');
    });

    it('handles empty array (no children)', () => {
      const result = parseInferredSchema(JSON.stringify({ tags: [] }), 'json');
      const tags = result.nodes[0];
      expect(tags.type).toBe('array');
      expect(tags.children).toHaveLength(0);
    });
  });

  describe('JSON special values', () => {
    it('infers null type', () => {
      const result = parseInferredSchema(JSON.stringify({ data: null }), 'json');
      expect(result.nodes[0].type).toBe('null');
    });

    it('handles empty object (zero nodes)', () => {
      const result = parseInferredSchema('{}', 'json');
      expect(result.nodes).toHaveLength(0);
      expect(result.totalFieldCount).toBe(0);
    });

    it('handles top-level array by inferring from first object element', () => {
      const result = parseInferredSchema(
        JSON.stringify([{ name: 'Alice' }, { name: 'Bob' }]),
        'json',
      );
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].fieldName).toBe('name');
      expect(result.nodes[0].type).toBe('string');
    });

    it('handles top-level empty array', () => {
      const result = parseInferredSchema('[]', 'json');
      expect(result.nodes).toHaveLength(0);
    });
  });

  describe('JSON error handling (AE-08)', () => {
    it('throws SchemaParseError for invalid JSON', () => {
      expect(() => parseInferredSchema('{ invalid', 'json')).toThrow(SchemaParseError);
    });

    it('throws SchemaParseError for primitive JSON values', () => {
      expect(() => parseInferredSchema('"just a string"', 'json')).toThrow(SchemaParseError);
    });

    it('throws SchemaParseError for null JSON', () => {
      expect(() => parseInferredSchema('null', 'json')).toThrow(SchemaParseError);
    });

    it('throws SchemaParseError for empty string', () => {
      expect(() => parseInferredSchema('', 'json')).toThrow(SchemaParseError);
    });

    it('includes error details', () => {
      try {
        parseInferredSchema('{ invalid', 'json');
      } catch (err) {
        expect(err).toBeInstanceOf(SchemaParseError);
        expect((err as SchemaParseError).details).toBeDefined();
      }
    });
  });

  describe('XML inference', () => {
    it('infers structure from XML elements', () => {
      const xml = '<root><name>Alice</name><age>30</age></root>';
      const result = parseInferredSchema(xml, 'xml');
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].fieldName).toBe('name');
      expect(result.nodes[0].type).toBe('string');
      expect(result.nodes[1].fieldName).toBe('age');
      expect(result.nodes[1].type).toBe('string'); // Conservative: text content = string
    });

    it('infers nested XML structure as object', () => {
      const xml = '<root><address><street>Main</street><city>NYC</city></address></root>';
      const result = parseInferredSchema(xml, 'xml');
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].fieldName).toBe('address');
      expect(result.nodes[0].type).toBe('object');
      expect(result.nodes[0].children).toHaveLength(2);
      expect(result.nodes[0].children[0].fieldName).toBe('street');
    });

    it('detects repeated elements as array', () => {
      const xml = '<root><item>A</item><item>B</item><item>C</item></root>';
      const result = parseInferredSchema(xml, 'xml');
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].fieldName).toBe('item');
      expect(result.nodes[0].isArray).toBe(true);
    });

    it('marks all XML-inferred nodes as inferred', () => {
      const xml = '<root><name>Alice</name></root>';
      const result = parseInferredSchema(xml, 'xml');
      expect(result.inferred).toBe(true);
      expect(result.nodes[0].inferred).toBe(true);
    });

    it('sets correct paths for XML nodes', () => {
      const xml = '<root><address><city>NYC</city></address></root>';
      const result = parseInferredSchema(xml, 'xml');
      expect(result.nodes[0].path).toBe('address');
      expect(result.nodes[0].children[0].path).toBe('address.city');
    });

    it('handles XML with no child elements (empty root)', () => {
      const xml = '<root></root>';
      const result = parseInferredSchema(xml, 'xml');
      expect(result.nodes).toHaveLength(0);
    });
  });

  describe('XML error handling', () => {
    it('throws SchemaParseError for invalid XML', () => {
      expect(() => parseInferredSchema('<not valid xml', 'xml')).toThrow(SchemaParseError);
    });

    it('includes error format in SchemaParseError', () => {
      try {
        parseInferredSchema('<invalid', 'xml');
      } catch (err) {
        expect((err as SchemaParseError).format).toBe('json-schema');
      }
    });
  });

  describe('Total field count', () => {
    it('counts all nodes across nesting levels', () => {
      const result = parseInferredSchema(
        JSON.stringify({ a: 1, b: { c: 2, d: 3 } }),
        'json',
      );
      // a + b + c + d = 4
      expect(result.totalFieldCount).toBe(4);
    });
  });
});
