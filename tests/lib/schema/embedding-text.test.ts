import { describe, expect, it } from 'vitest';

import { generateEmbeddingText, type SchemaNode } from '../../../src/lib/schema/index.js';

function buildNode(overrides: Partial<SchemaNode> = {}): SchemaNode {
  return {
    schemaId: 'schema-1',
    path: 'Order.Header.DocumentType',
    fieldName: 'DocumentType',
    type: 'string',
    description: 'The type of business document',
    depth: 2,
    isArray: false,
    isRequired: true,
    parentPath: 'Order.Header',
    childCount: 0,
    subtreeFieldCount: 1,
    embeddingText: '',
    ...overrides,
  };
}

describe('lib/schema generateEmbeddingText', () => {
  it('formats embedding text with description when present (AE-11)', () => {
    const node = buildNode();

    expect(generateEmbeddingText(node)).toBe(
      'Order.Header.DocumentType | DocumentType (string) | The type of business document',
    );
  });

  it('omits description segment when description is absent (AE-12)', () => {
    const node = buildNode({
      path: 'Invoice.LineItems.Quantity',
      fieldName: 'Quantity',
      type: 'number',
      description: undefined,
    });

    expect(generateEmbeddingText(node)).toBe('Invoice.LineItems.Quantity | Quantity (number)');
  });

  it('treats empty string description as no description', () => {
    const node = buildNode({
      description: '   ',
    });

    expect(generateEmbeddingText(node)).toBe('Order.Header.DocumentType | DocumentType (string)');
  });

  it('preserves special characters in path and fieldName', () => {
    const node = buildNode({
      path: 'Order.$meta.line-items[0].sku-code',
      fieldName: 'sku-code',
      type: 'string',
      description: undefined,
    });

    expect(generateEmbeddingText(node)).toBe('Order.$meta.line-items[0].sku-code | sku-code (string)');
  });
});
