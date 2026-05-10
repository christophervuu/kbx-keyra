/**
 * TransformStepForm tests — FS-038 T-08
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TransformStepForm } from './TransformStepForm';
import type { TransformStepFormProps } from './TransformStepForm';
import type { TransformLogicStep } from '../lib/chain-builder-state';

function makeStep(overrides: Partial<TransformLogicStep> = {}): TransformLogicStep {
  return {
    kind: 'transform',
    functionName: 'upper',
    args: [],
    ...overrides,
  };
}

function renderForm(overrides: Partial<TransformStepFormProps> = {}) {
  const props: TransformStepFormProps = {
    stepIndex: 0,
    step: makeStep(),
    onStepChange: vi.fn(),
    onRemoveStep: vi.fn(),
    ...overrides,
  };
  return render(<TransformStepForm {...props} />);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('TransformStepForm — rendering', () => {
  it('renders the step container', () => {
    renderForm();
    expect(screen.getByTestId('transform-step-form-0')).toBeInTheDocument();
  });

  it('AE-05: renders function name for upper', () => {
    renderForm({ step: makeStep({ functionName: 'upper' }) });
    expect(screen.getByTestId('transform-step-function-name-0')).toHaveTextContent('upper');
  });

  it('AE-05: renders plain-language description from catalog', () => {
    renderForm({ step: makeStep({ functionName: 'upper' }) });
    expect(screen.getByTestId('transform-step-description-0')).toBeInTheDocument();
    // Description should be non-empty
    expect(screen.getByTestId('transform-step-description-0').textContent).not.toBe('');
  });

  it('AE-05: upper has no additional params — shows no-params notice', () => {
    renderForm({ step: makeStep({ functionName: 'upper' }) });
    expect(screen.getByTestId('transform-step-no-params-0')).toBeInTheDocument();
  });

  it('AE-05: implicit first arg is NOT shown as a field', () => {
    renderForm({ step: makeStep({ functionName: 'upper' }) });
    // The implicit arg notice should be present
    expect(screen.getByTestId('transform-step-implicit-arg-0')).toBeInTheDocument();
    // But there should be no editable param field for the first arg
    expect(screen.queryByTestId('transform-step-params-0')).not.toBeInTheDocument();
  });

  it('AE-06: multiply renders one additional param field', () => {
    renderForm({ step: makeStep({ functionName: 'multiply', args: [] }) });
    expect(screen.getByTestId('transform-step-params-0')).toBeInTheDocument();
    // ArgumentForm renders for multiply
    expect(screen.getByTestId('argument-form-multiply')).toBeInTheDocument();
  });

  it('AE-07: concat renders [+ Add value] for variadic', () => {
    renderForm({ step: makeStep({ functionName: 'concat', args: [] }) });
    expect(screen.getByTestId('argument-form-add-value')).toBeInTheDocument();
  });

  it('shows implicit current value notice', () => {
    renderForm({ step: makeStep({ functionName: 'upper' }) });
    expect(screen.getByTestId('transform-step-implicit-arg-0')).toHaveTextContent('current value');
  });
});

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

describe('TransformStepForm — interactions', () => {
  it('remove button fires onRemoveStep with correct index', () => {
    const onRemoveStep = vi.fn();
    renderForm({ stepIndex: 2, step: makeStep({ functionName: 'upper' }), onRemoveStep });
    fireEvent.click(screen.getByTestId('transform-step-remove-2'));
    expect(onRemoveStep).toHaveBeenCalledWith(2);
  });

  it('change function button opens picker', () => {
    renderForm({ step: makeStep({ functionName: 'upper' }) });
    fireEvent.click(screen.getByTestId('transform-step-change-fn-0'));
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
  });

  it('renders picker when functionName is empty', () => {
    renderForm({ step: makeStep({ functionName: '' }) });
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
  });

  it('remove button in picker mode fires onRemoveStep', () => {
    const onRemoveStep = vi.fn();
    renderForm({ step: makeStep({ functionName: '' }), onRemoveStep });
    fireEvent.click(screen.getByTestId('transform-step-remove-0'));
    expect(onRemoveStep).toHaveBeenCalledWith(0);
  });
});

// ---------------------------------------------------------------------------
// Slot mode support
// ---------------------------------------------------------------------------

describe('TransformStepForm — parameter slot modes', () => {
  it('AE-06: multiply param slot supports source and literal modes', () => {
    renderForm({ step: makeStep({ functionName: 'multiply', args: [] }) });
    // ArgumentSlotInput renders mode toggle
    const modeToggle = screen.getByTestId('argument-form-multiply')
      .querySelector('[data-testid*="mode-toggle"]');
    expect(modeToggle).toBeInTheDocument();
  });
});
