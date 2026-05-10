/**
 * ChainConditionForm tests — FS-038 T-09
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChainConditionForm, summarizeConditionStep } from './ChainConditionForm';
import type { ChainConditionFormProps } from './ChainConditionForm';
import type { ConditionLogicStep, ChainBranch } from '../lib/chain-builder-state';

function makeEmptyBranch(): ChainBranch {
  return { kind: 'static', value: { type: 'string', value: '' } };
}

function makeFilledBranch(value: string): ChainBranch {
  return { kind: 'static', value: { type: 'string', value } };
}

function makeStep(overrides: Partial<ConditionLogicStep> = {}): ConditionLogicStep {
  return {
    kind: 'condition',
    useCurrentValue: true,
    operator: 'eq',
    rightOperand: { kind: 'literal', value: '' },
    thenBranch: makeEmptyBranch(),
    elseBranch: makeEmptyBranch(),
    ...overrides,
  };
}

function renderForm(overrides: Partial<ChainConditionFormProps> = {}) {
  const props: ChainConditionFormProps = {
    stepIndex: 0,
    step: makeStep(),
    onStepChange: vi.fn(),
    onRemoveStep: vi.fn(),
    ...overrides,
  };
  return render(<ChainConditionForm {...props} />);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('ChainConditionForm — rendering', () => {
  it('renders the form container', () => {
    renderForm();
    expect(screen.getByTestId('chain-condition-form-0')).toBeInTheDocument();
  });

  it('AE-08: renders IF section', () => {
    renderForm();
    expect(screen.getByTestId('chain-condition-if-0')).toBeInTheDocument();
  });

  it('AE-08: renders THEN section', () => {
    renderForm();
    expect(screen.getByTestId('chain-condition-then-0')).toBeInTheDocument();
  });

  it('AE-08: renders ELSE section — always present', () => {
    renderForm();
    expect(screen.getByTestId('chain-condition-else-0')).toBeInTheDocument();
  });

  it('AE-08: else branch is required — shows required notice when empty', () => {
    renderForm({ step: makeStep({ elseBranch: makeEmptyBranch() }) });
    expect(screen.getByTestId('chain-condition-else-required-0')).toBeInTheDocument();
  });

  it('AE-08: else required notice absent when else has value', () => {
    renderForm({ step: makeStep({ elseBranch: makeFilledBranch('fallback') }) });
    expect(screen.queryByTestId('chain-condition-else-required-0')).not.toBeInTheDocument();
  });

  it('renders operator picker with all comparison operators', () => {
    renderForm();
    const select = screen.getByTestId('chain-condition-if-0-operator');
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(options).toContain('eq');
    expect(options).toContain('neq');
    expect(options).toContain('gt');
    expect(options).toContain('lt');
    expect(options).toContain('contains');
    expect(options).toContain('startsWith');
    expect(options).toContain('isNull');
    expect(options).toContain('isNotNull');
    expect(options).toContain('isTruthy');
    expect(options).toContain('isFalsy');
  });

  it('left operand defaults to current value label', () => {
    renderForm();
    expect(screen.getByTestId('chain-condition-if-0-left-current-value')).toBeInTheDocument();
  });

  it('shows "Change input" affordance when using current value', () => {
    renderForm();
    expect(screen.getByTestId('chain-condition-if-0-change-input')).toBeInTheDocument();
  });

  it('branch value selector supports static, source, expression kinds', () => {
    renderForm();
    const thenToggle = screen.getByTestId('chain-condition-then-branch-0-kind-toggle');
    expect(thenToggle.querySelector('[data-testid="chain-condition-then-branch-0-kind-static"]')).toBeInTheDocument();
    expect(thenToggle.querySelector('[data-testid="chain-condition-then-branch-0-kind-source"]')).toBeInTheDocument();
    expect(thenToggle.querySelector('[data-testid="chain-condition-then-branch-0-kind-expression"]')).toBeInTheDocument();
  });

  it('else supports null value type', () => {
    renderForm();
    const typeSelect = screen.getByTestId('chain-condition-else-branch-0-static-type');
    const options = Array.from(typeSelect.querySelectorAll('option')).map((o) => o.value);
    expect(options).toContain('null');
  });

  it('else supports empty string value', () => {
    renderForm();
    const input = screen.getByTestId('chain-condition-else-branch-0-static-input');
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('Apply disabled notice shown when else is empty', () => {
    renderForm();
    expect(screen.getByTestId('chain-condition-apply-disabled-0')).toBeInTheDocument();
  });

  it('Apply disabled notice absent when both branches filled', () => {
    renderForm({
      step: makeStep({
        thenBranch: makeFilledBranch('yes'),
        elseBranch: makeFilledBranch('no'),
      }),
    });
    expect(screen.queryByTestId('chain-condition-apply-disabled-0')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

describe('ChainConditionForm — interactions', () => {
  it('remove button fires onRemoveStep with correct index', () => {
    const onRemoveStep = vi.fn();
    renderForm({ stepIndex: 1, onRemoveStep });
    fireEvent.click(screen.getByTestId('chain-condition-remove-1'));
    expect(onRemoveStep).toHaveBeenCalledWith(1);
  });

  it('"Change input" switches left operand from current value to custom', () => {
    const onStepChange = vi.fn();
    renderForm({ onStepChange });
    fireEvent.click(screen.getByTestId('chain-condition-if-0-change-input'));
    expect(onStepChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ useCurrentValue: false }),
    );
  });

  it('"Use current value" restores current value operand', () => {
    const onStepChange = vi.fn();
    renderForm({
      step: makeStep({ useCurrentValue: false, customLeftOperand: { kind: 'source', path: 'x' } }),
      onStepChange,
    });
    fireEvent.click(screen.getByTestId('chain-condition-if-0-use-current-value'));
    expect(onStepChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ useCurrentValue: true }),
    );
  });

  it('operator change fires onStepChange', () => {
    const onStepChange = vi.fn();
    renderForm({ onStepChange });
    fireEvent.change(screen.getByTestId('chain-condition-if-0-operator'), {
      target: { value: 'contains' },
    });
    expect(onStepChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ operator: 'contains' }),
    );
  });

  it('[+ Add else-if] adds an else-if step', () => {
    const onStepChange = vi.fn();
    renderForm({ onStepChange });
    fireEvent.click(screen.getByTestId('chain-condition-add-elseif-0'));
    expect(onStepChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ elseIfSteps: expect.arrayContaining([expect.any(Object)]) }),
    );
  });

  it('collapse button hides form and shows summary', () => {
    renderForm({
      step: makeStep({
        thenBranch: makeFilledBranch('yes'),
        elseBranch: makeFilledBranch('no'),
      }),
    });
    fireEvent.click(screen.getByTestId('chain-condition-collapse-0'));
    expect(screen.getByTestId('chain-condition-summary-0')).toBeInTheDocument();
    expect(screen.queryByTestId('chain-condition-if-0')).not.toBeInTheDocument();
  });

  it('AE-08: clicking collapsed summary expands for editing', () => {
    renderForm({
      step: makeStep({
        thenBranch: makeFilledBranch('yes'),
        elseBranch: makeFilledBranch('no'),
      }),
    });
    fireEvent.click(screen.getByTestId('chain-condition-collapse-0'));
    fireEvent.click(screen.getByTestId('chain-condition-summary-0'));
    expect(screen.getByTestId('chain-condition-if-0')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// summarizeConditionStep
// ---------------------------------------------------------------------------

describe('summarizeConditionStep', () => {
  it('AE-08: produces readable one-line summary', () => {
    const step = makeStep({
      useCurrentValue: true,
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'premium' },
      thenBranch: makeFilledBranch('VIP'),
      elseBranch: makeFilledBranch('Standard'),
    });
    const summary = summarizeConditionStep(step);
    expect(summary).toContain('if');
    expect(summary).toContain('equals');
    expect(summary).toContain('VIP');
    expect(summary).toContain('Standard');
  });

  it('handles unary operators without right operand', () => {
    const step = makeStep({ operator: 'isNull' });
    const summary = summarizeConditionStep(step);
    expect(summary).toContain('is null');
  });
});
