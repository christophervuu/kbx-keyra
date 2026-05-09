import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ArrayMappingBuilder } from './ArrayMappingBuilder';
import { useArrayBuilder } from '../hooks/use-array-builder';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNode(
  path: string,
  fieldName: string,
  type: SchemaTreeNode['type'],
  parentPath: string | null = null,
  depth = 0,
): SchemaTreeNode {
  return {
    path,
    fieldName,
    type,
    depth,
    isArray: type === 'array',
    isRequired: false,
    parentPath,
    childCount: 0,
    children: [],
  };
}

const SOURCE_SCHEMA: ParsedSchema = {
  nodes: [
    makeNode('order.items', 'items', 'array'),
    makeNode('order.items.sku', 'sku', 'string', 'order.items', 1),
    makeNode('order.items.qty', 'qty', 'number', 'order.items', 1),
    makeNode('order.tags', 'tags', 'array'),
  ],
  totalFieldCount: 4,
  format: 'json-schema',
  parseTimeMs: 0,
  inferred: false,
};

const TARGET_SCHEMA: ParsedSchema = {
  nodes: [
    makeNode('lineItems', 'lineItems', 'array'),
    makeNode('lineItems.productCode', 'productCode', 'string', 'lineItems', 1),
    makeNode('lineItems.quantity', 'quantity', 'number', 'lineItems', 1),
  ],
  totalFieldCount: 3,
  format: 'json-schema',
  parseTimeMs: 0,
  inferred: false,
};

const TARGET_SCHEMA_ARRAY_OF_OBJECTS: ParsedSchema = {
  nodes: [
    makeNode('lineItems', 'lineItems', 'array'),
    makeNode('lineItems.item', 'item', 'object', 'lineItems', 1),
    makeNode('lineItems.item.productCode', 'productCode', 'string', 'lineItems.item', 2),
    makeNode('lineItems.item.quantity', 'quantity', 'number', 'lineItems.item', 2),
  ],
  totalFieldCount: 4,
  format: 'json-schema',
  parseTimeMs: 0,
  inferred: false,
};

const SOURCE_SCHEMA_HIERARCHICAL: ParsedSchema = {
  nodes: [
    {
      ...makeNode('order', 'order', 'object'),
      children: [
        {
          ...makeNode('order.items', 'items', 'array', 'order', 1),
          children: [
            makeNode('order.items.sku', 'sku', 'string', 'order.items', 2),
            makeNode('order.items.qty', 'qty', 'number', 'order.items', 2),
          ],
          childCount: 2,
        },
      ],
      childCount: 1,
    },
  ],
  totalFieldCount: 4,
  format: 'json-schema',
  parseTimeMs: 0,
  inferred: false,
};

const TARGET_SCHEMA_HIERARCHICAL: ParsedSchema = {
  nodes: [
    {
      ...makeNode('invoice', 'invoice', 'object'),
      children: [
        {
          ...makeNode('invoice.lineItems', 'lineItems', 'array', 'invoice', 1),
          children: [
            makeNode('invoice.lineItems.productCode', 'productCode', 'string', 'invoice.lineItems', 2),
            makeNode('invoice.lineItems.quantity', 'quantity', 'number', 'invoice.lineItems', 2),
          ],
          childCount: 2,
        },
      ],
      childCount: 1,
    },
  ],
  totalFieldCount: 4,
  format: 'json-schema',
  parseTimeMs: 0,
  inferred: false,
};

const DEFAULT_PROPS = {
  targetArrayPath: 'lineItems',
  parsedSourceSchema: SOURCE_SCHEMA,
  parsedTargetSchema: TARGET_SCHEMA,
  onSave: vi.fn(),
};

// ---------------------------------------------------------------------------
// useArrayBuilder tests
// ---------------------------------------------------------------------------

