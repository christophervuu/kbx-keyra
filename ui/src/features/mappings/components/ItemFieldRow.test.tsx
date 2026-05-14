import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ItemFieldRow } from './ItemFieldRow';
import type { ItemFieldMapping } from '../lib/array-builder-state';

import type { ParsedSchema } from '@/lib/types/domain';

function createParsedSourceSchema(): ParsedSchema {
  return {
    nodes: [
      {
        path: 'orderId',
        fieldName: 'orderId',
        type: 'string',
        depth: 0,
        isArray: false,
        isRequired: false,
        parentPath: null,
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

function renderRow(overrides: Partial<ComponentProps<typeof ItemFieldRow>> = {}) {
  const onMappingChange = vi.fn();
  const onToggleExpand = vi.fn();

  render(
    <ItemFieldRow
      fieldName="hasDiscount"
      fieldPath="hasDiscount"
      fieldType="boolean"
      isRequired={false}
      isExpanded={true}
      mapping={{ kind: 'empty', targetFieldPath: 'hasDiscount' }}
      parsedSourceSchema={createParsedSourceSchema()}
      itemFieldPaths={['discountAmount']}
      onToggleExpand={onToggleExpand}
      onMappingChange={onMappingChange}
      {...overrides}
    />,
  );

  return { onMappingChange, onToggleExpand };
}

function lastMappingCall(mock: ReturnType<typeof vi.fn>): ItemFieldMapping {
  const calls = mock.mock.calls;
  return calls[calls.length - 1][1] as ItemFieldMapping;
}

describe('ItemFieldRow', () => {
  it('hides source dropdown by default and shows it on search focus', async () => {
    const user = userEvent.setup();
    renderRow();

    expect(screen.queryByTestId('field-listbox-hasDiscount')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('field-search-hasDiscount'));

    expect(screen.getByTestId('field-listbox-hasDiscount')).toBeInTheDocument();
  });

  it('does not render collapsed item-row summary text when row is collapsed', () => {
    renderRow({
      isExpanded: false,
      mapping: {
        kind: 'chain',
        targetFieldPath: 'hasDiscount',
        chainState: {
          source: { kind: 'field', path: '__item__:discountAmount' },
          steps: [],
        },
      },
    });

    expect(screen.queryByTestId('item-field-summary-hasDiscount')).not.toBeInTheDocument();
  });

  it('shows item badge for item-scoped source options and does not show root label', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByTestId('field-search-hasDiscount'));

    expect(screen.getByText('item')).toBeInTheDocument();
    expect(screen.queryByText(/root/i)).not.toBeInTheDocument();
  });

  it('maps item-scoped source options using item scope prefix', async () => {
    const user = userEvent.setup();
    const { onMappingChange } = renderRow();

    await user.click(screen.getByTestId('field-search-hasDiscount'));
    await user.click(screen.getByTestId('field-option-hasDiscount-item-discountAmount'));

    expect(screen.getByTestId('field-search-hasDiscount')).toHaveValue('discountAmount');

    expect(lastMappingCall(onMappingChange)).toEqual({
      kind: 'chain',
      targetFieldPath: 'hasDiscount',
      chainState: {
        source: { kind: 'field', path: '__item__:discountAmount' },
        steps: [],
      },
    });
  });

  it('hydrates source field input from an existing mapped source chain', () => {
    renderRow({
      mapping: {
        kind: 'chain',
        targetFieldPath: 'hasDiscount',
        chainState: {
          source: { kind: 'field', path: '__item__:discountAmount' },
          steps: [],
        },
      },
    });

    expect(screen.getByTestId('field-search-hasDiscount')).toHaveValue('discountAmount');
  });

  it('opens transform function picker and maps selected function expression', async () => {
    const user = userEvent.setup();
    const { onMappingChange } = renderRow();

    await user.click(screen.getByTestId('field-search-hasDiscount'));
    await user.click(screen.getByTestId('field-option-hasDiscount-item-discountAmount'));
    await user.click(screen.getByTestId('item-field-add-logic-hasDiscount'));
    await user.click(screen.getByTestId('add-logic-option-transform'));

    expect(screen.getByTestId('transform-step-picker-0')).toBeInTheDocument();

    await user.click(screen.getByTestId('transform-fn-upper'));

    expect(lastMappingCall(onMappingChange)).toEqual({
      kind: 'expression',
      targetFieldPath: 'hasDiscount',
      dsl: 'upper(item("discountAmount"))',
    });
  });

  it('shows parent-scope options in nested context', async () => {
    const user = userEvent.setup();
    renderRow({
      hasParentScope: true,
      parentFieldPaths: ['name'],
    });

    await user.click(screen.getByTestId('field-search-hasDiscount'));

    expect(screen.getByTestId('field-option-hasDiscount-parent-name')).toBeInTheDocument();
    expect(screen.getByText('parent')).toBeInTheDocument();
  });

  it('maps parent-scope source options using parent scope prefix', async () => {
    const user = userEvent.setup();
    const { onMappingChange } = renderRow({
      hasParentScope: true,
      parentFieldPaths: ['name'],
    });

    await user.click(screen.getByTestId('field-search-hasDiscount'));
    await user.click(screen.getByTestId('field-option-hasDiscount-parent-name'));

    expect(lastMappingCall(onMappingChange)).toEqual({
      kind: 'chain',
      targetFieldPath: 'hasDiscount',
      chainState: {
        source: { kind: 'field', path: '__parent__:name' },
        steps: [],
      },
    });
  });
});
