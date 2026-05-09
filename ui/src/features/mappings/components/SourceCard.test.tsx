import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SourceCard } from './SourceCard';
import type { InlineTransform } from '../lib/expression-builder-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderCard(overrides: Partial<React.ComponentProps<typeof SourceCard>> = {}) {
  const onStateChange = vi.fn();
  const defaults: React.ComponentProps<typeof SourceCard> = {
    source: 'order.customerName',
    onStateChange,
  };
  render(<SourceCard {...defaults} {...overrides} />);
  return { onStateChange };
}

// ---------------------------------------------------------------------------
// Base state (AE-01: direct copy)
// ---------------------------------------------------------------------------

describe('SourceCard — base state', () => {
  it('renders the source path', () => {
    renderCard({ source: 'order.customerName' });
    expect(screen.getByTestId('source-card-path')).toHaveTextContent('order.customerName');
  });

  it('renders the [+ Add Transformation] button', () => {
    renderCard();
    expect(screen.getByTestId('source-card-add-transform')).toBeInTheDocument();
    expect(screen.getByTestId('source-card-add-transform')).toHaveTextContent('Add Transformation');
  });

  it('does not render the transform badge in base state', () => {
    renderCard();
    expect(screen.queryByTestId('source-card-transform-badge')).not.toBeInTheDocument();
  });

  it('does not render the argument form in base state', () => {
    renderCard();
    expect(screen.queryByTestId('source-card-argument-form')).not.toBeInTheDocument();
  });

  it('does not render remove-transform button in base state', () => {
    renderCard();
    expect(screen.queryByTestId('source-card-remove-transform')).not.toBeInTheDocument();
  });

  it('renders the remove card button when onRemove is provided', () => {
    renderCard({ onRemove: vi.fn() });
    expect(screen.getByTestId('source-card-remove')).toBeInTheDocument();
  });

  it('does not render the remove card button when onRemove is not provided', () => {
    renderCard();
    expect(screen.queryByTestId('source-card-remove')).not.toBeInTheDocument();
  });

  it('calls onRemove when remove card button is clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    renderCard({ onRemove });
    await user.click(screen.getByTestId('source-card-remove'));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Function picker interaction
// ---------------------------------------------------------------------------

describe('SourceCard — function picker', () => {
  it('opens the function picker when [+ Add Transformation] is clicked', async () => {
    const user = userEvent.setup();
    renderCard();
    expect(screen.queryByTestId('transform-function-picker')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('source-card-add-transform'));
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
  });

  it('closes the function picker when cancel is clicked', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByTestId('source-card-add-transform'));
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
    await user.click(screen.getByTestId('transform-function-picker-close'));
    expect(screen.queryByTestId('transform-function-picker')).not.toBeInTheDocument();
  });

  it('AE-02: selecting a function calls onStateChange with SourceWithTransformState', async () => {
    const user = userEvent.setup();
    const { onStateChange } = renderCard({ source: 'order.createdAt' });
    await user.click(screen.getByTestId('source-card-add-transform'));
    // formatDate is in the Date category — expand it first
    await user.click(screen.getByTestId('transform-category-date'));
    await user.click(screen.getByTestId('transform-fn-formatDate'));
    expect(onStateChange).toHaveBeenCalledOnce();
    const emitted = onStateChange.mock.calls[0][0];
    expect(emitted.variant).toBe('sourceWithTransform');
    expect(emitted.sourcePath).toBe('order.createdAt');
    expect(emitted.transform.functionName).toBe('formatDate');
  });

  it('selecting a function closes the picker', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByTestId('source-card-add-transform'));
    await user.click(screen.getByTestId('transform-fn-upper'));
    expect(screen.queryByTestId('transform-function-picker')).not.toBeInTheDocument();
  });

  it('selecting a function hides the [+ Add Transformation] button', async () => {
    const user = userEvent.setup();
    const { onStateChange } = renderCard({ source: 'order.email' });
    await user.click(screen.getByTestId('source-card-add-transform'));
    await user.click(screen.getByTestId('transform-fn-upper'));
    // After selection, onStateChange was called — re-render with the new state
    const emitted = onStateChange.mock.calls[0][0];
    render(
      <SourceCard
        source={emitted.sourcePath}
        transform={emitted.transform}
        onStateChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('source-card-add-transform')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Transform state (AE-02: source + transform)
// ---------------------------------------------------------------------------

describe('SourceCard — transform state', () => {
  const transform: InlineTransform = { functionName: 'upper', args: [] };

  it('renders the transform badge when transform is provided', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-transform-badge')).toBeInTheDocument();
    expect(screen.getByTestId('source-card-transform-badge')).toHaveTextContent('upper');
  });

  it('renders the argument form area when transform is provided', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-argument-form')).toBeInTheDocument();
  });

  it('renders the remove-transform button when transform is provided', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-remove-transform')).toBeInTheDocument();
  });

  it('does not render [+ Add Transformation] when transform is active', () => {
    renderCard({ transform });
    expect(screen.queryByTestId('source-card-add-transform')).not.toBeInTheDocument();
  });

  it('renders the source path even when transform is active', () => {
    renderCard({ source: 'order.email', transform });
    expect(screen.getByTestId('source-card-path')).toHaveTextContent('order.email');
  });

  it('AE-02: renders the argument form placeholder with function name', () => {
    const formatDateTransform: InlineTransform = { functionName: 'formatDate', args: [] };
    renderCard({ source: 'order.createdAt', transform: formatDateTransform });
    expect(screen.getByTestId('argument-form-placeholder')).toBeInTheDocument();
    expect(screen.getByTestId('argument-form-placeholder')).toHaveTextContent('formatDate');
  });

  it('AE-02: argument form placeholder shows first arg pre-filled with source path', () => {
    const formatDateTransform: InlineTransform = { functionName: 'formatDate', args: [] };
    renderCard({ source: 'order.createdAt', transform: formatDateTransform });
    const firstArg = screen.getByTestId('argument-form-placeholder-first-arg');
    expect(firstArg).toHaveTextContent('source("order.createdAt")');
  });

  it('uses renderArgumentForm render prop when provided', () => {
    const renderArgumentForm = vi.fn().mockReturnValue(
      <div data-testid="custom-argument-form">Custom Form</div>,
    );
    renderCard({ transform, renderArgumentForm });
    expect(screen.getByTestId('custom-argument-form')).toBeInTheDocument();
    expect(screen.queryByTestId('argument-form-placeholder')).not.toBeInTheDocument();
    expect(renderArgumentForm).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'upper',
        transform,
        sourcePath: 'order.customerName',
        onTransformChange: expect.any(Function),
      }),
    );
  });

  it('renderArgumentForm receives onTransformChange that emits SourceWithTransformState', () => {
    const { onStateChange } = renderCard({ source: 'order.email', transform });
    // Simulate the render prop calling onTransformChange
    let capturedOnTransformChange: ((t: InlineTransform) => void) | undefined;
    const renderArgumentForm = vi.fn().mockImplementation(
      ({ onTransformChange }: { onTransformChange: (t: InlineTransform) => void }) => {
        capturedOnTransformChange = onTransformChange;
        return <div />;
      },
    );
    render(
      <SourceCard
        source="order.email"
        transform={transform}
        onStateChange={onStateChange}
        renderArgumentForm={renderArgumentForm}
      />,
    );
    const updatedTransform: InlineTransform = {
      functionName: 'upper',
      args: [{ mode: 'literal', value: 'test' }],
    };
    capturedOnTransformChange!(updatedTransform);
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'sourceWithTransform',
        sourcePath: 'order.email',
        transform: updatedTransform,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// AE-06: Removing transformation returns to source card base state
// ---------------------------------------------------------------------------

describe('SourceCard — AE-06: remove transformation', () => {
  const transform: InlineTransform = { functionName: 'upper', args: [] };

  it('clicking remove-transform calls onStateChange with DirectCopyState', async () => {
    const user = userEvent.setup();
    const { onStateChange } = renderCard({ source: 'order.email', transform });
    await user.click(screen.getByTestId('source-card-remove-transform'));
    expect(onStateChange).toHaveBeenCalledOnce();
    const emitted = onStateChange.mock.calls[0][0];
    expect(emitted.variant).toBe('directCopy');
    expect(emitted.sourcePath).toBe('order.email');
  });

  it('after removing transform, base state is shown (re-render)', async () => {
    const user = userEvent.setup();
    const { onStateChange } = renderCard({ source: 'order.email', transform });
    await user.click(screen.getByTestId('source-card-remove-transform'));
    const emitted = onStateChange.mock.calls[0][0];
    // Re-render with the emitted state (no transform)
    render(
      <SourceCard
        source={emitted.sourcePath}
        onStateChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('source-card-transform-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('source-card-argument-form')).not.toBeInTheDocument();
    expect(screen.getByTestId('source-card-add-transform')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('SourceCard — accessibility', () => {
  it('remove-transform button has aria-label', () => {
    const transform: InlineTransform = { functionName: 'upper', args: [] };
    renderCard({ transform });
    const btn = screen.getByTestId('source-card-remove-transform');
    expect(btn).toHaveAttribute('aria-label', 'Remove upper transformation');
  });

  it('remove card button has aria-label', () => {
    renderCard({ source: 'order.email', onRemove: vi.fn() });
    const btn = screen.getByTestId('source-card-remove');
    expect(btn).toHaveAttribute('aria-label', 'Remove source order.email');
  });

  it('[+ Add Transformation] button has aria-expanded=false when picker is closed', () => {
    renderCard();
    const btn = screen.getByTestId('source-card-add-transform');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('[+ Add Transformation] button has aria-expanded=true when picker is open', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByTestId('source-card-add-transform'));
    expect(screen.getByTestId('source-card-add-transform')).toHaveAttribute('aria-expanded', 'true');
  });

  it('transform badge has aria-label', () => {
    const transform: InlineTransform = { functionName: 'formatDate', args: [] };
    renderCard({ transform });
    expect(screen.getByTestId('source-card-transform-badge')).toHaveAttribute(
      'aria-label',
      'Transform: formatDate',
    );
  });

  it('all interactive elements are keyboard focusable (have no tabIndex=-1)', () => {
    const transform: InlineTransform = { functionName: 'upper', args: [] };
    renderCard({ source: 'order.email', transform, onRemove: vi.fn() });
    const removeTransformBtn = screen.getByTestId('source-card-remove-transform');
    const removeCardBtn = screen.getByTestId('source-card-remove');
    expect(removeTransformBtn).not.toHaveAttribute('tabindex', '-1');
    expect(removeCardBtn).not.toHaveAttribute('tabindex', '-1');
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

describe('SourceCard — keyboard navigation', () => {
  it('can activate [+ Add Transformation] with Enter key', async () => {
    const user = userEvent.setup();
    renderCard();
    const btn = screen.getByTestId('source-card-add-transform');
    btn.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
  });

  it('can activate [+ Add Transformation] with Space key', async () => {
    const user = userEvent.setup();
    renderCard();
    const btn = screen.getByTestId('source-card-add-transform');
    btn.focus();
    await user.keyboard(' ');
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
  });

  it('can activate remove-transform button with Enter key', async () => {
    const user = userEvent.setup();
    const transform: InlineTransform = { functionName: 'upper', args: [] };
    const { onStateChange } = renderCard({ transform });
    const btn = screen.getByTestId('source-card-remove-transform');
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'directCopy' }),
    );
  });
});
