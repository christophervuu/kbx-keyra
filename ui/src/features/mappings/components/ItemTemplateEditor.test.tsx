import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ItemTemplateEditor } from './ItemTemplateEditor';
import type { ItemTemplateState } from '../lib/array-builder-state';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

function createSourceSchema(): ParsedSchema {
  return {
    nodes: [
      {
        path: 'lineItems.sku',
        fieldName: 'sku',
        type: 'string',
        depth: 1,
        isArray: false,
        isRequired: false,
        parentPath: 'lineItems',
        childCount: 0,
        children: [],
      },
    ],
    totalFieldCount: 1,
    format: 'json-schema',
    parseTimeMs: 1,
    inferred: false,
  };
}

function createTargetArrayNode(): SchemaTreeNode {
  return {
    path: 'lineItems',
    fieldName: 'lineItems',
    type: 'array',
    depth: 0,
    isArray: true,
    isRequired: false,
    parentPath: null,
    childCount: 1,
    children: [
      {
        path: 'lineItems.sku',
        fieldName: 'sku',
        type: 'string',
        depth: 1,
        isArray: false,
        isRequired: false,
        parentPath: 'lineItems',
        childCount: 0,
        children: [],
      },
    ],
  };
}

describe('ItemTemplateEditor hydration fallback', () => {
  it('maps item fields when item template uses leaf-key targetFieldPath', () => {
    const itemTemplate: ItemTemplateState = {
      fields: [
        {
          kind: 'chain',
          targetFieldPath: 'sku',
          chainState: {
            source: { kind: 'field', path: '__item__:sku' },
            steps: [],
          },
        },
      ],
      nestedArrays: new Map(),
    };

    render(
      <ItemTemplateEditor
        itemTemplate={itemTemplate}
        targetArrayNode={createTargetArrayNode()}
        parsedSourceSchema={createSourceSchema()}
        sourceArrayPath="lineItems"
        onFieldMappingChange={vi.fn()}
      />, 
    );

    expect(screen.getByTestId('item-template-mapped-count')).toHaveTextContent('1 / 1 mapped');
  });
});
