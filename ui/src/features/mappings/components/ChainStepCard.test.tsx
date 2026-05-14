/**
 * ChainStepCard.test.tsx — FS-039 T-07
 *
 * Component tests for ChainStepCard accordion wrapper.
 * Covers all Verification Requirements from T-07.md.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Zap } from 'lucide-react';

import { ChainStepCard } from './ChainStepCard';
import type { ChainStepCardProps } from './ChainStepCard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEFAULT_PROPS: ChainStepCardProps = {
  index: 0,
  isExpanded: false,
  isComplete: true,
  summary: 'upper()',
  stepTypeLabel: 'Transform',
  icon: <Zap className="h-3.5 w-3.5 text-blue-400" />,
  accentColor: 'blue',
  onExpand: vi.fn(),
  onCollapse: vi.fn(),
  onRemove: vi.fn(),
};

function renderCard(overrides: Partial<ChainStepCardProps> = {}) {
  return render(
    <ChainStepCard {...DEFAULT_PROPS} {...overrides}>
      <div data-testid="step-body-content">Step body content</div>
    </ChainStepCard>,
  );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('ChainStepCard — rendering', () => {
  it('renders the step type label', () => {
    renderCard();
    expect(screen.getByText('Transform')).toBeInTheDocument();
  });

  it('renders summary text when collapsed', () => {
    renderCard({ isExpanded: false });
    expect(screen.getByTestId('chain-step-card-0-summary')).toHaveTextContent('upper()');
  });

  it('does not render summary text when expanded', () => {
    renderCard({ isExpanded: true });
    expect(screen.queryByTestId('chain-step-card-0-summary')).not.toBeInTheDocument();
  });

  it('renders body content when expanded', () => {
    renderCard({ isExpanded: true });
    expect(screen.getByTestId('step-body-content')).toBeInTheDocument();
  });

  it('does not render body content when collapsed', () => {
    renderCard({ isExpanded: false });
    expect(screen.queryByTestId('step-body-content')).not.toBeInTheDocument();
  });

  it('renders the remove button', () => {
    renderCard();
    expect(screen.getByTestId('chain-step-card-0-remove')).toBeInTheDocument();
  });

  it('renders the toggle button', () => {
    renderCard();
    expect(screen.getByTestId('chain-step-card-0-toggle')).toBeInTheDocument();
  });

  it('uses custom data-testid when provided', () => {
    renderCard({ 'data-testid': 'my-step-card' });
    expect(screen.getByTestId('my-step-card')).toBeInTheDocument();
    expect(screen.getByTestId('my-step-card-header')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Expand behavior
// ---------------------------------------------------------------------------

describe('ChainStepCard — expand behavior', () => {
  it('calls onExpand when clicking a collapsed card header', () => {
    const onExpand = vi.fn();
    renderCard({ isExpanded: false, onExpand });
    fireEvent.click(screen.getByTestId('chain-step-card-0-header'));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('does not call onExpand when clicking an already-expanded card header', () => {
    const onExpand = vi.fn();
    renderCard({ isExpanded: true, onExpand });
    fireEvent.click(screen.getByTestId('chain-step-card-0-header'));
    expect(onExpand).not.toHaveBeenCalled();
  });

  it('calls onExpand when pressing Enter on a collapsed card header', () => {
    const onExpand = vi.fn();
    renderCard({ isExpanded: false, onExpand });
    fireEvent.keyDown(screen.getByTestId('chain-step-card-0-header'), { key: 'Enter' });
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('calls onExpand when pressing Space on a collapsed card header', () => {
    const onExpand = vi.fn();
    renderCard({ isExpanded: false, onExpand });
    fireEvent.keyDown(screen.getByTestId('chain-step-card-0-header'), { key: ' ' });
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('calls onExpand when clicking the toggle on a collapsed card', () => {
    const onExpand = vi.fn();
    renderCard({ isExpanded: false, onExpand });
    fireEvent.click(screen.getByTestId('chain-step-card-0-toggle'));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Collapse behavior
// ---------------------------------------------------------------------------

describe('ChainStepCard — collapse behavior', () => {
  it('calls onCollapse when clicking the toggle on an expanded, complete card', () => {
    const onCollapse = vi.fn();
    renderCard({ isExpanded: true, isComplete: true, onCollapse });
    fireEvent.click(screen.getByTestId('chain-step-card-0-toggle'));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onCollapse when clicking the toggle on an expanded, incomplete card', () => {
    const onCollapse = vi.fn();
    renderCard({ isExpanded: true, isComplete: false, onCollapse });
    fireEvent.click(screen.getByTestId('chain-step-card-0-toggle'));
    expect(onCollapse).not.toHaveBeenCalled();
  });

  it('toggle button is disabled when expanded and incomplete', () => {
    renderCard({ isExpanded: true, isComplete: false });
    expect(screen.getByTestId('chain-step-card-0-toggle')).toBeDisabled();
  });

  it('toggle button is enabled when expanded and complete', () => {
    renderCard({ isExpanded: true, isComplete: true });
    expect(screen.getByTestId('chain-step-card-0-toggle')).not.toBeDisabled();
  });

  it('toggle button is enabled when collapsed (regardless of completeness)', () => {
    renderCard({ isExpanded: false, isComplete: false });
    expect(screen.getByTestId('chain-step-card-0-toggle')).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Remove behavior
// ---------------------------------------------------------------------------

describe('ChainStepCard — remove behavior', () => {
  it('calls onRemove when clicking the remove button', () => {
    const onRemove = vi.fn();
    renderCard({ onRemove });
    fireEvent.click(screen.getByTestId('chain-step-card-0-remove'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('remove button does not trigger onExpand', () => {
    const onExpand = vi.fn();
    const onRemove = vi.fn();
    renderCard({ isExpanded: false, onExpand, onRemove });
    fireEvent.click(screen.getByTestId('chain-step-card-0-remove'));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onExpand).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('ChainStepCard — accessibility', () => {
  it('header has aria-expanded=false when collapsed', () => {
    renderCard({ isExpanded: false });
    expect(screen.getByTestId('chain-step-card-0-header')).toHaveAttribute('aria-expanded', 'false');
  });

  it('header has aria-expanded=true when expanded', () => {
    renderCard({ isExpanded: true });
    expect(screen.getByTestId('chain-step-card-0-header')).toHaveAttribute('aria-expanded', 'true');
  });

  it('remove button has aria-label', () => {
    renderCard({ index: 2 });
    expect(screen.getByTestId('chain-step-card-2-remove')).toHaveAttribute('aria-label', 'Remove step 3');
  });

  it('toggle button has aria-label for collapse when expanded and complete', () => {
    renderCard({ index: 0, isExpanded: true, isComplete: true });
    expect(screen.getByTestId('chain-step-card-0-toggle')).toHaveAttribute('aria-label', 'Collapse step 1');
  });

  it('toggle button has aria-label indicating cannot collapse when expanded and incomplete', () => {
    renderCard({ index: 0, isExpanded: true, isComplete: false });
    expect(screen.getByTestId('chain-step-card-0-toggle')).toHaveAttribute(
      'aria-label',
      'Step 1 cannot collapse — incomplete',
    );
  });

  it('toggle button has aria-label for expand when collapsed', () => {
    renderCard({ index: 0, isExpanded: false });
    expect(screen.getByTestId('chain-step-card-0-toggle')).toHaveAttribute('aria-label', 'Expand step 1');
  });

  it('collapsed header has tabIndex=0 (keyboard focusable)', () => {
    renderCard({ isExpanded: false });
    expect(screen.getByTestId('chain-step-card-0-header')).toHaveAttribute('tabindex', '0');
  });

  it('expanded header has tabIndex=-1 (not in tab order)', () => {
    renderCard({ isExpanded: true });
    expect(screen.getByTestId('chain-step-card-0-header')).toHaveAttribute('tabindex', '-1');
  });
});

// ---------------------------------------------------------------------------
// Summary text truncation
// ---------------------------------------------------------------------------

describe('ChainStepCard — summary truncation', () => {
  it('renders long summary text in the summary element', () => {
    const longSummary = 'a'.repeat(100);
    renderCard({ isExpanded: false, summary: longSummary });
    // The summary element should be present and contain the text
    const summaryEl = screen.getByTestId('chain-step-card-0-summary');
    expect(summaryEl).toBeInTheDocument();
    // The title attribute should contain the full summary for tooltip
    expect(summaryEl).toHaveAttribute('title', longSummary);
  });
});

// ---------------------------------------------------------------------------
// Accent colors
// ---------------------------------------------------------------------------

describe('ChainStepCard — accent colors', () => {
  it('renders amber accent for condition steps', () => {
    renderCard({ accentColor: 'amber' });
    // Just verify it renders without error
    expect(screen.getByTestId('chain-step-card-0')).toBeInTheDocument();
  });

  it('renders purple accent for value map steps', () => {
    renderCard({ accentColor: 'purple' });
    expect(screen.getByTestId('chain-step-card-0')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Body layout — T-05 full-width parameter layout
// ---------------------------------------------------------------------------

describe('ChainStepCard — body layout (T-05)', () => {
  it('expanded body container has reduced horizontal padding (px-2)', () => {
    renderCard({ isExpanded: true });
    const body = screen.getByTestId('chain-step-card-0-body');
    expect(body).toHaveClass('px-2');
    expect(body).not.toHaveClass('px-3');
  });

  it('body is not rendered when collapsed', () => {
    renderCard({ isExpanded: false });
    expect(screen.queryByTestId('chain-step-card-0-body')).not.toBeInTheDocument();
  });
});
