import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConditionBuilder } from './ConditionBuilder';
import type { BuilderState } from '../lib/expression-generator';

describe('ConditionBuilder', () => {
  it('renders with default eq function selected', () => {
    render(
      <ConditionBuilder
        condition={null}
        onChange={vi.fn()}
        parsedSourceSchema={null}
        arrayItemSchema={null}
      />,
    );
    const select = screen.getByLabelText<HTMLSelectElement>(/comparison function/i);
    expect(select.value).toBe('eq');
  });

  it('renders all 6 comparison function options', () => {
    render(
      <ConditionBuilder
        condition={null}
        onChange={vi.fn()}
        parsedSourceSchema={null}
        arrayItemSchema={null}
      />,
    );
    const options = screen.getAllByRole('option');
    const names = options.map((o) => (o as HTMLOptionElement).value);
    expect(names).toContain('eq');
    expect(names).toContain('neq');
    expect(names).toContain('gt');
    expect(names).toContain('gte');
    expect(names).toContain('lt');
    expect(names).toContain('lte');
  });

  it('renders left and right argument slots', () => {
    render(
      <ConditionBuilder
        condition={null}
        onChange={vi.fn()}
        parsedSourceSchema={null}
        arrayItemSchema={null}
      />,
    );
    expect(screen.getByTestId('argument-slot-left')).toBeTruthy();
    expect(screen.getByTestId('argument-slot-right')).toBeTruthy();
  });

  it('calls onChange with null when only function is selected (no args)', () => {
    const handleChange = vi.fn();
    render(
      <ConditionBuilder
        condition={null}
        onChange={handleChange}
        parsedSourceSchema={null}
        arrayItemSchema={null}
      />,
    );
    fireEvent.change(screen.getByLabelText(/comparison function/i), {
      target: { value: 'gt' },
    });
    // No args set yet → condition is null
    expect(handleChange).toHaveBeenCalledWith(null);
  });

  it('initialises from existing condition', () => {
    const condition: BuilderState = {
      functionName: 'neq',
      arguments: [
        { kind: 'item', value: 'status' },
        { kind: 'literal', value: 'cancelled' },
      ],
    };
    render(
      <ConditionBuilder
        condition={condition}
        onChange={vi.fn()}
        parsedSourceSchema={null}
        arrayItemSchema={null}
      />,
    );
    const select = screen.getByLabelText<HTMLSelectElement>(/comparison function/i);
    expect(select.value).toBe('neq');
  });

  it('data-testid is present', () => {
    render(
      <ConditionBuilder
        condition={null}
        onChange={vi.fn()}
        parsedSourceSchema={null}
        arrayItemSchema={null}
      />,
    );
    expect(screen.getByTestId('condition-builder')).toBeTruthy();
  });
});
