/**
 * LogicStepList tests — FS-038 T-11
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogicStepList } from './LogicStepList';
import type { LogicStepListProps } from './LogicStepList';
import type { LogicStep } from '../lib/chain-builder-state';

function makeTransformStep(fn = 'upper'): LogicStep {
  return { kind: 'transform', functionName: fn, args: [] };
}

function makeConditionStep(): LogicStep {
  return {
    kind: 'condition',
    useCurrentValue: true,
    operator: 'eq',
    rightOperand: { kind: 'literal', value: 'test' },
    thenBranch: { kind: 'static', value: { type: 'string', value: 'yes' } },
    elseBranch: { kind: 'static', value: { type: 'string', value: 'no' } },
  };
}

function renderList(overrides: Partial<LogicStepListProps> = {}) {
  const props: LogicStepListProps = {
    steps: [],
    expandedStepIndex: null,
    onExpandedStepIndexChange: vi.fn(),
    onStepChange: vi.fn(),
    onRemoveStep: vi.fn(),
    onAddStep: vi.fn(),
    ...overrides,
  };
  return render(<LogicStepList {...props} />);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('LogicStepList — rendering', () => {
  it('renders the list container', () => {
    renderList();
    expect(screen.getByTestId('logic-step-list')).toBeInTheDocument();
  });

  it('renders step items for each step', () => {
    renderList({ steps: [makeTransformStep(), makeConditionStep()] });
    expect(screen.getByTestId('logic-step-list-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('logic-step-list-item-1')).toBeInTheDocument();
  });

  it('renders step connectors between steps', () => {
    renderList({ steps: [makeTransformStep(), makeTransformStep('lower')] });
    expect(screen.getByTestId('logic-step-connector-0')).toBeInTheDocument();
  });

  it('does not render connector after last step (only bottom connector)', () => {
    renderList({ steps: [makeTransformStep()] });
    expect(screen.queryByTestId('logic-step-connector-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('logic-step-list-bottom-connector')).toBeInTheDocument();
  });

  it('renders [+ Add logic] button when picker is closed', () => {
    renderList();
    expect(screen.getByTestId('logic-step-list-add-logic')).toBeInTheDocument();
  });

  it('AE-10: step number badges render correctly', () => {
    renderList({ steps: [makeTransformStep(), makeTransformStep('lower')] });
    expect(screen.getByTestId('collapsible-step-badge-0')).toHaveTextContent('1');
    expect(screen.getByTestId('collapsible-step-badge-1')).toHaveTextContent('2');
  });
});

// ---------------------------------------------------------------------------
// Single-expansion constraint
// ---------------------------------------------------------------------------

describe('LogicStepList — single-expansion constraint', () => {
  it('AE-10: only one step expanded at a time — expanded step shows form', () => {
    renderList({
      steps: [makeTransformStep(), makeTransformStep('lower')],
      expandedStepIndex: 0,
    });
    expect(screen.getByTestId('collapsible-step-form-0')).toBeInTheDocument();
    expect(screen.queryByTestId('collapsible-step-form-1')).not.toBeInTheDocument();
  });

  it('AE-10: clicking collapsed step fires onExpandedStepIndexChange', () => {
    const onExpandedStepIndexChange = vi.fn();
    renderList({
      steps: [makeTransformStep(), makeTransformStep('lower')],
      expandedStepIndex: 0,
      onExpandedStepIndexChange,
    });
    fireEvent.click(screen.getByTestId('collapsible-step-header-1'));
    expect(onExpandedStepIndexChange).toHaveBeenCalledWith(1);
  });

  it('AE-10: clicking expanded step fires onExpandedStepIndexChange with null', () => {
    const onExpandedStepIndexChange = vi.fn();
    renderList({
      steps: [makeTransformStep()],
      expandedStepIndex: 0,
      onExpandedStepIndexChange,
    });
    fireEvent.click(screen.getByTestId('collapsible-step-header-0'));
    expect(onExpandedStepIndexChange).toHaveBeenCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// Add logic picker
// ---------------------------------------------------------------------------

describe('LogicStepList — add logic picker', () => {
  it('clicking [+ Add logic] opens the picker', () => {
    renderList();
    fireEvent.click(screen.getByTestId('logic-step-list-add-logic'));
    expect(screen.getByTestId('logic-step-list-picker')).toBeInTheDocument();
  });

  it('selecting a logic kind fires onAddStep and closes picker', () => {
    const onAddStep = vi.fn();
    renderList({ onAddStep });
    fireEvent.click(screen.getByTestId('logic-step-list-add-logic'));
    fireEvent.click(screen.getByTestId('add-logic-option-transform'));
    expect(onAddStep).toHaveBeenCalledWith('transform');
    expect(screen.queryByTestId('logic-step-list-picker')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Remove step
// ---------------------------------------------------------------------------

describe('LogicStepList — remove step', () => {
  it('remove button fires onRemoveStep with correct index', () => {
    const onRemoveStep = vi.fn();
    renderList({
      steps: [makeTransformStep(), makeTransformStep('lower')],
      onRemoveStep,
    });
    fireEvent.click(screen.getByTestId('collapsible-step-remove-1'));
    expect(onRemoveStep).toHaveBeenCalledWith(1);
  });
});
