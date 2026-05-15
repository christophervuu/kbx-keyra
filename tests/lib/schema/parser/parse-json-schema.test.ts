import { describe, expect, it } from 'vitest';

import { parseJsonSchema } from '../../../../src/lib/schema/index.js';

function buildFlatSchema(fieldCount: number): string {
  const properties: Record<string, unknown> = {};
  for (let index = 1; index <= fieldCount; index += 1) {
    properties[`field${index}`] = { type: 'string' };
  }

  return JSON.stringify({
    type: 'object',
    properties,
  });
}

describe('parseJsonSchema', () => {
  it('parses a simple flat object with depth 0 fields', () => {
    const content = JSON.stringify({
      type: 'object',
      properties: {
        id: { type: 'string' },
        amount: { type: 'number' },
        status: { type: 'string' },
        active: { type: 'boolean' },
        note: { type: 'string' },
      },
      required: ['id', 'amount'],
    });

    const result = parseJsonSchema(content, 'schema-1');

    expect(result.errors).toBeUndefined();
    expect(result.nodes).toHaveLength(5);
    expect(result.fieldCount).toBe(5);
    for (const node of result.nodes) {
      expect(node.depth).toBe(0);
      expect(node.parentPath).toBeUndefined();
      expect(node.childCount).toBe(0);
      expect(node.subtreeFieldCount).toBe(1);
      expect(node.embeddingText.length).toBeGreaterThan(0);
    }

    expect(result.nodes.find((node) => node.path === 'id')?.isRequired).toBe(true);
    expect(result.nodes.find((node) => node.path === 'status')?.isRequired).toBe(false);
  });

  it('parses nested objects with correct depth and parentPath', () => {
    const content = JSON.stringify({
      type: 'object',
      properties: {
        Order: {
          type: 'object',
          required: ['Header'],
          properties: {
            Header: {
              type: 'object',
              properties: {
                DocumentType: { type: 'string' },
              },
            },
          },
        },
      },
    });

    const result = parseJsonSchema(content, 'schema-1');
    const orderNode = result.nodes.find((node) => node.path === 'Order');
    const headerNode = result.nodes.find((node) => node.path === 'Order.Header');
    const docTypeNode = result.nodes.find((node) => node.path === 'Order.Header.DocumentType');

    expect(orderNode).toBeDefined();
    expect(headerNode).toBeDefined();
    expect(docTypeNode).toBeDefined();
    expect(orderNode?.depth).toBe(0);
    expect(headerNode?.depth).toBe(1);
    expect(headerNode?.parentPath).toBe('Order');
    expect(docTypeNode?.depth).toBe(2);
    expect(docTypeNode?.parentPath).toBe('Order.Header');
    expect(orderNode?.childCount).toBe(1);
    expect(orderNode?.subtreeFieldCount).toBe(1);
  });

  it('marks arrays and nests item properties as children', () => {
    const content = JSON.stringify({
      type: 'object',
      properties: {
        lineItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
            },
          },
        },
      },
    });

    const result = parseJsonSchema(content, 'schema-1');
    const arrayNode = result.nodes.find((node) => node.path === 'lineItems');
    const childNode = result.nodes.find((node) => node.path === 'lineItems.sku');

    expect(arrayNode?.isArray).toBe(true);
    expect(arrayNode?.childCount).toBe(1);
    expect(childNode?.parentPath).toBe('lineItems');
    expect(result.fieldCount).toBe(1);
  });

  it('resolves local $ref from $defs and definitions', () => {
    const content = JSON.stringify({
      type: 'object',
      properties: {
        header: {
          $ref: '#/$defs/Header',
        },
        footer: {
          $ref: '#/definitions/Footer',
        },
      },
      $defs: {
        Header: {
          type: 'object',
          properties: {
            docType: { type: 'string' },
          },
        },
      },
      definitions: {
        Footer: {
          type: 'object',
          properties: {
            checksum: { type: 'string' },
          },
        },
      },
    });

    const result = parseJsonSchema(content, 'schema-1');

    expect(result.nodes.find((node) => node.path === 'header.docType')).toBeDefined();
    expect(result.nodes.find((node) => node.path === 'footer.checksum')).toBeDefined();
    expect(result.errors).toBeUndefined();
  });

  it('merges allOf properties shallowly', () => {
    const content = JSON.stringify({
      type: 'object',
      properties: {
        customer: {
          allOf: [
            {
              type: 'object',
              properties: {
                id: { type: 'string' },
              },
              required: ['id'],
            },
            {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
            },
          ],
        },
      },
    });

    const result = parseJsonSchema(content, 'schema-1');
    expect(result.nodes.find((node) => node.path === 'customer.id')).toBeDefined();
    expect(result.nodes.find((node) => node.path === 'customer.name')).toBeDefined();
    expect(result.nodes.find((node) => node.path === 'customer.id')?.isRequired).toBe(true);
  });

  it('includes anyOf and oneOf alternatives as optional children', () => {
    const content = JSON.stringify({
      type: 'object',
      properties: {
        payment: {
          type: 'object',
          anyOf: [
            {
              properties: {
                cardNumber: { type: 'string' },
              },
            },
          ],
          oneOf: [
            {
              properties: {
                bankAccount: { type: 'string' },
              },
            },
          ],
        },
      },
    });

    const result = parseJsonSchema(content, 'schema-1');
    const cardNode = result.nodes.find((node) => node.path === 'payment.cardNumber');
    const bankNode = result.nodes.find((node) => node.path === 'payment.bankAccount');

    expect(cardNode).toBeDefined();
    expect(bankNode).toBeDefined();
    expect(cardNode?.isRequired).toBe(false);
    expect(bankNode?.isRequired).toBe(false);
  });

  it('returns empty parse result for empty schema object (AE-10)', () => {
    const content = JSON.stringify({
      type: 'object',
      properties: {},
    });

    const result = parseJsonSchema(content, 'schema-1');

    expect(result.nodes).toHaveLength(0);
    expect(result.fieldCount).toBe(0);
    expect(result.errors).toBeUndefined();
  });

  it('returns parse error for invalid JSON without throwing (AE-09)', () => {
    const result = parseJsonSchema('{invalid-json', 'schema-1');

    expect(result.nodes).toHaveLength(0);
    expect(result.fieldCount).toBe(0);
    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]).toContain('Invalid JSON');
  });

  it('detects circular local refs and emits warning', () => {
    const content = JSON.stringify({
      type: 'object',
      properties: {
        root: {
          $ref: '#/$defs/Loop',
        },
      },
      $defs: {
        Loop: {
          type: 'object',
          properties: {
            self: {
              $ref: '#/$defs/Loop',
            },
          },
        },
      },
    });

    const result = parseJsonSchema(content, 'schema-1');

    expect(result.nodes.find((node) => node.path === 'root')).toBeDefined();
    expect(result.errors?.some((message) => message.includes('Circular $ref'))).toBe(true);
  });

  it('parses 500-field schema with exact node and field counts', () => {
    const result = parseJsonSchema(buildFlatSchema(500), 'schema-500');

    expect(result.errors).toBeUndefined();
    expect(result.nodes).toHaveLength(500);
    expect(result.fieldCount).toBe(500);
    expect(result.nodes.at(0)?.path).toBe('field1');
    expect(result.nodes.at(-1)?.path).toBe('field500');
  });

  it('parses 23,000-field schema in under 10 seconds (in-memory)', () => {
    const startMs = Date.now();
    const result = parseJsonSchema(buildFlatSchema(23_000), 'schema-23000');
    const elapsedMs = Date.now() - startMs;

    expect(result.errors).toBeUndefined();
    expect(result.nodes).toHaveLength(23_000);
    expect(result.fieldCount).toBe(23_000);
    expect(elapsedMs).toBeLessThan(10_000);
  });
});
