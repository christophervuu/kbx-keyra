import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComplexExpressionWarning } from './ComplexExpressionWarning';

describe('ComplexExpressionWarning', () => {
  it('renders the reason text', () => {
    render(
      <ComplexExpressionWarning
        reason="Expression nests too deeply (more than 3 levels) for the guided builder."
        onStayInEditor={vi.fn()}
        onTryBuilder={vi.fn()}
      />,
    );
    expect(screen.getByText(/nests too deeply/i)).toBeTruthy();
  });

  it('renders both action buttons', () => {
    render(
      <ComplexExpressionWarning
        reason="Too complex"
        onStayInEditor={vi.fn()}
        onTryBuilder={vi.fn()}
      />,
    );
    expect(screen.getByText(/stay in editor/i)).toBeTruthy();
    expect(screen.getByText(/try builder anyway/i)).toBeTruthy();
  });

  it('calls onStayInEditor when "Stay in Editor" is clicked', () => {
    const onStay = vi.fn();
    render(
      <ComplexExpressionWarning
        reason="Too complex"
        onStayInEditor={onStay}
        onTryBuilder={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText(/stay in editor/i));
    expect(onStay).toHaveBeenCalledOnce();
  });

  it('calls onTryBuilder when "Try Builder anyway" is clicked', () => {
    const onTry = vi.fn();
    render(
      <ComplexExpressionWarning
        reason="Too complex"
        onStayInEditor={vi.fn()}
        onTryBuilder={onTry}
      />,
    );
    fireEvent.click(screen.getByText(/try builder anyway/i));
    expect(onTry).toHaveBeenCalledOnce();
  });

  it('has role="alert" for accessibility', () => {
    render(
      <ComplexExpressionWarning
        reason="Too complex"
        onStayInEditor={vi.fn()}
        onTryBuilder={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('renders data-testid for test targeting', () => {
    render(
      <ComplexExpressionWarning
        reason="Too complex"
        onStayInEditor={vi.fn()}
        onTryBuilder={vi.fn()}
      />,
    );
    expect(screen.getByTestId('complex-expression-warning')).toBeTruthy();
  });
});
