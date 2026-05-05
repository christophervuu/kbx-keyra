/**
 * ConditionRowEditor tests — T-03
 *
 * Covers:
 *  - Renders Field / Value kind buttons on left operand
 *  - "Transform…" button present on left operand (T-03)
 *  - "Transform…" button NOT present on right operand
 *  - Clicking "Transform…" calls onChange with kind=pipeline on left operand
 *  - InlinePipelineBuilder renders when left operand kind=pipeline
 *  - Right operand hidden for unary operators (isNull, isNotNull)
 *  - Remove button fires onRemove with correct aria-label
 *  - Operator change fires onChange with updated comparison
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConditionRowEditor } from './ConditionRowEditor';
import type { ConditionRow } from '../lib/expression-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SCHEMA: ParsedSchema = {
  format: 'json-schema',
  totalFieldCount: 2,
  parseTimeMs: 1,
  inferred: false,
  nodes: [
    { path: 'name', fieldName: 'name', type: 'string', depth: 0, isArray: false, isRequired: true, parentPath: null, childCount: 0, children: [] },
    { path: 'amount', fieldName: 'amount', type: 'number', depth: 0, isArray: false, isRequired: false, parentPath: null, childCount: 0, children: [] },
  ],
};

function makeRow(overrides?: Partial<ConditionRow>): ConditionRow {
  return {
    leftOperand: { kind: 'source', value: 'name' },
    comparison: 'eq',
    rightOperand: { kind: 'static', value: 'Alice' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConditionRowEditor', () => {
  it('renders Field, Value, and Transform… buttons on left operand', () => {
    render(
      <ConditionRowEditor
        condition={makeRow()}
        onChange={vi.fn()}
        parsedSourceSchema={MOCK_SCHEMA}
        rowIndex={0}
      />,
    );

    expect(screen.getByTestId('condition-left-0-kind-source')).toBeInTheDocument();
    expect(screen.getByTestId('condition-left-0-kind-static')).toBeInTheDocument();
    expect(screen.getByTestId('condition-left-0-kind-pipeline')).toBeInTheDocument();
  });

  it('does NOT render Transform… button on right operand', () => {
    render(
      <ConditionRowEditor
        condition={makeRow()}
        onChange={vi.fn()}
        parsedSourceSchema={MOCK_SCHEMA}
        rowIndex={0}
      />,
    );

    expect(screen.queryByTestId('condition-right-0-kind-pipeline')).not.toBeInTheDocument();
  });

  it('clicking Transform… on left operand calls onChange with kind=pipeline', async () => {
    const onChange = vi.fn();
    render(
      <ConditionRowEditor
        condition={makeRow()}
        onChange={onChange}
        parsedSourceSchema={MOCK_SCHEMA}
        rowIndex={0}
      />,
    );

    await userEvent.click(screen.getByTestId('condition-left-0-kind-pipeline'));

    expect(onChange).toHaveBeenCalledOnce();
    const updated = onChange.mock.calls[0][0] as ConditionRow;
    expect(updated.leftOperand.kind).toBe('pipeline');
  });

  it('renders InlinePipelineBuilder when left operand kind=pipeline', () => {
    const row = makeRow({
      leftOperand: {
        kind: 'pipeline',
        value: '',
        pipelineState: {
          mode: 'value',
          sources: [{ path: 'name' }],
          transforms: [{ functionName: 'length', parameters: [] }],
        },
      },
    });

    render(
      <ConditionRowEditor
        condition={row}
        onChange={vi.fn()}
        parsedSourceSchema={MOCK_SCHEMA}
        rowIndex={0}
      />,
    );

    expect(screen.getByTestId('condition-left-0-pipeline')).toBeInTheDocument();
  });

  it('hides right operand for isNull operator', () => {
    render(
      <ConditionRowEditor
        condition={makeRow({ comparison: 'isNull' })}
        onChange={vi.fn()}
        parsedSourceSchema={MOCK_SCHEMA}
        rowIndex={0}
      />,
    );

    expect(screen.queryByTestId('condition-right-0')).not.toBeInTheDocument();
  });

  it('hides right operand for isNotNull operator', () => {
    render(
      <ConditionRowEditor
        condition={makeRow({ comparison: 'isNotNull' })}
        onChange={vi.fn()}
        parsedSourceSchema={MOCK_SCHEMA}
        rowIndex={0}
      />,
    );

    expect(screen.queryByTestId('condition-right-0')).not.toBeInTheDocument();
  });

  it('shows right operand for binary operators', () => {
    render(
      <ConditionRowEditor
        condition={makeRow({ comparison: 'eq' })}
        onChange={vi.fn()}
        parsedSourceSchema={MOCK_SCHEMA}
        rowIndex={0}
      />,
    );

    expect(screen.getByTestId('condition-right-0')).toBeInTheDocument();
  });

  it('changing operator calls onChange with updated comparison', async () => {
    const onChange = vi.fn();
    render(
      <ConditionRowEditor
        condition={makeRow()}
        onChange={onChange}
        parsedSourceSchema={MOCK_SCHEMA}
        rowIndex={0}
      />,
    );

    await userEvent.selectOptions(screen.getByTestId('condition-operator-0'), 'gt');

    expect(onChange).toHaveBeenCalledOnce();
    const updated = onChange.mock.calls[0][0] as ConditionRow;
    expect(updated.comparison).toBe('gt');
  });

  it('remove button fires onRemove with correct aria-label', async () => {
    const onRemove = vi.fn();
    render(
      <ConditionRowEditor
        condition={makeRow()}
        onChange={vi.fn()}
        onRemove={onRemove}
        parsedSourceSchema={MOCK_SCHEMA}
        rowIndex={2}
      />,
    );

    const removeBtn = screen.getByRole('button', { name: 'Remove condition 3' });
    await userEvent.click(removeBtn);

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('remove button not rendered when onRemove is not provided', () => {
    render(
      <ConditionRowEditor
        condition={makeRow()}
        onChange={vi.fn()}
        parsedSourceSchema={MOCK_SCHEMA}
        rowIndex={0}
      />,
    );

    expect(screen.queryByTestId('condition-row-remove-0')).not.toBeInTheDocument();
  });

  it('all kind buttons are keyboard accessible (have type=button)', () => {
    render(
      <ConditionRowEditor
        condition={makeRow()}
        onChange={vi.fn()}
        parsedSourceSchema={MOCK_SCHEMA}
        rowIndex={0}
      />,
    );

    const pipelineBtn = screen.getByTestId('condition-left-0-kind-pipeline');
    expect(pipelineBtn).toHaveAttribute('type', 'button');
  });
});
