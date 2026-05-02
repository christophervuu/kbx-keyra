import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BuilderStepIndicator } from './BuilderStepIndicator';

const LABELS = ['Source', 'Transform', 'Arguments', 'Preview'];

describe('BuilderStepIndicator', () => {
  it('renders the correct number of step circles', () => {
    render(
      <BuilderStepIndicator currentStep={1} totalSteps={4} stepLabels={LABELS} />,
    );
    // 4 buttons — one per step
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
  });

  it('marks the active step with aria-current="step"', () => {
    render(
      <BuilderStepIndicator currentStep={2} totalSteps={4} stepLabels={LABELS} />,
    );
    const activeBtn = screen.getByRole('button', { name: /Transform.*current step/i });
    expect(activeBtn).toHaveAttribute('aria-current', 'step');
  });

  it('shows step labels', () => {
    render(
      <BuilderStepIndicator currentStep={1} totalSteps={4} stepLabels={LABELS} />,
    );
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Transform')).toBeInTheDocument();
    expect(screen.getByText('Arguments')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('shows checkmark on completed steps', () => {
    render(
      <BuilderStepIndicator currentStep={3} totalSteps={4} stepLabels={LABELS} />,
    );
    // Steps 1 and 2 are completed
    const step1Btn = screen.getByRole('button', { name: /Source.*completed/i });
    expect(step1Btn).toHaveTextContent('✓');
    const step2Btn = screen.getByRole('button', { name: /Transform.*completed/i });
    expect(step2Btn).toHaveTextContent('✓');
  });

  it('shows step numbers for active and pending steps', () => {
    render(
      <BuilderStepIndicator currentStep={1} totalSteps={4} stepLabels={LABELS} />,
    );
    // All steps are pending or active — show numbers, no checkmarks
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
  });

  it('calls onStepClick with correct step number when a completed step is clicked', () => {
    const onStepClick = vi.fn();
    render(
      <BuilderStepIndicator
        currentStep={3}
        totalSteps={4}
        stepLabels={LABELS}
        onStepClick={onStepClick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Source.*completed/i }));
    expect(onStepClick).toHaveBeenCalledWith(1);
  });

  it('does not call onStepClick for active or pending steps', () => {
    const onStepClick = vi.fn();
    render(
      <BuilderStepIndicator
        currentStep={2}
        totalSteps={4}
        stepLabels={LABELS}
        onStepClick={onStepClick}
      />,
    );
    // Click on active step (step 2)
    fireEvent.click(screen.getByRole('button', { name: /Transform.*current step/i }));
    expect(onStepClick).not.toHaveBeenCalled();
  });

  it('applies nav aria-label "Builder steps"', () => {
    render(
      <BuilderStepIndicator currentStep={1} totalSteps={4} stepLabels={LABELS} />,
    );
    expect(screen.getByRole('navigation', { name: 'Builder steps' })).toBeInTheDocument();
  });
});
