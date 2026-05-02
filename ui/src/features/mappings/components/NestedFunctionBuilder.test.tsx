import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NestedFunctionBuilder } from './NestedFunctionBuilder';

describe('NestedFunctionBuilder', () => {
  it('shows TransformPicker when no function selected', () => {
    render(
      <NestedFunctionBuilder
        parsedSourceSchema={null}
        nestingLevel={1}
        onStateChange={vi.fn()}
      />,
    );
    // TransformPicker renders its search input
    expect(screen.getByPlaceholderText(/search functions/i)).toBeInTheDocument();
  });

  it('restores selected function from initialState', () => {
    render(
      <NestedFunctionBuilder
        parsedSourceSchema={null}
        nestingLevel={1}
        initialState={{ functionName: 'upper', arguments: [] }}
        onStateChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/upper\(\)/i)).toBeInTheDocument();
  });

  it('shows ArgumentConfigurator after function selection via TransformPicker', () => {
    render(
      <NestedFunctionBuilder
        parsedSourceSchema={null}
        nestingLevel={1}
        onStateChange={vi.fn()}
      />,
    );
    // Find the upper() function in the picker and click it
    // TransformPicker renders function entries — find 'upper' button
    const upperBtn = screen.getByRole('button', { name: /^upper$/i });
    fireEvent.click(upperBtn);
    expect(screen.getByTestId('argument-configurator')).toBeInTheDocument();
  });

  it('calls onStateChange with functionName and empty args on function select', () => {
    const onStateChange = vi.fn();
    render(
      <NestedFunctionBuilder
        parsedSourceSchema={null}
        nestingLevel={1}
        onStateChange={onStateChange}
      />,
    );
    const upperBtn = screen.getByRole('button', { name: /^upper$/i });
    fireEvent.click(upperBtn);
    expect(onStateChange).toHaveBeenCalledWith({
      functionName: 'upper',
      arguments: [],
    });
  });

  it('calls onStateChange(null) when "Change" button clicked', () => {
    const onStateChange = vi.fn();
    render(
      <NestedFunctionBuilder
        parsedSourceSchema={null}
        nestingLevel={1}
        initialState={{ functionName: 'upper', arguments: [] }}
        onStateChange={onStateChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /change nested function/i }));
    expect(onStateChange).toHaveBeenCalledWith(null);
  });

  it('shows TransformPicker again after clearing', () => {
    render(
      <NestedFunctionBuilder
        parsedSourceSchema={null}
        nestingLevel={1}
        initialState={{ functionName: 'upper', arguments: [] }}
        onStateChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /change nested function/i }));
    expect(screen.getByPlaceholderText(/search functions/i)).toBeInTheDocument();
  });

  it('calls onStateChange with updated args when ArgumentConfigurator changes', () => {
    const onStateChange = vi.fn();
    render(
      <NestedFunctionBuilder
        parsedSourceSchema={null}
        nestingLevel={1}
        initialState={{ functionName: 'upper', arguments: [] }}
        onStateChange={onStateChange}
      />,
    );
    const input = screen.getByLabelText('Source field path');
    fireEvent.change(input, { target: { value: 'name' } });
    expect(onStateChange).toHaveBeenCalledWith({
      functionName: 'upper',
      arguments: [{ kind: 'source', value: 'name' }],
    });
  });
});
