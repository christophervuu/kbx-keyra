import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExpressionPreviewStep } from './ExpressionPreviewStep';

describe('ExpressionPreviewStep', () => {
  it('renders the expression in a highlighted container', () => {
    render(
      <ExpressionPreviewStep
        expression='source("order.name")'
        isValid
        onUseExpression={vi.fn()}
      />,
    );
    const preview = screen.getByTestId('expression-preview-highlighted');
    expect(preview.textContent).toContain('source');
    expect(preview.textContent).toContain('order.name');
  });

  it('shows valid indicator when isValid=true', () => {
    render(
      <ExpressionPreviewStep
        expression='source("x")'
        isValid
        onUseExpression={vi.fn()}
      />,
    );
    const status = screen.getByTestId('expression-validation-status');
    expect(status.textContent).toContain('valid');
    expect(status.className).toContain('green');
  });

  it('shows error indicator and message when isValid=false', () => {
    render(
      <ExpressionPreviewStep
        expression='invalid('
        isValid={false}
        validationError="Unexpected end of input"
        onUseExpression={vi.fn()}
      />,
    );
    const status = screen.getByTestId('expression-validation-status');
    expect(status.textContent).toContain('Unexpected end of input');
    expect(status.className).toContain('red');
  });

  it('shows generic error message when validationError not provided', () => {
    render(
      <ExpressionPreviewStep
        expression=''
        isValid={false}
        onUseExpression={vi.fn()}
      />,
    );
    expect(screen.getByText('Expression contains errors')).toBeInTheDocument();
  });

  it('"Use Expression" button is enabled when isValid=true and calls onUseExpression', () => {
    const onUse = vi.fn();
    render(
      <ExpressionPreviewStep
        expression='source("x")'
        isValid
        onUseExpression={onUse}
      />,
    );
    const btn = screen.getByTestId('use-expression-btn');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onUse).toHaveBeenCalledOnce();
  });

  it('"Use Expression" button is disabled when isValid=false', () => {
    render(
      <ExpressionPreviewStep
        expression='broken('
        isValid={false}
        onUseExpression={vi.fn()}
      />,
    );
    expect(screen.getByTestId('use-expression-btn')).toBeDisabled();
  });

  it('"Copy" button is rendered', () => {
    render(
      <ExpressionPreviewStep
        expression='source("x")'
        isValid
        onUseExpression={vi.fn()}
      />,
    );
    expect(screen.getByTestId('copy-expression-btn')).toBeInTheDocument();
  });

  it('shows evaluation placeholder text', () => {
    render(
      <ExpressionPreviewStep
        expression='source("x")'
        isValid
        onUseExpression={vi.fn()}
      />,
    );
    expect(screen.getByText(/load sample data/i)).toBeInTheDocument();
  });
});
