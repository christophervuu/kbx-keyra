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
    expect(screen.getByTestId('smart-input-tray-count')).toHaveTextContent('0 selected');
  });

  it('renders source-kind badges for primary and enrichment inputs', () => {
    render(
      <InputTray
        inputs={[
          makeInput({ id: 'input-1', sourceKind: 'primary', label: 'firstName', path: 'firstName' }),
          makeInput({
            id: 'input-2',
            sourceKind: 'enrichment',
            label: 'carrier.rateCode',
            path: 'rateCode',
            externalName: 'carrier',
          }),
        ]}
      />,
    );

    expect(screen.getByTestId('smart-input-tray-item-input-1')).toHaveTextContent('SRC');
    expect(screen.getByTestId('smart-input-tray-item-input-2')).toHaveTextContent('ENR');
    expect(screen.getByTestId('smart-input-tray-item-input-2')).toHaveTextContent('carrier.rateCode');
  });

  it('renders summary metadata for constant/static/expression input kinds', () => {
    render(
      <InputTray
        inputs={[
          makeInput({
            id: 'constant-1',
            sourceKind: 'constant',
            label: 'Tax rate',
            constantName: 'TAX_RATE',
            path: undefined,
          }),
          makeInput({
            id: 'static-1',
            sourceKind: 'static',
            label: 'Fixed',
            staticValue: true,
            path: undefined,
          }),
          makeInput({
            id: 'expr-1',
            sourceKind: 'expression',
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
