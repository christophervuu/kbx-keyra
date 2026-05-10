/**
 * CollapsibleStepContainer tests — FS-038 T-11
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CollapsibleStepContainer } from './CollapsibleStepContainer';
import type { CollapsibleStepContainerProps } from './CollapsibleStepContainer';
import type { LogicStep } from '../lib/chain-builder-state';

function makeTransformStep(): LogicStep {
  return { kind: 'transform', functionName: 'upper', args: [] };
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

function renderContainer(overrides: Partial<CollapsibleStepContainerProps> = {}) {
  const props: CollapsibleStepContainerProps = {
    step: makeTransformStep(),
    index: 0,
    isExpanded: false,
    onToggle: vi.fn(),
    onRemoveStep: vi.fn(),
    renderForm: () => <div data-testid="mock-form">Form content</div>,
    ...overrides,
  };
  return render(<CollapsibleStepContainer {...props} />);
}

// ---------------------------------------------------------------------------
// Rendering — collapsed
// ---------------------------------------------------------------------------

describe('CollapsibleStepContainer — collapsed', () => {
  it('renders the container', () => {
    renderContainer();
    expect(screen.getByTestId('collapsible-step-0')).toBeInTheDocument();
  });

  it('AE-10: shows summary text when collapsed', () => {
    renderContainer({ step: makeTransformStep(), isExpanded: false });
    expect(screen.getByTestId('collapsible-step-summary-0')).toBeInTheDocument();
    expect(screen.getByTestId('collapsible-step-summary-0')).toHaveTextContent('upper');
  });

  it('AE-10: shows step number badge', () => {
    renderContainer({ index: 2 });
    expect(screen.getByTestId('collapsible-step-badge-2')).toHaveTextContent('3');
  });

  it('does NOT show form content when collapsed', () => {
    renderContainer({ isExpanded: false });
    expect(screen.queryByTestId('mock-form')).not.toBeInTheDocument();
  });

  it('header has aria-expanded=false when collapsed', () => {
    renderContainer({ isExpanded: false });
    expect(screen.getByTestId('collapsible-step-header-0')).toHaveAttribute('aria-expanded', 'false');
  });
});

// ---------------------------------------------------------------------------
// Rendering — expanded
// ---------------------------------------------------------------------------

describe('CollapsibleStepContainer — expanded', () => {
  it('AE-10: shows kind label when expanded', () => {
    renderContainer({ isExpanded: true });
    expect(screen.getByTestId('collapsible-step-kind-label-0')).toHaveTextContent('Transformation');
  });

  it('shows form content when expanded', () => {
    renderContainer({ isExpanded: true });
    expect(screen.getByTestId('mock-form')).toBeInTheDocument();
  });

  it('header has aria-expanded=true when expanded', () => {
    renderContainer({ isExpanded: true });
    expect(screen.getByTestId('collapsible-step-header-0')).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows condition kind label for condition step', () => {
    renderContainer({ step: makeConditionStep(), isExpanded: true });
    expect(screen.getByTestId('collapsible-step-kind-label-0')).toHaveTextContent('Condition');
  });
});

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

describe('CollapsibleStepContainer — interactions', () => {
  it('clicking header fires onToggle with correct index', () => {
    const onToggle = vi.fn();
    renderContainer({ index: 1, onToggle });
    fireEvent.click(screen.getByTestId('collapsible-step-header-1'));
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it('remove button fires onRemoveStep with correct index', () => {
    const onRemoveStep = vi.fn();
    renderContainer({ index: 2, onRemoveStep });
    fireEvent.click(screen.getByTestId('collapsible-step-remove-2'));
    expect(onRemoveStep).toHaveBeenCalledWith(2);
  });

  it('remove button click does not propagate to toggle', () => {
    const onToggle = vi.fn();
    const onRemoveStep = vi.fn();
    renderContainer({ onToggle, onRemoveStep });
    fireEvent.click(screen.getByTestId('collapsible-step-remove-0'));
    expect(onToggle).not.toHaveBeenCalled();
    expect(onRemoveStep).toHaveBeenCalledWith(0);
  });

  it('keyboard Enter on header fires onToggle', () => {
    const onToggle = vi.fn();
    renderContainer({ onToggle });
    fireEvent.keyDown(screen.getByTestId('collapsible-step-header-0'), { key: 'Enter' });
    expect(onToggle).toHaveBeenCalledWith(0);
  });

  it('keyboard Space on header fires onToggle', () => {
    const onToggle = vi.fn();
    renderContainer({ onToggle });
    fireEvent.keyDown(screen.getByTestId('collapsible-step-header-0'), { key: ' ' });
    expect(onToggle).toHaveBeenCalledWith(0);
  });
});
