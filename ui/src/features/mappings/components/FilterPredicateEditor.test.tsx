import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FilterPredicateEditor } from './FilterPredicateEditor';
import type { FilterPredicateState } from '../lib/array-builder-state';

import type { ParsedSchema } from '@/lib/types/domain';

function createParsedSourceSchema(): ParsedSchema {
  return {
    nodes: [
      {
        path: 'items',
        fieldName: 'items',
        type: 'array',
        depth: 0,
        isArray: true,
        isRequired: false,
        parentPath: null,
        childCount: 2,
        children: [
          {
            path: 'items.sku',
            fieldName: 'sku',
            type: 'string',
            depth: 1,
            isArray: false,
            isRequired: false,
            parentPath: 'items',
            childCount: 0,
            children: [],
          },
          {
            path: 'items.qty',
            fieldName: 'qty',
            type: 'number',
            depth: 1,
            isArray: false,
            isRequired: false,
            parentPath: 'items',
            childCount: 0,
            children: [],
          },
        ],
      },
      {
        path: 'meta.status',
        fieldName: 'status',
        type: 'string',
        depth: 0,
        isArray: false,
        isRequired: false,
        parentPath: null,
        childCount: 0,
        children: [],
      },
    ],
    totalFieldCount: 3,
    format: 'json-schema',
    parseTimeMs: 1,
    inferred: false,
  };
}

function createPredicate(): FilterPredicateState {
  return {
    kind: 'structured',
    left: { kind: 'itemField', fieldPath: '' },
    operator: 'eq',
    right: { kind: 'static', value: '' },
  };
}

describe('FilterPredicateEditor', () => {
  it('shows item-field dropdown options derived from selected source array', async () => {
    const user = userEvent.setup();
    const onPredicateChange = vi.fn();

    render(
      <FilterPredicateEditor
        predicate={createPredicate()}
        parsedSourceSchema={createParsedSourceSchema()}
        sourceArrayPath="items"
        onPredicateChange={onPredicateChange}
      />,
    );

    const fieldSelect = screen.getByTestId('filter-left-operand');
    expect(fieldSelect).toHaveTextContent('sku');
    expect(fieldSelect).toHaveTextContent('qty');
    expect(fieldSelect).not.toHaveTextContent('meta.status');

    await user.selectOptions(fieldSelect, 'sku');

    expect(onPredicateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        left: { kind: 'itemField', fieldPath: 'sku' },
      }),
    );
  });

  it('disables field dropdown when source array is not selected', () => {
    render(
      <FilterPredicateEditor
        predicate={createPredicate()}
        parsedSourceSchema={createParsedSourceSchema()}
        sourceArrayPath=""
        onPredicateChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('filter-left-operand')).toBeDisabled();
  });

  it('shows Source, Static, and External value options with External disabled', () => {
    render(
      <FilterPredicateEditor
        predicate={createPredicate()}
        parsedSourceSchema={createParsedSourceSchema()}
        sourceArrayPath="items"
        onPredicateChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('filter-right-kind-sourceField')).toHaveTextContent('Source');
    expect(screen.getByTestId('filter-right-kind-static')).toHaveTextContent('Static');

    const externalButton = screen.getByTestId('filter-right-kind-external');
    expect(externalButton).toHaveTextContent('External');
    expect(externalButton).toBeDisabled();
  });
});
