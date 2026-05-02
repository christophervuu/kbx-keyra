import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArgumentSlot } from './ArgumentSlot';
import type { FunctionCatalogParameter } from '@/lib/data/dsl-functions';

const requiredStringParam: FunctionCatalogParameter = {
  name: 'value',
  type: 'string',
  required: true,
};

const optionalNumberParam: FunctionCatalogParameter = {
  name: 'decimals',
  type: 'number',
  required: false,
};

const boolParam: FunctionCatalogParameter = {
  name: 'flag',
  type: 'boolean',
  required: true,
};

const anyParam: FunctionCatalogParameter = {
  name: 'input',
  type: 'any',
  required: true,
};

describe('ArgumentSlot', () => {
  it('renders parameter name and type', () => {
    render(
      <ArgumentSlot
        parameter={requiredStringParam}
        value={undefined}
        onChange={vi.fn()}
        parsedSourceSchema={null}
      />,
    );
    expect(screen.getByText('value')).toBeInTheDocument();
    expect(screen.getByText('string')).toBeInTheDocument();
  });

  it('shows required asterisk for required params', () => {
    render(
      <ArgumentSlot
        parameter={requiredStringParam}
        value={undefined}
        onChange={vi.fn()}
        parsedSourceSchema={null}
      />,
    );
    expect(screen.getByLabelText('required')).toBeInTheDocument();
  });

  it('shows optional label for optional params', () => {
    render(
      <ArgumentSlot
        parameter={optionalNumberParam}
        value={undefined}
        onChange={vi.fn()}
        parsedSourceSchema={null}
      />,
    );
    expect(screen.getByText('(optional)')).toBeInTheDocument();
  });

  it('shows remove button when onRemove provided', () => {
    const onRemove = vi.fn();
    render(
      <ArgumentSlot
        parameter={optionalNumberParam}
        value={undefined}
        onChange={vi.fn()}
        onRemove={onRemove}
        parsedSourceSchema={null}
      />,
    );
    const btn = screen.getByRole('button', { name: /remove decimals/i });
    fireEvent.click(btn);
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('source mode — text input renders; selecting a path emits source arg', () => {
    const onChange = vi.fn();
    render(
      <ArgumentSlot
        parameter={requiredStringParam}
        value={undefined}
        onChange={onChange}
        parsedSourceSchema={null}
      />,
    );
    const input = screen.getByLabelText('Source field path');
    fireEvent.change(input, { target: { value: 'order.name' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'source', value: 'order.name' });
  });

  it('switching to literal mode for string shows text input', () => {
    const onChange = vi.fn();
    render(
      <ArgumentSlot
        parameter={requiredStringParam}
        value={undefined}
        onChange={onChange}
        parsedSourceSchema={null}
      />,
    );
    const literalBtn = screen.getByRole('radio', { name: /literal/i });
    fireEvent.click(literalBtn);
    expect(screen.getByLabelText('value value')).toBeInTheDocument();
  });

  it('literal mode — text input emits literal string arg', () => {
    const onChange = vi.fn();
    render(
      <ArgumentSlot
        parameter={requiredStringParam}
        value={undefined}
        onChange={onChange}
        parsedSourceSchema={null}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /literal/i }));
    const input = screen.getByLabelText('value value');
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'literal', value: 'hello' });
  });

  it('literal mode — number param shows number input', () => {
    const onChange = vi.fn();
    render(
      <ArgumentSlot
        parameter={optionalNumberParam}
        value={undefined}
        onChange={onChange}
        parsedSourceSchema={null}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /literal/i }));
    const input = screen.getByLabelText('decimals number value') as HTMLInputElement;
    expect(input.type).toBe('number');
  });

  it('literal mode — boolean param shows checkbox', () => {
    const onChange = vi.fn();
    render(
      <ArgumentSlot
        parameter={boolParam}
        value={undefined}
        onChange={onChange}
        parsedSourceSchema={null}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /literal/i }));
    const checkbox = screen.getByRole('checkbox', { name: /flag boolean value/i });
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ kind: 'literal', value: true });
  });

  it('enum mode — shows select with provided options', () => {
    const onChange = vi.fn();
    render(
      <ArgumentSlot
        parameter={anyParam}
        value={undefined}
        onChange={onChange}
        parsedSourceSchema={null}
        enumOptions={['string', 'number', 'boolean']}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /literal/i }));
    const select = screen.getByRole('combobox', { name: /input value/i });
    fireEvent.change(select, { target: { value: 'number' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'literal', value: 'number' });
  });

  it('function mode button hidden at nestingLevel >= 1', () => {
    render(
      <ArgumentSlot
        parameter={anyParam}
        value={undefined}
        onChange={vi.fn()}
        parsedSourceSchema={null}
        nestingLevel={1}
        renderNestedBuilder={() => <div>nested</div>}
      />,
    );
    expect(screen.queryByRole('radio', { name: /function/i })).not.toBeInTheDocument();
  });

  it('function mode button visible at nestingLevel 0 when renderNestedBuilder provided', () => {
    render(
      <ArgumentSlot
        parameter={anyParam}
        value={undefined}
        onChange={vi.fn()}
        parsedSourceSchema={null}
        nestingLevel={0}
        renderNestedBuilder={() => <div>nested</div>}
      />,
    );
    expect(screen.getByRole('radio', { name: /function/i })).toBeInTheDocument();
  });

  it('function mode — renders nested builder content when selected', () => {
    render(
      <ArgumentSlot
        parameter={anyParam}
        value={undefined}
        onChange={vi.fn()}
        parsedSourceSchema={null}
        nestingLevel={0}
        renderNestedBuilder={() => <div data-testid="nested-builder">builder</div>}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /function/i }));
    expect(screen.getByTestId('nested-builder')).toBeInTheDocument();
  });
});
