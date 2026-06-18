import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InputTray } from './InputTray';
import type { BuilderInput } from '../lib/smart-builder-state';

function makeInput(overrides: Partial<BuilderInput> = {}): BuilderInput {
  return {
    id: overrides.id ?? 'input-1',
    sourceKind: overrides.sourceKind ?? 'primary',
    label: overrides.label ?? 'firstName',
    path: overrides.path ?? 'firstName',
    valueType: overrides.valueType ?? 'string',
    transforms: overrides.transforms ?? [],
    ...overrides,
  };
}

describe('InputTray', () => {
  it('renders empty state guidance when tray has no inputs', () => {
    render(<InputTray inputs={[]} />);

    expect(screen.getByTestId('smart-input-tray-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('smart-input-tray-count')).not.toBeInTheDocument();
  });

  it('renders Add Input in tray header and toggles via callback', () => {
    const onToggleAddInput = vi.fn();
    render(<InputTray inputs={[]} onToggleAddInput={onToggleAddInput} />);

    const button = screen.getByTestId('smart-add-input-toggle');
    expect(button).toHaveTextContent('Add Input');
    fireEvent.click(button);
    expect(onToggleAddInput).toHaveBeenCalledTimes(1);
  });

  it('renders 3-letter type badge on left and source-kind badge on right', () => {
    render(
      <InputTray
        inputs={[
          makeInput({ id: 'input-1', sourceKind: 'primary', valueType: 'string', label: 'firstName', path: 'firstName' }),
          makeInput({
            id: 'input-2',
            sourceKind: 'enrichment',
            valueType: 'number',
            label: 'carrier.rateCode',
            path: 'rateCode',
            externalName: 'carrier',
          }),
        ]}
      />,
    );

    expect(screen.getByTestId('smart-input-tray-type-input-1')).toHaveTextContent('STR');
    expect(screen.getByTestId('smart-input-tray-type-input-2')).toHaveTextContent('NUM');
    expect(screen.getByTestId('smart-input-tray-source-kind-input-1')).toHaveTextContent('SRC');
    expect(screen.getByTestId('smart-input-tray-source-kind-input-2')).toHaveTextContent('ENR');
    expect(screen.getByTestId('smart-input-tray-item-input-2')).toHaveTextContent('carrier.rateCode');
  });
  it('renders summary metadata for constant/static/expression input kinds', () => {
    render(
      <InputTray
        inputs={[
          makeInput({
            id: 'constant-1',
            sourceKind: 'constant',
            valueType: 'number',
            label: 'Tax rate',
            constantName: 'TAX_RATE',
            path: undefined,
          }),
          makeInput({
            id: 'static-1',
            sourceKind: 'static',
            valueType: 'boolean',
            label: 'Fixed',
            staticValue: true,
            path: undefined,
          }),
          makeInput({
            id: 'expr-1',
            sourceKind: 'expression',
            valueType: 'unknown',
            label: 'Expression input',
            rawExpression: 'source("x")',
            path: undefined,
          }),
        ]}
      />,
    );

    expect(screen.getByTestId('smart-input-tray-item-constant-1')).toHaveTextContent('TAX_RATE');
    expect(screen.getByTestId('smart-input-tray-item-static-1')).toHaveTextContent('true');
    expect(screen.getByTestId('smart-input-tray-item-expr-1')).toHaveTextContent('source("x")');
  });

  it('renders remove button and calls onRemoveInput when clicked', () => {
    const onRemoveInput = vi.fn();
    render(
      <InputTray
        inputs={[makeInput({ id: 'input-1', sourceKind: 'primary', label: 'firstName', path: 'firstName' })]}
        onRemoveInput={onRemoveInput}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-input-tray-remove-input-1'));
    expect(onRemoveInput).toHaveBeenCalledWith('input-1');
  });
});
