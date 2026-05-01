import { describe, expect, it } from 'vitest';

import {
  parseInferredSchema,
  parseJsonSchema,
  parseXsd,
  SchemaParseError,
} from '@/features/schemas';
import type { SchemaTreeViewProps } from '@/features/schemas';
import type {
  MappingNodeStatus,
  ParsedSchema,
  SchemaNodeType,
  SchemaTreeNode,
} from '@/lib/types';

describe('FS-009 T-01: Schema tree types and parser contracts', () => {
  describe('SchemaTreeNode type compatibility', () => {
    it('has all required DynamoDB SchemaNodes fields', () => {
      // This test validates at compile time that SchemaTreeNode contains
      // the canonical DynamoDB fields. If any are missing, TypeScript will error.
      const node: SchemaTreeNode = {
        path: 'address.street',
        fieldName: 'street',
        type: 'string',
        description: 'Street address',
        depth: 1,
        isArray: false,
        isRequired: true,
        parentPath: 'address',
        childCount: 0,
        children: [],
      };

      expect(node.path).toBe('address.street');
      expect(node.fieldName).toBe('street');
      expect(node.type).toBe('string');
      expect(node.description).toBe('Street address');
      expect(node.depth).toBe(1);
      expect(node.isArray).toBe(false);
      expect(node.isRequired).toBe(true);
      expect(node.parentPath).toBe('address');
      expect(node.childCount).toBe(0);
      expect(node.children).toEqual([]);
    });

    it('supports optional fields (enum, inferred, union, XSD cardinality)', () => {
      const node: SchemaTreeNode = {
        path: 'status',
        fieldName: 'status',
        type: 'enum',
        depth: 0,
        isArray: false,
        isRequired: false,
        parentPath: null,
        childCount: 0,
        children: [],
        enumValues: ['active', 'inactive'],
        inferred: true,
        unionTypes: ['string', 'number'],
        minOccurs: 0,
        maxOccurs: 'unbounded',
      };

      expect(node.enumValues).toEqual(['active', 'inactive']);
      expect(node.inferred).toBe(true);
      expect(node.unionTypes).toEqual(['string', 'number']);
      expect(node.minOccurs).toBe(0);
      expect(node.maxOccurs).toBe('unbounded');
    });

    it('supports nested children structure', () => {
      const child: SchemaTreeNode = {
        path: 'address.city',
        fieldName: 'city',
        type: 'string',
        depth: 1,
        isArray: false,
        isRequired: false,
        parentPath: 'address',
        childCount: 0,
        children: [],
      };

      const parent: SchemaTreeNode = {
        path: 'address',
        fieldName: 'address',
        type: 'object',
        depth: 0,
        isArray: false,
        isRequired: false,
        parentPath: null,
        childCount: 1,
        children: [child],
      };

      expect(parent.children).toHaveLength(1);
      expect(parent.children[0].path).toBe('address.city');
    });
  });

  describe('SchemaNodeType union', () => {
    it('includes all expected type values', () => {
      const types: SchemaNodeType[] = [
        'string',
        'number',
        'boolean',
        'object',
        'array',
        'enum',
        'null',
        'any',
        'union',
      ];

      expect(types).toHaveLength(9);
    });
  });

  describe('MappingNodeStatus type', () => {
    it('includes all expected status values', () => {
      const statuses: MappingNodeStatus[] = ['mapped', 'unmapped', 'warning'];

      expect(statuses).toHaveLength(3);
    });
  });

  describe('ParsedSchema type', () => {
    it('contains all required fields', () => {
      const schema: ParsedSchema = {
        nodes: [],
        totalFieldCount: 0,
        format: 'json-schema',
        parseTimeMs: 42,
        inferred: false,
      };

      expect(schema.nodes).toEqual([]);
      expect(schema.totalFieldCount).toBe(0);
      expect(schema.format).toBe('json-schema');
      expect(schema.parseTimeMs).toBe(42);
      expect(schema.inferred).toBe(false);
    });
  });

  describe('SchemaTreeViewProps interface', () => {
    it('type-checks with all required and optional props', () => {
      // This validates the type at compile time
      const props: SchemaTreeViewProps = {
        schema: {
          nodes: [],
          totalFieldCount: 0,
          format: 'json-schema',
          parseTimeMs: 0,
          inferred: false,
        },
        variant: 'target',
        mappingStatus: new Map([['name', 'mapped']]),
        onSelectNode: () => {},
        selectedPath: 'name',
        searchable: true,
        editable: false,
      };

      expect(props.variant).toBe('target');
      expect(props.mappingStatus?.get('name')).toBe('mapped');
      expect(props.searchable).toBe(true);
      expect(props.editable).toBe(false);
    });
  });

  describe('SchemaParseError', () => {
    it('is an instance of Error with format and details', () => {
      const err = new SchemaParseError('test error', 'json-schema', 'some details');

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(SchemaParseError);
      expect(err.name).toBe('SchemaParseError');
      expect(err.message).toBe('test error');
      expect(err.format).toBe('json-schema');
      expect(err.details).toBe('some details');
    });

    it('works without optional details', () => {
      const err = new SchemaParseError('parse failed', 'xsd');

      expect(err.message).toBe('parse failed');
      expect(err.format).toBe('xsd');
      expect(err.details).toBeUndefined();
    });
  });

  describe('Parser stubs', () => {
    it('parseJsonSchema is implemented and returns ParsedSchema', () => {
      const result = parseJsonSchema('{}');
      expect(result.nodes).toEqual([]);
      expect(result.format).toBe('json-schema');
    });

    it('parseJsonSchema throws SchemaParseError for invalid input', () => {
      expect(() => parseJsonSchema('{ invalid')).toThrow(SchemaParseError);
    });

    it('parseXsd is implemented and returns ParsedSchema for valid XSD', () => {
      const xsd = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="test" type="xs:string"/>
</xs:schema>`;
      const result = parseXsd(xsd);
      expect(result.nodes).toHaveLength(1);
      expect(result.format).toBe('xsd');
    });

    it('parseXsd throws SchemaParseError for invalid input', () => {
      expect(() => parseXsd('')).toThrow(SchemaParseError);
    });

    it('parseInferredSchema is implemented and returns ParsedSchema', () => {
      const result = parseInferredSchema('{"name": "test"}', 'json');
      expect(result.nodes).toHaveLength(1);
      expect(result.inferred).toBe(true);
    });

    it('parseInferredSchema accepts both json and xml format args', () => {
      const jsonResult = parseInferredSchema('{"a": 1}', 'json');
      expect(jsonResult.nodes).toHaveLength(1);

      const xmlResult = parseInferredSchema('<root><a>1</a></root>', 'xml');
      expect(xmlResult.nodes).toHaveLength(1);
    });

    it('parseInferredSchema throws SchemaParseError for invalid input', () => {
      expect(() => parseInferredSchema('{ invalid', 'json')).toThrow(SchemaParseError);
    });
  });
});
