/**
 * StaticValueInput tests — FS-038 T-06
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StaticValueInput } from './StaticValueInput';
import type { StaticValueInputProps } from './StaticValueInput';

const DEFAULT_PROPS: StaticValueInputProps = {
  initialValue: '',
  targetType: 'string',
  onValueChange: vi.fn(),
  onValidChange: vi.fn(),
  onAddLogic: vi.fn(),
};

function renderInput(overrides: Partial<StaticValueInputProps> = {}) {
  return render(<StaticValueInput {...DEFAULT_PROPS} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('StaticValueInput — rendering', () => {
  it('renders the input container', () => {
    renderInput();
    expect(screen.getByTestId('static-value-input')).toBeInTheDocument();
  });

  it('renders the text input', () => {
    renderInput();
    expect(screen.getByTestId('static-value-text-input')).toBeInTheDocument();
  });

  it('renders the target type badge', () => {
    renderInput({ targetType: 'number' });
    expect(screen.getByTestId('static-value-target-type')).toHaveTextContent('number');
  });

  it('renders the "+ Add logic" button', () => {
    renderInput();
    expect(screen.getByTestId('static-value-add-logic')).toBeInTheDocument();
  });

  it('shows no validation icon when input is empty', () => {
    renderInput({ initialValue: '' });
    expect(screen.queryByTestId('static-value-valid-icon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('static-value-invalid-icon')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AE-02: String target — any input is valid
// ---------------------------------------------------------------------------

describe('StaticValueInput — AE-02: string target', () => {
  it('shows green checkmark for any non-empty string input', async () => {
    const user = userEvent.setup();
    renderInput({ targetType: 'string' });
    await user.type(screen.getByTestId('static-value-text-input'), 'WEB');
    expect(screen.getByTestId('static-value-valid-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('static-value-invalid-icon')).not.toBeInTheDocument();
  });

  it('fires onValueChange with string StaticValueBranch for string input', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderInput({ targetType: 'string', onValueChange });
    await user.type(screen.getByTestId('static-value-text-input'), 'hello');
    expect(onValueChange).toHaveBeenLastCalledWith({ type: 'string', value: 'hello' });
  });

  it('keeps numeric-looking input as string for string target', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderInput({ targetType: 'string', onValueChange });
    await user.type(screen.getByTestId('static-value-text-input'), '10');
    expect(onValueChange).toHaveBeenLastCalledWith({ type: 'string', value: '10' });
  });

  it('fires onValidChange(true) for valid string input', async () => {
    const user = userEvent.setup();
    const onValidChange = vi.fn();
    renderInput({ targetType: 'string', onValidChange });
    await user.type(screen.getByTestId('static-value-text-input'), 'x');
    expect(onValidChange).toHaveBeenLastCalledWith(true);
  });
});

// ---------------------------------------------------------------------------
// AE-17: Number target — must parse as number
// ---------------------------------------------------------------------------

describe('StaticValueInput — AE-17: number target', () => {
  it('shows green checkmark for valid number input', async () => {
    const user = userEvent.setup();
    renderInput({ targetType: 'number' });
    await user.type(screen.getByTestId('static-value-text-input'), '42');
    expect(screen.getByTestId('static-value-valid-icon')).toBeInTheDocument();
  });

  it('fires onValueChange with number StaticValueBranch for numeric input', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderInput({ targetType: 'number', onValueChange });
    await user.type(screen.getByTestId('static-value-text-input'), '42');
    expect(onValueChange).toHaveBeenLastCalledWith({ type: 'number', value: 42 });
  });

  it('AE-17: shows red X and error for string input on number target', async () => {
    const user = userEvent.setup();
    renderInput({ targetType: 'number' });
    const input = screen.getByTestId('static-value-text-input');
    await user.type(input, 'hello');
    await user.tab(); // trigger blur to show error
    expect(screen.getByTestId('static-value-invalid-icon')).toBeInTheDocument();
    expect(screen.getByTestId('static-value-error')).toHaveTextContent('Expected number');
  });

  it('fires onValidChange(false) for non-numeric input on number target', async () => {
    const user = userEvent.setup();
    const onValidChange = vi.fn();
    renderInput({ targetType: 'number', onValidChange });
    await user.type(screen.getByTestId('static-value-text-input'), 'abc');
    expect(onValidChange).toHaveBeenLastCalledWith(false);
  });

  it('accepts integer target type as number', async () => {
    const user = userEvent.setup();
    renderInput({ targetType: 'integer' });
    await user.type(screen.getByTestId('static-value-text-input'), '10');
    expect(screen.getByTestId('static-value-valid-icon')).toBeInTheDocument();
  });

  it('accepts decimal number for number target', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderInput({ targetType: 'number', onValueChange });
    await user.type(screen.getByTestId('static-value-text-input'), '3.14');
    expect(onValueChange).toHaveBeenLastCalledWith({ type: 'number', value: 3.14 });
  });
});

// ---------------------------------------------------------------------------
// Boolean target
// ---------------------------------------------------------------------------

describe('StaticValueInput — boolean target', () => {
  it('shows green checkmark for "true" input on boolean target', async () => {
    const user = userEvent.setup();
    renderInput({ targetType: 'boolean' });
    await user.type(screen.getByTestId('static-value-text-input'), 'true');
    expect(screen.getByTestId('static-value-valid-icon')).toBeInTheDocument();
  });

  it('shows green checkmark for "false" input on boolean target', async () => {
    const user = userEvent.setup();
    renderInput({ targetType: 'boolean' });
    await user.type(screen.getByTestId('static-value-text-input'), 'false');
    expect(screen.getByTestId('static-value-valid-icon')).toBeInTheDocument();
  });

  it('fires onValueChange with boolean StaticValueBranch for "true"', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderInput({ targetType: 'boolean', onValueChange });
    await user.type(screen.getByTestId('static-value-text-input'), 'true');
    expect(onValueChange).toHaveBeenLastCalledWith({ type: 'boolean', value: true });
  });

  it('fires onValueChange with boolean StaticValueBranch for "false"', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderInput({ targetType: 'boolean', onValueChange });
    await user.type(screen.getByTestId('static-value-text-input'), 'false');
    expect(onValueChange).toHaveBeenLastCalledWith({ type: 'boolean', value: false });
  });

  it('shows error for non-boolean input on boolean target', async () => {
    const user = userEvent.setup();
    renderInput({ targetType: 'boolean' });
    const input = screen.getByTestId('static-value-text-input');
    await user.type(input, 'yes');
    await user.tab();
    expect(screen.getByTestId('static-value-error')).toHaveTextContent('Expected boolean');
  });
});

// ---------------------------------------------------------------------------
// Null target
// ---------------------------------------------------------------------------

describe('StaticValueInput — null target', () => {
  it('shows green checkmark for "null" input on null target', async () => {
    const user = userEvent.setup();
    renderInput({ targetType: 'null' });
    await user.type(screen.getByTestId('static-value-text-input'), 'null');
    expect(screen.getByTestId('static-value-valid-icon')).toBeInTheDocument();
  });

  it('fires onValueChange with null StaticValueBranch', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderInput({ targetType: 'null', onValueChange });
    await user.type(screen.getByTestId('static-value-text-input'), 'null');
    expect(onValueChange).toHaveBeenLastCalledWith({ type: 'null' });
  });
});

// ---------------------------------------------------------------------------
// Unknown target type — accept anything
// ---------------------------------------------------------------------------

describe('StaticValueInput — unknown target type', () => {
  it('accepts any input for unknown target type', async () => {
    const user = userEvent.setup();
    renderInput({ targetType: 'object' });
    await user.type(screen.getByTestId('static-value-text-input'), 'anything');
    expect(screen.getByTestId('static-value-valid-icon')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// + Add logic button
// ---------------------------------------------------------------------------

describe('StaticValueInput — + Add logic button', () => {
  it('fires onAddLogic when clicked', async () => {
    const user = userEvent.setup();
    const onAddLogic = vi.fn();
    renderInput({ onAddLogic });
    await user.click(screen.getByTestId('static-value-add-logic'));
    expect(onAddLogic).toHaveBeenCalledTimes(1);
  });

  it('+ Add logic button has aria-label', () => {
    renderInput();
    expect(screen.getByTestId('static-value-add-logic')).toHaveAttribute(
      'aria-label',
      'Add logic step',
    );
  });

  it('+ Add logic button is keyboard focusable', () => {
    renderInput();
    const btn = screen.getByTestId('static-value-add-logic');
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });
});

// ---------------------------------------------------------------------------
// Error message visibility
// ---------------------------------------------------------------------------

describe('StaticValueInput — error message visibility', () => {
  it('does NOT show error before user has touched the input', () => {
    renderInput({ targetType: 'number', initialValue: '' });
    expect(screen.queryByTestId('static-value-error')).not.toBeInTheDocument();
  });

  it('shows error after blur with invalid input', async () => {
    const user = userEvent.setup();
    renderInput({ targetType: 'number' });
    const input = screen.getByTestId('static-value-text-input');
    await user.type(input, 'abc');
    await user.tab();
    expect(screen.getByTestId('static-value-error')).toBeInTheDocument();
  });

  it('hides error when input becomes valid', async () => {
    const user = userEvent.setup();
    renderInput({ targetType: 'number' });
    const input = screen.getByTestId('static-value-text-input');
    await user.type(input, 'abc');
    await user.tab();
    expect(screen.getByTestId('static-value-error')).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, '42');
    expect(screen.queryByTestId('static-value-error')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// aria-invalid
// ---------------------------------------------------------------------------

describe('StaticValueInput — aria-invalid', () => {
  it('sets aria-invalid on input when error is shown', async () => {
    const user = userEvent.setup();
    renderInput({ targetType: 'number' });
    const input = screen.getByTestId('static-value-text-input');
    await user.type(input, 'abc');
    await user.tab();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not set aria-invalid when input is valid', async () => {
    const user = userEvent.setup();
    renderInput({ targetType: 'number' });
    await user.type(screen.getByTestId('static-value-text-input'), '42');
    expect(screen.getByTestId('static-value-text-input')).not.toHaveAttribute('aria-invalid', 'true');
  });
});