describe('useArrayBuilder', () => {
  it('starts at step 1', () => {
    const { result } = renderHook(() => useArrayBuilder());
    expect(result.current.currentStep).toBe(1);
  });

  it('canGoNext is false when sourceArrayPath is empty', () => {
    const { result } = renderHook(() => useArrayBuilder());
    expect(result.current.canGoNext).toBe(false);
  });

  it('canGoNext is true after setting sourceArrayPath', () => {
    const { result } = renderHook(() => useArrayBuilder());
    act(() => result.current.setSourceArrayPath('order.items'));
    expect(result.current.canGoNext).toBe(true);
  });

  it('goNext advances to step 2', () => {
    const { result } = renderHook(() => useArrayBuilder());
    act(() => result.current.setSourceArrayPath('order.items'));
    act(() => result.current.goNext());
    expect(result.current.currentStep).toBe(2);
  });

  it('goBack from step 2 returns to step 1', () => {
    const { result } = renderHook(() => useArrayBuilder());
    act(() => result.current.setSourceArrayPath('order.items'));
    act(() => result.current.goNext());
    act(() => result.current.goBack());
    expect(result.current.currentStep).toBe(1);
  });

  it('advanced pattern skips step 3 and goes to step 4', () => {
    const { result } = renderHook(() => useArrayBuilder());
    act(() => result.current.setSourceArrayPath('order.items'));
    act(() => result.current.goNext()); // → step 2
    act(() => result.current.setPattern('advanced'));
    act(() => result.current.goNext()); // → step 4 (skip 3)
    expect(result.current.currentStep).toBe(4);
  });

  it('addFieldMapping adds a mapping', () => {
    const { result } = renderHook(() => useArrayBuilder());
    act(() => result.current.addFieldMapping({ targetField: 'productCode', sourceField: 'sku' }));
    expect(result.current.state.fieldMappings).toHaveLength(1);
  });

  it('removeFieldMapping removes a mapping by index', () => {
    const { result } = renderHook(() => useArrayBuilder());
    act(() => result.current.addFieldMapping({ targetField: 'productCode', sourceField: 'sku' }));
    act(() => result.current.addFieldMapping({ targetField: 'quantity', sourceField: 'qty' }));
    act(() => result.current.removeFieldMapping(0));
    expect(result.current.state.fieldMappings).toHaveLength(1);
    expect(result.current.state.fieldMappings[0].targetField).toBe('quantity');
  });

  it('generatedExpression updates when state changes', () => {
    const { result } = renderHook(() => useArrayBuilder());
    act(() => result.current.setSourceArrayPath('order.items'));
    act(() => result.current.addFieldMapping({ targetField: 'productCode', sourceField: 'sku' }));
    expect(result.current.generatedExpression).toContain('map(source("order.items")');
    expect(result.current.generatedExpression).toContain('item("sku")');
  });
});

// ---------------------------------------------------------------------------
// ArrayMappingBuilder component tests
// ---------------------------------------------------------------------------

