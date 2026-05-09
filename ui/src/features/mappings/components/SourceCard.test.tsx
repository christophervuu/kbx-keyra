import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SourceCard } from './SourceCard';
import {
  makeSingleStepTransform,
  makeChainStep,
  makeLiteralSlot,
  makeSourceSlot,
} from '../lib/expression-builder-state';
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
// Base state (direct copy — no transform)
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

  it('does not render the pipeline in base state', () => {
    renderCard();
    expect(screen.queryByTestId('source-card-pipeline')).not.toBeInTheDocument();
  });

  it('does not render the argument form in base state', () => {
    renderCard();
    expect(screen.queryByTestId('source-card-argument-form')).not.toBeInTheDocument();
  });

  it('does not render any step badges in base state', () => {
    renderCard();
    expect(screen.queryByTestId('source-card-step-badge-0')).not.toBeInTheDocument();
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
// Function picker interaction (initial transform selection)
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

  it('selecting a function calls onStateChange with SourceWithTransformState', async () => {
    const user = userEvent.setup();
    const { onStateChange } = renderCard({ source: 'order.createdAt' });
    await user.click(screen.getByTestId('source-card-add-transform'));
    await user.click(screen.getByTestId('transform-category-date'));
    await user.click(screen.getByTestId('transform-fn-formatDate'));
    expect(onStateChange).toHaveBeenCalledOnce();
    const emitted = onStateChange.mock.calls[0][0];
    expect(emitted.variant).toBe('sourceWithTransform');
    expect(emitted.sourcePath).toBe('order.createdAt');
    // FS-030: transform is now a chain with one step
    expect(emitted.transform.steps).toHaveLength(1);
    expect(emitted.transform.steps[0].functionName).toBe('formatDate');
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
// Single-step transform state (AE-03 backward compat)
// ---------------------------------------------------------------------------

describe('SourceCard — single-step transform state (AE-03)', () => {
  const transform = makeSingleStepTransform('upper');

  it('renders the pipeline when a single-step transform is provided', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-pipeline')).toBeInTheDocument();
  });

  it('renders exactly one step badge', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-step-badge-0')).toBeInTheDocument();
    expect(screen.queryByTestId('source-card-step-badge-1')).not.toBeInTheDocument();
  });

  it('step badge shows the function name', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-step-badge-0')).toHaveTextContent('upper');
  });

  it('step badge has aria-label with step number and function name', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-step-badge-0')).toHaveAttribute(
      'aria-label',
      'Step 1: upper',
    );
  });

  it('renders the argument form area', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-argument-form')).toBeInTheDocument();
  });

  it('renders the [+ Add Step] button', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-add-step')).toBeInTheDocument();
    expect(screen.getByTestId('source-card-add-step')).toHaveTextContent('Add Step');
  });

  it('does not render [+ Add Transformation] when transform is active', () => {
    renderCard({ transform });
    expect(screen.queryByTestId('source-card-add-transform')).not.toBeInTheDocument();
  });

  it('renders the source path even when transform is active', () => {
    renderCard({ source: 'order.email', transform });
    expect(screen.getByTestId('source-card-path')).toHaveTextContent('order.email');
  });

  it('renders the remove step button', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-remove-step-0')).toBeInTheDocument();
  });

  it('remove step button has aria-label with function name', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-remove-step-0')).toHaveAttribute(
      'aria-label',
      'Remove upper step',
    );
  });

  it('does not render a connector after the only step', () => {
    renderCard({ transform });
    expect(screen.queryByTestId('source-card-step-connector-0')).not.toBeInTheDocument();
  });

  it('uses renderArgumentForm render prop when provided', () => {
    const renderArgumentForm = vi.fn().mockReturnValue(
      <div data-testid="custom-argument-form">Custom Form</div>,
    );
    renderCard({ transform, renderArgumentForm });
    expect(screen.getByTestId('custom-argument-form')).toBeInTheDocument();
    expect(renderArgumentForm).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'upper',
        transform,
        sourcePath: 'order.customerName',
        onTransformChange: expect.any(Function),
        stepIndex: 0,
        step: transform.steps[0],
        onStepArgsChange: expect.any(Function),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// AE-01: Multi-step pipeline rendering (3-step chain)
// ---------------------------------------------------------------------------

describe('SourceCard — AE-01: multi-step pipeline rendering', () => {
  const transform: InlineTransform = {
    steps: [
      makeChainStep('divide', [makeSourceSlot('stats.totalFields')]),
      makeChainStep('multiply', [makeLiteralSlot('100')]),
      makeChainStep('round', [makeLiteralSlot('2')]),
    ],
  };

  it('renders 3 step sections', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-step-0')).toBeInTheDocument();
    expect(screen.getByTestId('source-card-step-1')).toBeInTheDocument();
    expect(screen.getByTestId('source-card-step-2')).toBeInTheDocument();
  });

  it('renders 3 step badges with correct function names', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-step-badge-0')).toHaveTextContent('divide');
    expect(screen.getByTestId('source-card-step-badge-1')).toHaveTextContent('multiply');
    expect(screen.getByTestId('source-card-step-badge-2')).toHaveTextContent('round');
  });

  it('step badges have correct aria-labels', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-step-badge-0')).toHaveAttribute('aria-label', 'Step 1: divide');
    expect(screen.getByTestId('source-card-step-badge-1')).toHaveAttribute('aria-label', 'Step 2: multiply');
    expect(screen.getByTestId('source-card-step-badge-2')).toHaveAttribute('aria-label', 'Step 3: round');
  });

  it('renders connectors between steps (not after last)', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-step-connector-0')).toBeInTheDocument();
    expect(screen.getByTestId('source-card-step-connector-1')).toBeInTheDocument();
    expect(screen.queryByTestId('source-card-step-connector-2')).not.toBeInTheDocument();
  });

  it('renders 3 remove step buttons', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-remove-step-0')).toBeInTheDocument();
    expect(screen.getByTestId('source-card-remove-step-1')).toBeInTheDocument();
    expect(screen.getByTestId('source-card-remove-step-2')).toBeInTheDocument();
  });

  it('pipeline has role="list"', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-pipeline')).toHaveAttribute('role', 'list');
  });

  it('steps have role="listitem"', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-step-0')).toHaveAttribute('role', 'listitem');
    expect(screen.getByTestId('source-card-step-1')).toHaveAttribute('role', 'listitem');
    expect(screen.getByTestId('source-card-step-2')).toHaveAttribute('role', 'listitem');
  });

  it('renders [+ Add Step] button', () => {
    renderCard({ transform });
    expect(screen.getByTestId('source-card-add-step')).toBeInTheDocument();
  });

  it('calls renderArgumentForm once per step with correct stepIndex', () => {
    const renderArgumentForm = vi.fn().mockReturnValue(<div />);
    renderCard({ transform, renderArgumentForm });
    expect(renderArgumentForm).toHaveBeenCalledTimes(3);
    expect(renderArgumentForm).toHaveBeenNthCalledWith(1, expect.objectContaining({ stepIndex: 0, step: transform.steps[0] }));
    expect(renderArgumentForm).toHaveBeenNthCalledWith(2, expect.objectContaining({ stepIndex: 1, step: transform.steps[1] }));
    expect(renderArgumentForm).toHaveBeenNthCalledWith(3, expect.objectContaining({ stepIndex: 2, step: transform.steps[2] }));
  });
});

