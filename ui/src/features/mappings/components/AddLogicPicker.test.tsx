/**
 * AddLogicPicker tests — FS-038 T-07
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddLogicPicker } from './AddLogicPicker';
import type { AddLogicPickerProps } from './AddLogicPicker';

const DEFAULT_PROPS: AddLogicPickerProps = {
  precedingStepKind: undefined,
  onSelectLogicKind: vi.fn(),
  onDismiss: vi.fn(),
};

function renderPicker(overrides: Partial<AddLogicPickerProps> = {}) {
  return render(<AddLogicPicker {...DEFAULT_PROPS} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('AddLogicPicker — rendering', () => {
  it('renders the picker container', () => {
    renderPicker();
    expect(screen.getByTestId('add-logic-picker')).toBeInTheDocument();
  });

  it('AE-04: renders Transformation option', () => {
    renderPicker();
    expect(screen.getByTestId('add-logic-option-transform')).toBeInTheDocument();
    expect(screen.getByTestId('add-logic-option-transform')).toHaveTextContent('Transformation');
  });

  it('AE-04: renders Condition option', () => {
    renderPicker();
    expect(screen.getByTestId('add-logic-option-condition')).toBeInTheDocument();
    expect(screen.getByTestId('add-logic-option-condition')).toHaveTextContent('Condition');
  });

  it('AE-04: renders Value map option', () => {
    renderPicker();
    expect(screen.getByTestId('add-logic-option-valuemap')).toBeInTheDocument();
    expect(screen.getByTestId('add-logic-option-valuemap')).toHaveTextContent('Value map');
  });

  it('each option has a description', () => {
    renderPicker();
    expect(screen.getByTestId('add-logic-option-transform')).toHaveTextContent(
      'Apply a function to the current value',
    );
    expect(screen.getByTestId('add-logic-option-condition')).toHaveTextContent(
      'Add if / then / else logic',
    );
    expect(screen.getByTestId('add-logic-option-valuemap')).toHaveTextContent(
      'Map specific values to outputs',
    );
  });

  it('does NOT render context label when no preceding step', () => {
    renderPicker({ precedingStepKind: undefined });
    expect(screen.queryByTestId('add-logic-context-label')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Q5: Context label for post-condition / post-value-map steps
// ---------------------------------------------------------------------------

describe('AddLogicPicker — Q5: context label', () => {
  it('shows context label after a condition step', () => {
    renderPicker({ precedingStepKind: 'condition' });
    expect(screen.getByTestId('add-logic-context-label')).toHaveTextContent(
      'Current value: output of condition',
    );
  });

  it('shows context label after a value map step', () => {
    renderPicker({ precedingStepKind: 'valueMap' });
    expect(screen.getByTestId('add-logic-context-label')).toHaveTextContent(
      'Current value: output of value map',
    );
  });

  it('shows context label after a transform step', () => {
    renderPicker({ precedingStepKind: 'transform' });
    expect(screen.getByTestId('add-logic-context-label')).toHaveTextContent(
      'Current value: output of transform',
    );
  });
});

// ---------------------------------------------------------------------------
// Selection callbacks
// ---------------------------------------------------------------------------

describe('AddLogicPicker — selection', () => {
  it('fires onSelectLogicKind("transform") when Transformation is clicked', async () => {
    const user = userEvent.setup();
    const onSelectLogicKind = vi.fn();
    renderPicker({ onSelectLogicKind });
    await user.click(screen.getByTestId('add-logic-option-transform'));
    expect(onSelectLogicKind).toHaveBeenCalledWith('transform');
    expect(onSelectLogicKind).toHaveBeenCalledTimes(1);
  });

  it('fires onSelectLogicKind("condition") when Condition is clicked', async () => {
    const user = userEvent.setup();
    const onSelectLogicKind = vi.fn();
    renderPicker({ onSelectLogicKind });
    await user.click(screen.getByTestId('add-logic-option-condition'));
    expect(onSelectLogicKind).toHaveBeenCalledWith('condition');
  });

  it('fires onSelectLogicKind("valueMap") when Value map is clicked', async () => {
    const user = userEvent.setup();
    const onSelectLogicKind = vi.fn();
    renderPicker({ onSelectLogicKind });
    await user.click(screen.getByTestId('add-logic-option-valuemap'));
    expect(onSelectLogicKind).toHaveBeenCalledWith('valueMap');
  });
});

// ---------------------------------------------------------------------------
// Dismissal
// ---------------------------------------------------------------------------

describe('AddLogicPicker — dismissal', () => {
  it('fires onDismiss when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderPicker({ onDismiss });
    await user.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss when clicking outside the picker', () => {
    const onDismiss = vi.fn();
    render(
      <div>
        <AddLogicPicker {...DEFAULT_PROPS} onDismiss={onDismiss} />
        <button data-testid="outside">Outside</button>
      </div>,
    );
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onDismiss when clicking inside the picker', () => {
    const onDismiss = vi.fn();
    renderPicker({ onDismiss });
    fireEvent.pointerDown(screen.getByTestId('add-logic-option-transform'));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Keyboard accessibility
// ---------------------------------------------------------------------------

describe('AddLogicPicker — keyboard accessibility', () => {
  it('all three options are keyboard focusable', () => {
    renderPicker();
    const transform = screen.getByTestId('add-logic-option-transform');
    const condition = screen.getByTestId('add-logic-option-condition');
    const valuemap = screen.getByTestId('add-logic-option-valuemap');

    transform.focus();
    expect(document.activeElement).toBe(transform);
    condition.focus();
    expect(document.activeElement).toBe(condition);
    valuemap.focus();
    expect(document.activeElement).toBe(valuemap);
  });

  it('each option has an aria-label with label and description', () => {
    renderPicker();
    expect(screen.getByTestId('add-logic-option-transform')).toHaveAttribute(
      'aria-label',
      'Transformation: Apply a function to the current value',
    );
    expect(screen.getByTestId('add-logic-option-condition')).toHaveAttribute(
      'aria-label',
      'Condition: Add if / then / else logic',
    );
    expect(screen.getByTestId('add-logic-option-valuemap')).toHaveAttribute(
      'aria-label',
      'Value map: Map specific values to outputs',
    );
  });
});
