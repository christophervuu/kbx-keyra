import { describe, expect, it } from 'vitest';

import { parseJsonSchema, SchemaParseError } from '@/features/schemas';

describe('parseJsonSchema', () => {
  describe('AE-01: Simple JSON Schema with multiple types', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
          },
        },
      },
      required: ['name'],
    };

    it('produces correct number of total nodes', () => {
      const result = parseJsonSchema(schema);
      expect(result.totalFieldCount).toBe(5);
    });

    it('produces 3 top-level nodes', () => {
      const result = parseJsonSchema(schema);
      expect(result.nodes).toHaveLength(3);
    });

    it('assigns correct field names', () => {
      const result = parseJsonSchema(schema);
      const names = result.nodes.map((n) => n.fieldName);
      expect(names).toEqual(['name', 'age', 'address']);
    });

    it('assigns correct types', () => {
      const result = parseJsonSchema(schema);
      expect(result.nodes[0].type).toBe('string');
      expect(result.nodes[1].type).toBe('number');
      expect(result.nodes[2].type).toBe('object');
    });

    it('marks name as required', () => {
      const result = parseJsonSchema(schema);
      expect(result.nodes[0].isRequired).toBe(true);
      expect(result.nodes[1].isRequired).toBe(false);
      expect(result.nodes[2].isRequired).toBe(false);
    });

    it('sets correct paths using dot notation', () => {
      const result = parseJsonSchema(schema);
      expect(result.nodes[0].path).toBe('name');
      expect(result.nodes[1].path).toBe('age');
      expect(result.nodes[2].path).toBe('address');

      const addressChildren = result.nodes[2].children;
      expect(addressChildren[0].path).toBe('address.street');
      expect(addressChildren[1].path).toBe('address.city');
    });

    it('sets correct depth values', () => {
      const result = parseJsonSchema(schema);
      expect(result.nodes[0].depth).toBe(0);
      expect(result.nodes[2].children[0].depth).toBe(1);
    });

    it('sets parentPath correctly', () => {
      const result = parseJsonSchema(schema);
      expect(result.nodes[0].parentPath).toBeNull();
      expect(result.nodes[2].children[0].parentPath).toBe('address');
    });

    it('sets childCount on expandable nodes', () => {
      const result = parseJsonSchema(schema);
      expect(result.nodes[0].childCount).toBe(0);
      expect(result.nodes[2].childCount).toBe(2);
    });

    it('expands address children correctly', () => {
      const result = parseJsonSchema(schema);
      const addressNode = result.nodes[2];
      expect(addressNode.children).toHaveLength(2);
      expect(addressNode.children[0].fieldName).toBe('street');
      expect(addressNode.children[0].type).toBe('string');
      expect(addressNode.children[1].fieldName).toBe('city');
      expect(addressNode.children[1].type).toBe('string');
    });

    it('sets isArray false for non-array types', () => {
      const result = parseJsonSchema(schema);
      for (const node of result.nodes) {
        expect(node.isArray).toBe(false);
      }
    });

    it('sets format to json-schema', () => {
      const result = parseJsonSchema(schema);
      expect(result.format).toBe('json-schema');
    });

    it('sets inferred to false', () => {
      const result = parseJsonSchema(schema);
      expect(result.inferred).toBe(false);
    });

    it('records parseTimeMs', () => {
      const result = parseJsonSchema(schema);
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Input handling', () => {
    it('accepts a JSON string', () => {
      const input = JSON.stringify({
        type: 'object',
        properties: { foo: { type: 'string' } },
      });
      const result = parseJsonSchema(input);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].fieldName).toBe('foo');
    });

    it('accepts a pre-parsed object', () => {
      const result = parseJsonSchema({
        type: 'object',
        properties: { bar: { type: 'number' } },
      });
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].type).toBe('number');
    });
  });

  describe('AE-08: Invalid input handling', () => {
    it('throws SchemaParseError for invalid JSON string', () => {
      expect(() => parseJsonSchema('{ invalid json')).toThrow(SchemaParseError);
    });

    it('includes error details for invalid JSON', () => {
      try {
        parseJsonSchema('{ invalid }');
      } catch (err) {
        expect(err).toBeInstanceOf(SchemaParseError);
        expect((err as SchemaParseError).format).toBe('json-schema');
        expect((err as SchemaParseError).details).toBeDefined();
      }
    });

    it('throws SchemaParseError for null content', () => {
      expect(() => parseJsonSchema('null')).toThrow(SchemaParseError);
    });

    it('throws SchemaParseError for array content', () => {
      expect(() => parseJsonSchema('[]')).toThrow(SchemaParseError);
    });

    it('throws SchemaParseError for primitive content', () => {
      expect(() => parseJsonSchema('"just a string"')).toThrow(SchemaParseError);
    });
  });

  describe('Empty schema', () => {
    it('returns empty nodes for schema with no properties', () => {
      const result = parseJsonSchema({ type: 'object' });
      expect(result.nodes).toHaveLength(0);
      expect(result.totalFieldCount).toBe(0);
    });

    it('returns empty nodes for empty object', () => {
      const result = parseJsonSchema({});
      expect(result.nodes).toHaveLength(0);
      expect(result.totalFieldCount).toBe(0);
    });

    it('returns empty nodes for schema with empty properties', () => {
      const result = parseJsonSchema({ type: 'object', properties: {} });
      expect(result.nodes).toHaveLength(0);
      expect(result.totalFieldCount).toBe(0);
    });
  });

  describe('Type mapping', () => {
    it('maps string type correctly', () => {
      const result = parseJsonSchema({
        properties: { f: { type: 'string' } },
      });
      expect(result.nodes[0].type).toBe('string');
    });

    it('maps number type correctly', () => {
      const result = parseJsonSchema({
        properties: { f: { type: 'number' } },
      });
      expect(result.nodes[0].type).toBe('number');
    });

    it('maps integer to number', () => {
      const result = parseJsonSchema({
        properties: { f: { type: 'integer' } },
      });
      expect(result.nodes[0].type).toBe('number');
    });

    it('maps boolean type correctly', () => {
      const result = parseJsonSchema({
        properties: { f: { type: 'boolean' } },
      });
      expect(result.nodes[0].type).toBe('boolean');
    });

    it('maps null type correctly', () => {
      const result = parseJsonSchema({
        properties: { f: { type: 'null' } },
      });
      expect(result.nodes[0].type).toBe('null');
    });

    it('maps object type correctly', () => {
      const result = parseJsonSchema({
        properties: { f: { type: 'object' } },
      });
      expect(result.nodes[0].type).toBe('object');
    });

    it('infers object type from properties presence', () => {
      const result = parseJsonSchema({
        properties: { f: { properties: { nested: { type: 'string' } } } },
      });
      expect(result.nodes[0].type).toBe('object');
    });

    it('maps array type correctly', () => {
      const result = parseJsonSchema({
        properties: { f: { type: 'array', items: { type: 'string' } } },
      });
      expect(result.nodes[0].type).toBe('array');
      expect(result.nodes[0].isArray).toBe(true);
    });

    it('infers array type from items presence', () => {
      const result = parseJsonSchema({
        properties: { f: { items: { type: 'string' } } },
      });
      expect(result.nodes[0].type).toBe('array');
      expect(result.nodes[0].isArray).toBe(true);
    });

    it('maps missing type to any', () => {
      const result = parseJsonSchema({
        properties: { f: {} },
      });
      expect(result.nodes[0].type).toBe('any');
    });

    it('maps type array (e.g., ["string", "null"]) to union', () => {
      const result = parseJsonSchema({
        properties: { f: { type: ['string', 'null'] } },
      });
      expect(result.nodes[0].type).toBe('union');
    });
  });

  describe('Enum detection', () => {
    it('sets type to enum when enum is present', () => {
      const result = parseJsonSchema({
        properties: { status: { enum: ['active', 'inactive', 'pending'] } },
      });
      expect(result.nodes[0].type).toBe('enum');
    });

    it('populates enumValues', () => {
      const result = parseJsonSchema({
        properties: { status: { enum: ['active', 'inactive'] } },
      });
      expect(result.nodes[0].enumValues).toEqual(['active', 'inactive']);
    });

    it('converts non-string enum values to strings', () => {
      const result = parseJsonSchema({
        properties: { code: { enum: [1, 2, 3] } },
      });
      expect(result.nodes[0].enumValues).toEqual(['1', '2', '3']);
    });
  });

  describe('oneOf / anyOf (union types)', () => {
    it('sets type to union for oneOf', () => {
      const result = parseJsonSchema({
        properties: {
          value: {
            oneOf: [{ type: 'string' }, { type: 'number' }],
          },
        },
      });
      expect(result.nodes[0].type).toBe('union');
    });

    it('extracts member types from oneOf into unionTypes', () => {
      const result = parseJsonSchema({
        properties: {
          value: {
            oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
          },
        },
      });
      expect(result.nodes[0].unionTypes).toEqual(['string', 'number', 'boolean']);
    });

    it('sets type to union for anyOf', () => {
      const result = parseJsonSchema({
        properties: {
          value: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
          },
        },
      });
      expect(result.nodes[0].type).toBe('union');
      expect(result.nodes[0].unionTypes).toEqual(['string', 'null']);
    });

    it('detects object and array member types in unions', () => {
      const result = parseJsonSchema({
        properties: {
          value: {
            oneOf: [
              { properties: { x: { type: 'string' } } },
              { items: { type: 'number' } },
            ],
          },
        },
      });
      expect(result.nodes[0].unionTypes).toEqual(['object', 'array']);
    });
  });

  describe('Description extraction', () => {
    it('extracts description from schema', () => {
      const result = parseJsonSchema({
        properties: {
          name: { type: 'string', description: 'The user name' },
        },
      });
      expect(result.nodes[0].description).toBe('The user name');
    });

    it('leaves description undefined when not present', () => {
      const result = parseJsonSchema({
        properties: { name: { type: 'string' } },
      });
      expect(result.nodes[0].description).toBeUndefined();
    });
  });

  describe('Required field handling', () => {
    it('marks fields in required array as isRequired', () => {
      const result = parseJsonSchema({
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
          c: { type: 'string' },
        },
        required: ['a', 'c'],
      });
      expect(result.nodes[0].isRequired).toBe(true); // a
      expect(result.nodes[1].isRequired).toBe(false); // b
      expect(result.nodes[2].isRequired).toBe(true); // c
    });

    it('handles nested required fields', () => {
      const result = parseJsonSchema({
        properties: {
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              zip: { type: 'string' },
            },
            required: ['zip'],
          },
        },
      });
      const address = result.nodes[0];
      expect(address.children[0].isRequired).toBe(false); // street
      expect(address.children[1].isRequired).toBe(true); // zip
    });
  });

  describe('Nested objects (multi-level)', () => {
    it('handles 3 levels of nesting', () => {
      const result = parseJsonSchema({
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: { type: 'string' },
                },
              },
            },
          },
        },
      });
      expect(result.nodes[0].depth).toBe(0);
      expect(result.nodes[0].children[0].depth).toBe(1);
      expect(result.nodes[0].children[0].children[0].depth).toBe(2);
      expect(result.nodes[0].children[0].children[0].fieldName).toBe('level3');
      expect(result.nodes[0].children[0].children[0].path).toBe('level1.level2.level3');
    });

    it('sets parentPath correctly through nesting levels', () => {
      const result = parseJsonSchema({
        properties: {
          a: {
            type: 'object',
            properties: {
              b: {
                type: 'object',
                properties: { c: { type: 'string' } },
              },
            },
          },
        },
      });
      expect(result.nodes[0].parentPath).toBeNull();
      expect(result.nodes[0].children[0].parentPath).toBe('a');
      expect(result.nodes[0].children[0].children[0].parentPath).toBe('a.b');
    });
  });

  describe('Array items with nested properties', () => {
    it('shows array item properties as children of array node', () => {
      const result = parseJsonSchema({
        properties: {
          users: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' },
              },
            },
          },
        },
      });
      const usersNode = result.nodes[0];
      expect(usersNode.type).toBe('array');
      expect(usersNode.isArray).toBe(true);
      expect(usersNode.children).toHaveLength(2);
      expect(usersNode.children[0].fieldName).toBe('name');
      expect(usersNode.children[0].path).toBe('users.name');
      expect(usersNode.children[1].fieldName).toBe('email');
    });

    it('handles array items without properties (no children)', () => {
      const result = parseJsonSchema({
        properties: {
          tags: { type: 'array', items: { type: 'string' } },
        },
      });
      expect(result.nodes[0].type).toBe('array');
      expect(result.nodes[0].children).toHaveLength(0);
    });

    it('handles tuple-style items (takes first item)', () => {
      const result = parseJsonSchema({
        properties: {
          coords: {
            type: 'array',
            items: [
              { type: 'object', properties: { x: { type: 'number' } } },
              { type: 'object', properties: { y: { type: 'number' } } },
            ],
          },
        },
      });
      const coords = result.nodes[0];
      expect(coords.type).toBe('array');
      // Takes first item's properties
      expect(coords.children).toHaveLength(1);
      expect(coords.children[0].fieldName).toBe('x');
    });
  });

  describe('Local $ref resolution', () => {
    it('resolves $ref to definitions', () => {
      const result = parseJsonSchema({
        definitions: {
          Address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
            },
          },
        },
        properties: {
          homeAddress: { $ref: '#/definitions/Address' },
        },
      });
      expect(result.nodes[0].type).toBe('object');
      expect(result.nodes[0].children).toHaveLength(2);
      expect(result.nodes[0].children[0].fieldName).toBe('street');
    });

    it('resolves $ref to $defs', () => {
      const result = parseJsonSchema({
        $defs: {
          Phone: {
            type: 'object',
            properties: {
              number: { type: 'string' },
              type: { type: 'string' },
            },
          },
        },
        properties: {
          phone: { $ref: '#/$defs/Phone' },
        },
      });
      expect(result.nodes[0].type).toBe('object');
      expect(result.nodes[0].children).toHaveLength(2);
    });

    it('resolves nested $refs', () => {
      const result = parseJsonSchema({
        definitions: {
          Street: { type: 'string', description: 'A street name' },
          Address: {
            type: 'object',
            properties: {
              street: { $ref: '#/definitions/Street' },
            },
          },
        },
        properties: {
          addr: { $ref: '#/definitions/Address' },
        },
      });
      expect(result.nodes[0].type).toBe('object');
      expect(result.nodes[0].children[0].type).toBe('string');
      expect(result.nodes[0].children[0].description).toBe('A street name');
    });

    it('handles unresolvable $ref gracefully', () => {
      const result = parseJsonSchema({
        properties: {
          thing: { $ref: '#/definitions/DoesNotExist' },
        },
      });
      // Should not throw, just uses the schema as-is (which has $ref but no type)
      expect(result.nodes[0]).toBeDefined();
    });

    it('ignores remote $ref (non-local)', () => {
      const result = parseJsonSchema({
        properties: {
          ext: { $ref: 'https://example.com/schema.json' },
        },
      });
      expect(result.nodes[0]).toBeDefined();
      expect(result.nodes[0].type).toBe('any');
    });
  });

  describe('Circular $ref detection', () => {
    it('does not infinite loop on direct circular reference', () => {
      const result = parseJsonSchema({
        definitions: {
          Node: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              next: { $ref: '#/definitions/Node' },
            },
          },
        },
        properties: {
          root: { $ref: '#/definitions/Node' },
        },
      });
      expect(result.nodes[0].type).toBe('object');
      expect(result.nodes[0].children).toHaveLength(2);
      // The circular child should have [Circular Reference] description
      const nextNode = result.nodes[0].children[1];
      expect(nextNode.fieldName).toBe('next');
      expect(nextNode.description).toBe('[Circular Reference]');
    });

    it('does not infinite loop on indirect circular reference', () => {
      const result = parseJsonSchema({
        definitions: {
          A: {
            type: 'object',
            properties: { b: { $ref: '#/definitions/B' } },
          },
          B: {
            type: 'object',
            properties: { a: { $ref: '#/definitions/A' } },
          },
        },
        properties: {
          start: { $ref: '#/definitions/A' },
        },
      });
      // Should complete without hanging
      expect(result.nodes[0].type).toBe('object');
    });
  });

  describe('Performance', () => {
    it('parses a 1000-node schema in under 1 second', () => {
      // Generate a wide schema with many properties
      const properties: Record<string, object> = {};
      for (let i = 0; i < 1000; i++) {
        properties[`field_${i}`] = { type: 'string', description: `Field ${i}` };
      }
      const schema = { type: 'object', properties };

      const start = performance.now();
      const result = parseJsonSchema(schema);
      const elapsed = performance.now() - start;

      expect(result.totalFieldCount).toBe(1000);
      expect(elapsed).toBeLessThan(1000);
    });

    it('records parse time accurately', () => {
      const properties: Record<string, object> = {};
      for (let i = 0; i < 100; i++) {
        properties[`field_${i}`] = { type: 'string' };
      }
      const result = parseJsonSchema({ type: 'object', properties });
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
