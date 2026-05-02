import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ObjectTemplateBuilder } from './ObjectTemplateBuilder';
import type { ObjectTemplateField } from '../lib/expression-generator';

const mockSchema = null;
const mockArrayItemSchema = null;

const baseField = (): ObjectTemplateField => ({
  key: 'name',
  value: { kind: 'literal', value: '' },
});

describe('ObjectTemplateBuilder', () => {
  it('renders empty state message when no fields', () => {
    render(
      <ObjectTemplateBuilder
        fields={[]}
        onChange={vi.fn()}
        parsedSourceSchema={mockSchema}
        arrayItemSchema={mockArrayItemSchema}
      />,
    );
    expect(screen.getByText(/no fields yet/i)).toBeTruthy();
  });

  it('renders a field row for each field', () => {
    const fields: ObjectTemplateField[] = [
      { key: 'sku', value: { kind: 'literal', value: 'abc' } },
      { key: 'qty', value: { kind: 'literal', value: 1 } },
    ];
    render(
      <ObjectTemplateBuilder
        fields={fields}
        onChange={vi.fn()}
        parsedSourceSchema={mockSchema}
        arrayItemSchema={mockArrayItemSchema}
      />,
    );
    expect(screen.getByTestId('template-field-0')).toBeTruthy();
    expect(screen.getByTestId('template-field-1')).toBeTruthy();
  });

  it('calls onChange with new pair when "Add field" is clicked', () => {
    const handleChange = vi.fn();
    render(
      <ObjectTemplateBuilder
        fields={[]}
        onChange={handleChange}
        parsedSourceSchema={mockSchema}
        arrayItemSchema={mockArrayItemSchema}
      />,
    );
    fireEvent.click(screen.getByText(/\+ add field/i));
    expect(handleChange).toHaveBeenCalledWith([
      { key: '', value: { kind: 'literal', value: '' } },
    ]);
  });

  it('calls onChange with updated key when key input changes', () => {
    const handleChange = vi.fn();
    render(
      <ObjectTemplateBuilder
        fields={[baseField()]}
        onChange={handleChange}
        parsedSourceSchema={mockSchema}
        arrayItemSchema={mockArrayItemSchema}
      />,
    );
    fireEvent.change(screen.getByLabelText(/template field 1 key/i), {
      target: { value: 'productName' },
    });
    expect(handleChange).toHaveBeenCalledWith([
      { key: 'productName', value: { kind: 'literal', value: '' } },
    ]);
  });

  it('calls onChange without the pair when remove is clicked', () => {
    const handleChange = vi.fn();
    render(
      <ObjectTemplateBuilder
        fields={[baseField(), { key: 'qty', value: { kind: 'literal', value: 0 } }]}
        onChange={handleChange}
        parsedSourceSchema={mockSchema}
        arrayItemSchema={mockArrayItemSchema}
      />,
    );
    fireEvent.click(screen.getByLabelText(/remove field 1/i));
    expect(handleChange).toHaveBeenCalledWith([
      { key: 'qty', value: { kind: 'literal', value: 0 } },
    ]);
  });

  it('renders argument slots for each field value', () => {
    render(
      <ObjectTemplateBuilder
        fields={[baseField()]}
        onChange={vi.fn()}
        parsedSourceSchema={mockSchema}
        arrayItemSchema={mockArrayItemSchema}
      />,
    );
    // ArgumentSlot renders with data-testid="argument-slot-value"
    expect(screen.getByTestId('argument-slot-value')).toBeTruthy();
  });
});
