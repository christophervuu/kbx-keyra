import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InputTray } from './InputTray';
import type { BuilderInput, BuilderInputUsage } from '../lib/smart-builder-state';

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
    expect(screen.getByTestId('smart-input-tray-count')).toHaveTextContent('Inputs 0');
  });

  it('renders Add Input in tray header and toggles via callback', () => {
    const onToggleAddInput = vi.fn();
    render(<InputTray inputs={[]} onToggleAddInput={onToggleAddInput} />);

    const button = screen.getByTestId('smart-add-input-toggle');
    expect(button).toHaveTextContent('Add Input');
    fireEvent.click(button);
    expect(onToggleAddInput).toHaveBeenCalledTimes(1);
  });

  it('renders grouped rows and path/type metadata', () => {
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
    expect(screen.getByTestId('smart-input-tray-group-primary')).toHaveTextContent('Primary source');
    expect(screen.getByTestId('smart-input-tray-group-enrichment:carrier')).toHaveTextContent('Enrichment input: carrier');
    expect(screen.getByTestId('smart-input-tray-path-input-2')).toHaveTextContent('carrier.rateCode');
    expect(screen.getByTestId('smart-input-tray-sample-input-1')).toHaveTextContent('No sample');
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

    expect(screen.getByTestId('smart-input-tray-group-builder-values')).toHaveTextContent('Builder values');
    expect(screen.getByTestId('smart-input-tray-path-constant-1')).toHaveTextContent('TAX_RATE');
    expect(screen.getByTestId('smart-input-tray-path-static-1')).toHaveTextContent('true');
    expect(screen.getByTestId('smart-input-tray-path-expr-1')).toHaveTextContent('source("x")');
  });

  it('renders usage metadata and multi-usage disclosure', () => {
    const usages: BuilderInputUsage[] = [
      { inputId: 'input-1', location: 'condition-left', clauseIndex: 0, predicateIndex: 0 },
      { inputId: 'input-1', location: 'otherwise' },
      { inputId: 'input-2', location: 'direct' },
    ];

    render(
      <InputTray
        inputs={[
          makeInput({ id: 'input-1', sourceKind: 'primary', label: 'priority', path: 'priority' }),
          makeInput({ id: 'input-2', sourceKind: 'primary', label: 'channel', path: 'channel' }),
        ]}
        usages={usages}
      />,
    );

    expect(screen.getByTestId('smart-input-tray-usage-input-1')).toHaveTextContent('Used 2×');
    expect(screen.getByTestId('smart-input-tray-usage-input-2')).toHaveTextContent('Used in: Direct mapping');
    fireEvent.click(screen.getByText('Used 2×'));
    expect(screen.getByTestId('smart-input-tray-usage-details-input-1')).toHaveTextContent('IF left value (condition 1, check 1)');
  });

  it('prevents duplicate rows using input+path identity', () => {
    render(
      <InputTray
        inputs={[
          makeInput({ id: 'dup-1', path: 'customer.id', label: 'customer.id' }),
          makeInput({ id: 'dup-1', path: 'customer.id', label: 'customer.id' }),
        ]}
      />,
    );

    expect(screen.getByTestId('smart-input-tray-count')).toHaveTextContent('Inputs 1');
    expect(screen.getAllByTestId('smart-input-tray-item-dup-1')).toHaveLength(1);
  });

  it('enables tray scrolling only when threshold is exceeded', () => {
    const inputs = Array.from({ length: 6 }).map((_, index) => makeInput({
      id: `i-${index + 1}`,
      label: `field${index + 1}`,
      path: `field${index + 1}`,
    }));

    render(<InputTray inputs={inputs} />);

    expect(screen.getByTestId('smart-input-tray-scroll-region')).toHaveAttribute('data-scroll-enabled', 'true');
  });

  it('enables tray scrolling when content height exceeds 320px even with <=5 rows', () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return 400;
      },
    });

    render(
      <InputTray
        inputs={[
          makeInput({ id: 'h-1' }),
          makeInput({ id: 'h-2' }),
          makeInput({ id: 'h-3' }),
        ]}
      />, 
    );

    expect(screen.getByTestId('smart-input-tray-scroll-region')).toHaveAttribute('data-height-overflow', 'true');
    expect(screen.getByTestId('smart-input-tray-scroll-region')).toHaveAttribute('data-scroll-enabled', 'true');

    if (original) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original);
    } else {
      delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
    }
  });

  it('renders rows keyboard-focusable', () => {
    render(<InputTray inputs={[makeInput({ id: 'focus-1' })]} />);

    expect(screen.getByTestId('smart-input-tray-item-focus-1')).toHaveAttribute('tabIndex', '0');
  });

  it('removes unreferenced input immediately', () => {
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

  it('requires confirmation before removing referenced input and lists affected usages', () => {
    const onRemoveInput = vi.fn();
    render(
      <InputTray
        inputs={[makeInput({ id: 'input-1', sourceKind: 'primary', label: 'priority', path: 'priority' })]}
        usages={[
          { inputId: 'input-1', location: 'condition-left', clauseIndex: 0, predicateIndex: 0 },
          { inputId: 'input-1', location: 'otherwise' },
        ]}
        onRemoveInput={onRemoveInput}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-input-tray-remove-input-1'));
    expect(screen.getByTestId('smart-input-tray-remove-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('smart-input-tray-remove-confirm-usages')).toHaveTextContent('IF left value');
    expect(screen.getByTestId('smart-input-tray-remove-confirm-usages')).toHaveTextContent('OTHERWISE output');
    expect(screen.getByTestId('smart-input-tray-remove-confirm-usages')).toHaveTextContent('condition 1, check 1');
    expect(onRemoveInput).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('smart-input-tray-remove-confirm-accept'));
    expect(onRemoveInput).toHaveBeenCalledWith('input-1');
  });
});