describe('ArrayMappingBuilder', () => {
  it('renders step 1 by default', () => {
    render(<ArrayMappingBuilder {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('step-1-source')).toBeInTheDocument();
  });

  it('Step 1 renders source arrays', () => {
    render(<ArrayMappingBuilder {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('source-array-order.items')).toBeInTheDocument();
    expect(screen.getByTestId('source-array-order.tags')).toBeInTheDocument();
  });

  it('Next button is disabled before selecting a source array', () => {
    render(<ArrayMappingBuilder {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('btn-next')).toBeDisabled();
  });

  it('Next button is enabled after selecting a source array', () => {
    render(<ArrayMappingBuilder {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('source-array-order.items'));
    expect(screen.getByTestId('btn-next')).not.toBeDisabled();
  });

  it('clicking Next advances to Step 2', () => {
    render(<ArrayMappingBuilder {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('source-array-order.items'));
    fireEvent.click(screen.getByTestId('btn-next'));
    expect(screen.getByTestId('step-2-pattern')).toBeInTheDocument();
  });

  it('Step 2 renders all pattern options', () => {
    render(<ArrayMappingBuilder {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('source-array-order.items'));
    fireEvent.click(screen.getByTestId('btn-next'));
    expect(screen.getByTestId('pattern-1:1 map')).toBeInTheDocument();
    expect(screen.getByTestId('pattern-filter-then-map')).toBeInTheDocument();
    expect(screen.getByTestId('pattern-advanced')).toBeInTheDocument();
  });

  it('selecting Advanced pattern and clicking Next goes to step 4 (raw editor)', () => {
    render(<ArrayMappingBuilder {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('source-array-order.items'));
    fireEvent.click(screen.getByTestId('btn-next'));
    fireEvent.click(screen.getByTestId('pattern-advanced'));
    fireEvent.click(screen.getByTestId('btn-next'));
    expect(screen.getByTestId('advanced-raw-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('step-3-fields')).not.toBeInTheDocument();
  });

  it('Step 3 renders source and target field lists', () => {
    render(<ArrayMappingBuilder {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('source-array-order.items'));
    fireEvent.click(screen.getByTestId('btn-next'));
    fireEvent.click(screen.getByTestId('btn-next')); // step 3
    expect(screen.getByTestId('step-3-fields')).toBeInTheDocument();
    expect(screen.getByTestId('source-fields-list')).toBeInTheDocument();
    expect(screen.getByTestId('target-fields-list')).toBeInTheDocument();
  });

  it('Step 3 scopes source fields to selected source array item fields', () => {
    render(<ArrayMappingBuilder {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('source-array-order.items'));
    fireEvent.click(screen.getByTestId('btn-next'));
    fireEvent.click(screen.getByTestId('btn-next')); // step 3

    expect(screen.getByTestId('source-field-order.items.sku')).toBeInTheDocument();
    expect(screen.getByTestId('source-field-order.items.qty')).toBeInTheDocument();
    expect(screen.queryByTestId('source-field-order.tags')).not.toBeInTheDocument();
  });

  it('Step 3 resolves target fields for array-of-object target schema', () => {
    render(
      <ArrayMappingBuilder
        {...DEFAULT_PROPS}
        parsedTargetSchema={TARGET_SCHEMA_ARRAY_OF_OBJECTS}
      />,
    );
    fireEvent.click(screen.getByTestId('source-array-order.items'));
    fireEvent.click(screen.getByTestId('btn-next'));
    fireEvent.click(screen.getByTestId('btn-next')); // step 3

    expect(screen.getByTestId('target-field-lineItems.item.productCode')).toBeInTheDocument();
    expect(screen.getByTestId('target-field-lineItems.item.quantity')).toBeInTheDocument();
    expect(screen.queryByText('No target item fields found')).not.toBeInTheDocument();
  });

  it('Step 3 resolves source and target item fields from hierarchical schema nodes', () => {
    render(
      <ArrayMappingBuilder
        {...DEFAULT_PROPS}
        targetArrayPath="invoice.lineItems"
        parsedSourceSchema={SOURCE_SCHEMA_HIERARCHICAL}
        parsedTargetSchema={TARGET_SCHEMA_HIERARCHICAL}
      />,
    );
    fireEvent.click(screen.getByTestId('source-array-order.items'));
    fireEvent.click(screen.getByTestId('btn-next'));
    fireEvent.click(screen.getByTestId('btn-next')); // step 3

    expect(screen.getByTestId('source-field-order.items.sku')).toBeInTheDocument();
    expect(screen.getByTestId('source-field-order.items.qty')).toBeInTheDocument();
    expect(screen.getByTestId('target-field-invoice.lineItems.productCode')).toBeInTheDocument();
    expect(screen.getByTestId('target-field-invoice.lineItems.quantity')).toBeInTheDocument();
    expect(screen.queryByText('No source fields available')).not.toBeInTheDocument();
    expect(screen.queryByText('No target item fields found')).not.toBeInTheDocument();
  });

  it('Step 4 displays generated expression', () => {
    render(<ArrayMappingBuilder {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('source-array-order.items'));
    fireEvent.click(screen.getByTestId('btn-next'));
    fireEvent.click(screen.getByTestId('btn-next')); // step 3
    fireEvent.click(screen.getByTestId('btn-next')); // step 4
    expect(screen.getByTestId('step-4-preview')).toBeInTheDocument();
    expect(screen.getByTestId('generated-expression')).toBeInTheDocument();
  });

  it('Save button fires onSave with target path and expression', () => {
    const onSave = vi.fn();
    render(<ArrayMappingBuilder {...DEFAULT_PROPS} onSave={onSave} />);
    fireEvent.click(screen.getByTestId('source-array-order.items'));
    fireEvent.click(screen.getByTestId('btn-next'));
    fireEvent.click(screen.getByTestId('btn-next')); // step 3
    fireEvent.click(screen.getByTestId('btn-next')); // step 4
    fireEvent.click(screen.getByTestId('btn-save'));
    expect(onSave).toHaveBeenCalledWith('lineItems', expect.stringContaining('map(source("order.items")'));
  });

  it('Back button navigates to previous step', () => {
    render(<ArrayMappingBuilder {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('source-array-order.items'));
    fireEvent.click(screen.getByTestId('btn-next'));
    expect(screen.getByTestId('step-2-pattern')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('btn-back'));
    expect(screen.getByTestId('step-1-source')).toBeInTheDocument();
  });

  it('Back button is disabled on step 1', () => {
    render(<ArrayMappingBuilder {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('btn-back')).toBeDisabled();
  });

  it('shows nested array banner when isNestedArray=true', () => {
    render(
      <ArrayMappingBuilder
        {...DEFAULT_PROPS}
        isNestedArray={true}
        parentArrayPath="order.items"
      />,
    );
    expect(screen.getByTestId('nested-array-banner')).toBeInTheDocument();
    expect(screen.getByTestId('nested-array-banner')).toHaveTextContent('order.items');
  });

  it('nested array banner link fires onSelectParentArray', () => {
    const onSelectParentArray = vi.fn();
    render(
      <ArrayMappingBuilder
        {...DEFAULT_PROPS}
        isNestedArray={true}
        parentArrayPath="order.items"
        onSelectParentArray={onSelectParentArray}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-array-link'));
    expect(onSelectParentArray).toHaveBeenCalledWith('order.items');
  });

  it('does not show nested array banner when isNestedArray=false', () => {
    render(<ArrayMappingBuilder {...DEFAULT_PROPS} isNestedArray={false} />);
    expect(screen.queryByTestId('nested-array-banner')).not.toBeInTheDocument();
  });
});
