import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConstantsSection, inferValueType, parseValue } from './ConstantsSection';

// ---------------------------------------------------------------------------
// Pure helper tests
// ---------------------------------------------------------------------------

describe('inferValueType', () => {
  it('returns "number" for integer strings', () => {
    expect(inferValueType('42')).toBe('number');
    expect(inferValueType('-7')).toBe('number');
    expect(inferValueType('0')).toBe('number');
  });

  it('returns "number" for decimal strings', () => {
    expect(inferValueType('3.14')).toBe('number');
    expect(inferValueType('-0.5')).toBe('number');
  });

  it('returns "boolean" for "true" and "false" (case-insensitive)', () => {
    expect(inferValueType('true')).toBe('boolean');
    expect(inferValueType('false')).toBe('boolean');
    expect(inferValueType('True')).toBe('boolean');
    expect(inferValueType('FALSE')).toBe('boolean');
  });

  it('returns "string" for everything else', () => {
    expect(inferValueType('hello')).toBe('string');
    expect(inferValueType('')).toBe('string');
    expect(inferValueType('42abc')).toBe('string');
  });
});

describe('parseValue', () => {
  it('converts numeric strings to numbers', () => {
    expect(parseValue('42')).toBe(42);
    expect(parseValue('3.14')).toBe(3.14);
  });

  it('converts "true"/"false" to booleans', () => {
    expect(parseValue('true')).toBe(true);
    expect(parseValue('false')).toBe(false);
    expect(parseValue('True')).toBe(true);
  });

  it('keeps other strings as strings', () => {
    expect(parseValue('hello')).toBe('hello');
    expect(parseValue('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Component tests
// ---------------------------------------------------------------------------

describe('ConstantsSection', () => {
  const defaultProps = {
    constants: undefined,
    onUpdate: vi.fn(),
  };

  it('renders empty state when no constants are defined', () => {
    render(<ConstantsSection {...defaultProps} />);
    expect(screen.getByTestId('constants-empty')).toHaveTextContent('No constants defined');
  });

  it('renders existing constants as table rows', () => {
    render(
      <ConstantsSection
        {...defaultProps}
        constants={{ TAX_RATE: 0.08, VERSION: 'v2', DEBUG: true }}
      />,
    );
    expect(screen.getByTestId('constant-row-TAX_RATE')).toBeInTheDocument();
    expect(screen.getByTestId('constant-row-VERSION')).toBeInTheDocument();
    expect(screen.getByTestId('constant-row-DEBUG')).toBeInTheDocument();
  });

  it('shows correct type badges for each value type', () => {
    render(
      <ConstantsSection
        {...defaultProps}
        constants={{ NUM: 42, STR: 'hello', BOOL: true }}
      />,
    );
    // number badge
    expect(screen.getByTestId('constant-row-NUM').querySelector('[data-testid="type-badge-number"]')).toBeInTheDocument();
    // string badge
    expect(screen.getByTestId('constant-row-STR').querySelector('[data-testid="type-badge-string"]')).toBeInTheDocument();
    // boolean badge
    expect(screen.getByTestId('constant-row-BOOL').querySelector('[data-testid="type-badge-boolean"]')).toBeInTheDocument();
  });

  it('add button is disabled when key input is empty', () => {
    render(<ConstantsSection {...defaultProps} />);
    expect(screen.getByTestId('constants-add-button')).toBeDisabled();
  });

  it('add button is disabled when key already exists', async () => {
    render(
      <ConstantsSection
        {...defaultProps}
        constants={{ API_KEY: 'abc' }}
      />,
    );
    await userEvent.type(screen.getByTestId('constants-new-key-input'), 'API_KEY');
    expect(screen.getByTestId('constants-add-button')).toBeDisabled();
  });

  it('shows "Key already exists" error when duplicate key is submitted', async () => {
    const onUpdate = vi.fn();
    render(
      <ConstantsSection
        constants={{ API_KEY: 'abc' }}
        onUpdate={onUpdate}
      />,
    );
    await userEvent.type(screen.getByTestId('constants-new-key-input'), 'API_KEY');
    // Force click even though disabled — test the error path via direct state
    // Actually the button is disabled so we test via Enter key
    await userEvent.type(screen.getByTestId('constants-new-key-input'), '{Enter}');
    expect(screen.getByTestId('constants-add-error')).toHaveTextContent('Key already exists');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('calls onUpdate with new constant when add button is clicked', async () => {
    const onUpdate = vi.fn();
    render(<ConstantsSection constants={{}} onUpdate={onUpdate} />);
    await userEvent.type(screen.getByTestId('constants-new-key-input'), 'TAX_RATE');
    await userEvent.type(screen.getByTestId('constants-new-value-input'), '0.08');
    await userEvent.click(screen.getByTestId('constants-add-button'));
    expect(onUpdate).toHaveBeenCalledWith({ TAX_RATE: 0.08 });
  });

  it('calls onUpdate via Enter key in key input', async () => {
    const onUpdate = vi.fn();
    render(<ConstantsSection constants={{}} onUpdate={onUpdate} />);
    await userEvent.type(screen.getByTestId('constants-new-key-input'), 'FLAG');
    await userEvent.type(screen.getByTestId('constants-new-value-input'), 'true');
    await userEvent.type(screen.getByTestId('constants-new-key-input'), '{Enter}');
    expect(onUpdate).toHaveBeenCalledWith({ FLAG: true });
  });

  it('infers number type: "42" stored as 42', async () => {
    const onUpdate = vi.fn();
    render(<ConstantsSection constants={{}} onUpdate={onUpdate} />);
    await userEvent.type(screen.getByTestId('constants-new-key-input'), 'NUM');
    await userEvent.type(screen.getByTestId('constants-new-value-input'), '42');
    await userEvent.click(screen.getByTestId('constants-add-button'));
    expect(onUpdate).toHaveBeenCalledWith({ NUM: 42 });
  });

  it('infers boolean type: "true" stored as true', async () => {
    const onUpdate = vi.fn();
    render(<ConstantsSection constants={{}} onUpdate={onUpdate} />);
    await userEvent.type(screen.getByTestId('constants-new-key-input'), 'FLAG');
    await userEvent.type(screen.getByTestId('constants-new-value-input'), 'true');
    await userEvent.click(screen.getByTestId('constants-add-button'));
    expect(onUpdate).toHaveBeenCalledWith({ FLAG: true });
  });

  it('infers string type: "hello" stored as "hello"', async () => {
    const onUpdate = vi.fn();
    render(<ConstantsSection constants={{}} onUpdate={onUpdate} />);
    await userEvent.type(screen.getByTestId('constants-new-key-input'), 'LABEL');
    await userEvent.type(screen.getByTestId('constants-new-value-input'), 'hello');
    await userEvent.click(screen.getByTestId('constants-add-button'));
    expect(onUpdate).toHaveBeenCalledWith({ LABEL: 'hello' });
  });

  it('clears inputs after successful add', async () => {
    render(<ConstantsSection constants={{}} onUpdate={vi.fn()} />);
    await userEvent.type(screen.getByTestId('constants-new-key-input'), 'K');
    await userEvent.type(screen.getByTestId('constants-new-value-input'), 'v');
    await userEvent.click(screen.getByTestId('constants-add-button'));
    expect(screen.getByTestId('constants-new-key-input')).toHaveValue('');
    expect(screen.getByTestId('constants-new-value-input')).toHaveValue('');
  });

  // ---------------------------------------------------------------------------
  // Inline edit
  // ---------------------------------------------------------------------------

  it('clicking value display enters edit mode', async () => {
    render(
      <ConstantsSection
        constants={{ RATE: 0.1 }}
        onUpdate={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('constant-value-display-RATE'));
    expect(screen.getByTestId('constant-value-input-RATE')).toBeInTheDocument();
  });

  it('blur on value input commits the edit', async () => {
    const onUpdate = vi.fn();
    render(
      <ConstantsSection
        constants={{ RATE: 0.1 }}
        onUpdate={onUpdate}
      />,
    );
    await userEvent.click(screen.getByTestId('constant-value-display-RATE'));
    const input = screen.getByTestId('constant-value-input-RATE');
    await userEvent.clear(input);
    await userEvent.type(input, '0.2');
    await userEvent.tab(); // triggers blur
    expect(onUpdate).toHaveBeenCalledWith({ RATE: 0.2 });
  });

  it('Enter on value input commits the edit', async () => {
    const onUpdate = vi.fn();
    render(
      <ConstantsSection
        constants={{ LABEL: 'old' }}
        onUpdate={onUpdate}
      />,
    );
    await userEvent.click(screen.getByTestId('constant-value-display-LABEL'));
    const input = screen.getByTestId('constant-value-input-LABEL');
    await userEvent.clear(input);
    await userEvent.type(input, 'new{Enter}');
    expect(onUpdate).toHaveBeenCalledWith({ LABEL: 'new' });
  });

  it('Escape on value input cancels the edit', async () => {
    const onUpdate = vi.fn();
    render(
      <ConstantsSection
        constants={{ LABEL: 'original' }}
        onUpdate={onUpdate}
      />,
    );
    await userEvent.click(screen.getByTestId('constant-value-display-LABEL'));
    const input = screen.getByTestId('constant-value-input-LABEL');
    await userEvent.clear(input);
    await userEvent.type(input, 'changed');
    await userEvent.keyboard('{Escape}');
    expect(onUpdate).not.toHaveBeenCalled();
    // Display should revert
    expect(screen.getByTestId('constant-value-display-LABEL')).toHaveTextContent('original');
  });

  it('clicking key display enters key edit mode', async () => {
    render(
      <ConstantsSection
        constants={{ OLD_KEY: 'val' }}
        onUpdate={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('constant-key-display-OLD_KEY'));
    expect(screen.getByTestId('constant-key-input-OLD_KEY')).toBeInTheDocument();
  });

  it('renaming a key to an existing key shows error and does not call onUpdate', async () => {
    const onUpdate = vi.fn();
    render(
      <ConstantsSection
        constants={{ KEY_A: 1, KEY_B: 2 }}
        onUpdate={onUpdate}
      />,
    );
    await userEvent.click(screen.getByTestId('constant-key-display-KEY_A'));
    const input = screen.getByTestId('constant-key-input-KEY_A');
    await userEvent.clear(input);
    await userEvent.type(input, 'KEY_B{Enter}');
    expect(screen.getByTestId('constant-key-error-KEY_A')).toHaveTextContent('Key already exists');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  it('delete button shows confirmation dialog', async () => {
    render(
      <ConstantsSection
        constants={{ TAX: 0.1 }}
        onUpdate={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('constant-delete-TAX'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This constant may be referenced by rules. Removing it will cause validation errors.',
      ),
    ).toBeInTheDocument();
  });

  it('confirming delete calls onUpdate without the deleted key', async () => {
    const onUpdate = vi.fn();
    render(
      <ConstantsSection
        constants={{ TAX: 0.1, VERSION: 'v1' }}
        onUpdate={onUpdate}
      />,
    );
    await userEvent.click(screen.getByTestId('constant-delete-TAX'));
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onUpdate).toHaveBeenCalledWith({ VERSION: 'v1' });
  });

  it('cancelling delete does not call onUpdate', async () => {
    const onUpdate = vi.fn();
    render(
      <ConstantsSection
        constants={{ TAX: 0.1 }}
        onUpdate={onUpdate}
      />,
    );
    await userEvent.click(screen.getByTestId('constant-delete-TAX'));
    await userEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(onUpdate).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument(),
    );
  });

  it('delete button has accessible aria-label', () => {
    render(
      <ConstantsSection
        constants={{ MY_KEY: 'val' }}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByTestId('constant-delete-MY_KEY')).toHaveAttribute(
      'aria-label',
      'Delete constant MY_KEY',
    );
  });
});