// ---------------------------------------------------------------------------
// AE-02: Add Step appends to chain
// ---------------------------------------------------------------------------

describe('SourceCard — add step', () => {
  it('opens the add-step picker when [+ Add Step] is clicked', async () => {
    const user = userEvent.setup();
    const transform = makeSingleStepTransform('upper');
    renderCard({ transform });
    await user.click(screen.getByTestId('source-card-add-step'));
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
  });

  it('selecting a function from add-step picker appends a new step', async () => {
    const user = userEvent.setup();
    const transform = makeSingleStepTransform('trim');
    const { onStateChange } = renderCard({ source: 'order.name', transform });
    await user.click(screen.getByTestId('source-card-add-step'));
    await user.click(screen.getByTestId('transform-fn-upper'));
    expect(onStateChange).toHaveBeenCalledOnce();
    const emitted = onStateChange.mock.calls[0][0];
    expect(emitted.variant).toBe('sourceWithTransform');
    expect(emitted.transform.steps).toHaveLength(2);
    expect(emitted.transform.steps[0].functionName).toBe('trim');
    expect(emitted.transform.steps[1].functionName).toBe('upper');
  });

  it('closes the add-step picker after selecting a function', async () => {
    const user = userEvent.setup();
    const transform = makeSingleStepTransform('upper');
    renderCard({ transform });
    await user.click(screen.getByTestId('source-card-add-step'));
    await user.click(screen.getByTestId('transform-fn-lower'));
    expect(screen.queryByTestId('transform-function-picker')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AE-09: Remove step mid-chain
// ---------------------------------------------------------------------------

describe('SourceCard — AE-09: remove step mid-chain', () => {
  it('removing the middle step of a 3-step chain leaves 2 steps', async () => {
    const user = userEvent.setup();
    const transform: InlineTransform = {
      steps: [
        makeChainStep('divide', [makeSourceSlot('stats.totalFields')]),
        makeChainStep('multiply', [makeLiteralSlot('100')]),
        makeChainStep('round', [makeLiteralSlot('2')]),
      ],
    };
    const { onStateChange } = renderCard({ source: 'stats.mappedFields', transform });
    await user.click(screen.getByTestId('source-card-remove-step-1'));
    expect(onStateChange).toHaveBeenCalledOnce();
    const emitted = onStateChange.mock.calls[0][0];
    expect(emitted.variant).toBe('sourceWithTransform');
    expect(emitted.transform.steps).toHaveLength(2);
    expect(emitted.transform.steps[0].functionName).toBe('divide');
    expect(emitted.transform.steps[1].functionName).toBe('round');
  });

  it('removing the first step of a 2-step chain leaves 1 step', async () => {
    const user = userEvent.setup();
    const transform: InlineTransform = {
      steps: [makeChainStep('trim'), makeChainStep('upper')],
    };
    const { onStateChange } = renderCard({ source: 'order.name', transform });
    await user.click(screen.getByTestId('source-card-remove-step-0'));
    expect(onStateChange).toHaveBeenCalledOnce();
    const emitted = onStateChange.mock.calls[0][0];
    expect(emitted.variant).toBe('sourceWithTransform');
    expect(emitted.transform.steps).toHaveLength(1);
    expect(emitted.transform.steps[0].functionName).toBe('upper');
  });
});

// ---------------------------------------------------------------------------
// AE-10: Remove all steps reverts to DirectCopy
// ---------------------------------------------------------------------------

describe('SourceCard — AE-10: remove all steps reverts to DirectCopy', () => {
  it('removing the only step calls onStateChange with DirectCopyState', async () => {
    const user = userEvent.setup();
    const transform = makeSingleStepTransform('upper');
    const { onStateChange } = renderCard({ source: 'order.email', transform });
    await user.click(screen.getByTestId('source-card-remove-step-0'));
    expect(onStateChange).toHaveBeenCalledOnce();
    const emitted = onStateChange.mock.calls[0][0];
    expect(emitted.variant).toBe('directCopy');
    expect(emitted.sourcePath).toBe('order.email');
  });

  it('after removing last step, base state is shown (re-render)', async () => {
    const user = userEvent.setup();
    const transform = makeSingleStepTransform('upper');
    const { onStateChange } = renderCard({ source: 'order.email', transform });
    await user.click(screen.getByTestId('source-card-remove-step-0'));
    const emitted = onStateChange.mock.calls[0][0];
    render(
      <SourceCard
        source={emitted.sourcePath}
        onStateChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('source-card-pipeline')).not.toBeInTheDocument();
    expect(screen.queryByTestId('source-card-argument-form')).not.toBeInTheDocument();
    expect(screen.getByTestId('source-card-add-transform')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('SourceCard — accessibility', () => {
  it('remove step button has aria-label with function name', () => {
    const transform = makeSingleStepTransform('upper');
    renderCard({ transform });
    expect(screen.getByTestId('source-card-remove-step-0')).toHaveAttribute(
      'aria-label',
      'Remove upper step',
    );
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

  it('[+ Add Step] button has aria-expanded=false when picker is closed', () => {
    const transform = makeSingleStepTransform('upper');
    renderCard({ transform });
    expect(screen.getByTestId('source-card-add-step')).toHaveAttribute('aria-expanded', 'false');
  });

  it('pipeline has aria-label="Transform pipeline"', () => {
    const transform = makeSingleStepTransform('upper');
    renderCard({ transform });
    expect(screen.getByTestId('source-card-pipeline')).toHaveAttribute('aria-label', 'Transform pipeline');
  });

  it('all interactive elements are keyboard focusable (have no tabIndex=-1)', () => {
    const transform = makeSingleStepTransform('upper');
    renderCard({ source: 'order.email', transform, onRemove: vi.fn() });
    const removeStepBtn = screen.getByTestId('source-card-remove-step-0');
    const removeCardBtn = screen.getByTestId('source-card-remove');
    const addStepBtn = screen.getByTestId('source-card-add-step');
    expect(removeStepBtn).not.toHaveAttribute('tabindex', '-1');
    expect(removeCardBtn).not.toHaveAttribute('tabindex', '-1');
    expect(addStepBtn).not.toHaveAttribute('tabindex', '-1');
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

  it('can activate remove-step button with Enter key', async () => {
    const user = userEvent.setup();
    const transform = makeSingleStepTransform('upper');
    const { onStateChange } = renderCard({ transform });
    const btn = screen.getByTestId('source-card-remove-step-0');
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'directCopy' }),
    );
  });

  it('can activate [+ Add Step] with Enter key', async () => {
    const user = userEvent.setup();
    const transform = makeSingleStepTransform('upper');
    renderCard({ transform });
    const btn = screen.getByTestId('source-card-add-step');
    btn.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Placeholder fallback (no renderArgumentForm provided)
// ---------------------------------------------------------------------------

describe('SourceCard — argument form placeholder', () => {
  it('renders the step placeholder when no renderArgumentForm is provided', () => {
    const transform = makeSingleStepTransform('upper');
    renderCard({ transform });
    expect(screen.getByTestId('argument-form-placeholder-0')).toBeInTheDocument();
  });

  it('placeholder shows implicit first arg with source path for step 0', () => {
    const transform = makeSingleStepTransform('formatDate');
    renderCard({ source: 'order.createdAt', transform });
    expect(screen.getByTestId('argument-form-placeholder-first-arg-0')).toHaveTextContent(
      'source("order.createdAt")',
    );
  });

  it('placeholder shows [output of step N] for subsequent steps', () => {
    const transform: InlineTransform = {
      steps: [makeChainStep('trim'), makeChainStep('upper')],
    };
    renderCard({ source: 'order.name', transform });
    expect(screen.getByTestId('argument-form-placeholder-first-arg-1')).toHaveTextContent(
      '[output of step 1]',
    );
  });
});
