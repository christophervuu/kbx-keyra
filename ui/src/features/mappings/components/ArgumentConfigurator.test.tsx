import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArgumentConfigurator } from './ArgumentConfigurator';
import type { FunctionCatalogParameter } from '@/lib/data/dsl-functions';

const concatParams: FunctionCatalogParameter[] = [
  { name: 'value', type: 'string', required: true },
  { name: 'rest', type: 'string', required: false, variadic: true },
];

const addParams: FunctionCatalogParameter[] = [
  { name: 'a', type: 'number', required: true },
  { name: 'b', type: 'number', required: true },
];

const castParams: FunctionCatalogParameter[] = [
  { name: 'value', type: 'any', required: true },
  { name: 'targetType', type: 'string', required: true },
];

describe('ArgumentConfigurator', () => {
  it('renders correct number of slots for non-variadic function', () => {
    render(
      <ArgumentConfigurator
        functionName="add"
        parameters={addParams}
        values={[]}
        onChange={vi.fn()}
        parsedSourceSchema={null}
      />,
    );
    expect(screen.getByTestId('argument-slot-a')).toBeInTheDocument();
    expect(screen.getByTestId('argument-slot-b')).toBeInTheDocument();
  });

  it('renders fixed slot and variadic slot for concat', () => {
    render(
      <ArgumentConfigurator
        functionName="concat"
        parameters={concatParams}
        values={[]}
        onChange={vi.fn()}
        parsedSourceSchema={null}
      />,
    );
    // Fixed: 'value' slot
    expect(screen.getByTestId('argument-slot-value')).toBeInTheDocument();
    // Variadic: 'rest' slot starts at count=0 (not required), so no slot yet
  });

  it('"Add argument" button appears for variadic params', () => {
    render(
      <ArgumentConfigurator
        functionName="concat"
        parameters={concatParams}
        values={[]}
        onChange={vi.fn()}
        parsedSourceSchema={null}
      />,
    );
    expect(screen.getByRole('button', { name: /add rest argument/i })).toBeInTheDocument();
  });

  it('clicking "Add argument" adds a variadic slot', () => {
    render(
      <ArgumentConfigurator
        functionName="concat"
        parameters={concatParams}
        values={[]}
        onChange={vi.fn()}
        parsedSourceSchema={null}
      />,
    );
    const addBtn = screen.getByRole('button', { name: /add rest argument/i });
    fireEvent.click(addBtn);
    // After click, one variadic slot should appear
    expect(screen.getAllByTestId('argument-slot-rest')).toHaveLength(1);
  });

  it('onChange fires with updated values when a slot changes', () => {
    const onChange = vi.fn();
    render(
      <ArgumentConfigurator
        functionName="add"
        parameters={addParams}
        values={[]}
        onChange={onChange}
        parsedSourceSchema={null}
      />,
    );
    const input = screen.getAllByLabelText('Source field path')[0];
    fireEvent.change(input, { target: { value: 'order.qty' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([{ kind: 'source', value: 'order.qty' }]),
    );
  });

  it('shows enum dropdown for cast targetType parameter', () => {
    render(
      <ArgumentConfigurator
        functionName="cast"
        parameters={castParams}
        values={[]}
        onChange={vi.fn()}
        parsedSourceSchema={null}
      />,
    );
    // Switch the targetType slot to literal mode to reveal enum
    const targetTypeSlot = screen.getByTestId('argument-slot-targetType');
    const literalBtn = targetTypeSlot.querySelector('[role="radio"][aria-checked="false"]') as HTMLElement;
    if (literalBtn) fireEvent.click(literalBtn);
    // We expect the enum options to be present
    expect(screen.getByRole('option', { name: 'string' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'number' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'boolean' })).toBeInTheDocument();
  });

  it('renders required indicator for required params', () => {
    render(
      <ArgumentConfigurator
        functionName="add"
        parameters={addParams}
        values={[]}
        onChange={vi.fn()}
        parsedSourceSchema={null}
      />,
    );
    const requiredMarkers = screen.getAllByLabelText('required');
    expect(requiredMarkers.length).toBeGreaterThanOrEqual(2);
  });

  it('shows empty-params message for zero-param function', () => {
    render(
      <ArgumentConfigurator
        functionName="now"
        parameters={[]}
        values={[]}
        onChange={vi.fn()}
        parsedSourceSchema={null}
      />,
    );
    expect(screen.getByText(/takes no arguments/i)).toBeInTheDocument();
  });
});
