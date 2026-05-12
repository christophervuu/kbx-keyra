import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AutoMapReviewDrawer } from './AutoMapReviewDrawer';
import type { AutoMapReviewDrawerProps } from './AutoMapReviewDrawer';

import type { AutoMapReviewSummary } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSummary(overrides?: Partial<AutoMapReviewSummary>): AutoMapReviewSummary {
  return {
    total: 3,
    pending: 3,
    accepted: 0,
    edited: 0,
    dismissed: 0,
    validCount: 1,
    warningCount: 1,
    invalidCount: 1,
    highConfidence: 1,
    mediumConfidence: 1,
    lowConfidence: 1,
    ...overrides,
  };
}

function makeProps(overrides?: Partial<AutoMapReviewDrawerProps>): AutoMapReviewDrawerProps {
  return {
    isOpen: true,
    onClose: vi.fn(),
    sectionPath: 'Order.Header',
    summary: makeSummary(),
    onAcceptAllValid: vi.fn(),
    children: <div data-testid="suggestion-cards">Cards here</div>,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutoMapReviewDrawer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it('renders with role="dialog" and aria-modal="true" when open', () => {
    render(<AutoMapReviewDrawer {...makeProps()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Auto-Map Review');
  });

  it('does not render when isOpen is false', () => {
    render(<AutoMapReviewDrawer {...makeProps({ isOpen: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders section path in subtitle', () => {
    render(<AutoMapReviewDrawer {...makeProps({ sectionPath: 'Order.Header' })} />);
    expect(screen.getByTestId('section-path-subtitle')).toHaveTextContent('Order.Header');
  });

  it('does not render section path subtitle when sectionPath is null', () => {
    render(<AutoMapReviewDrawer {...makeProps({ sectionPath: null })} />);
    expect(screen.queryByTestId('section-path-subtitle')).not.toBeInTheDocument();
  });

  it('renders children in scrollable area', () => {
    render(<AutoMapReviewDrawer {...makeProps()} />);
    expect(screen.getByTestId('suggestion-cards')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Summary badges
  // -------------------------------------------------------------------------

  it('renders valid badge when validCount > 0', () => {
    render(<AutoMapReviewDrawer {...makeProps({ summary: makeSummary({ validCount: 2 }) })} />);
    expect(screen.getByText('2 valid')).toBeInTheDocument();
  });

  it('renders warnings badge when warningCount > 0', () => {
    render(<AutoMapReviewDrawer {...makeProps({ summary: makeSummary({ warningCount: 1 }) })} />);
    expect(screen.getByText('1 warning')).toBeInTheDocument();
  });

  it('renders invalid badge when invalidCount > 0', () => {
    render(<AutoMapReviewDrawer {...makeProps({ summary: makeSummary({ invalidCount: 3 }) })} />);
    expect(screen.getByText('3 invalid')).toBeInTheDocument();
  });

  it('renders plural warnings badge correctly', () => {
    render(<AutoMapReviewDrawer {...makeProps({ summary: makeSummary({ warningCount: 2 }) })} />);
    expect(screen.getByText('2 warnings')).toBeInTheDocument();
  });

  it('does not render valid badge when validCount is 0', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({ summary: makeSummary({ validCount: 0, warningCount: 1, invalidCount: 1 }) })}
      />,
    );
    // "X valid" badge should not appear (but "X invalid" may still be present)
    expect(screen.queryByText(/^\d+ valid$/)).not.toBeInTheDocument();
  });

  it('shows total suggestions badge when no validation data exists', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({
          summary: makeSummary({ validCount: 0, warningCount: 0, invalidCount: 0, total: 5 }),
        })}
      />,
    );
    expect(screen.getByText('5 suggestions')).toBeInTheDocument();
  });

  it('shows singular "suggestion" when total is 1 and no validation data', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({
          summary: makeSummary({ validCount: 0, warningCount: 0, invalidCount: 0, total: 1 }),
        })}
      />,
    );
    expect(screen.getByText('1 suggestion')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Close button
  // -------------------------------------------------------------------------

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<AutoMapReviewDrawer {...makeProps({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close Auto-Map review' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Backdrop click (AE-12 adjacent)
  // -------------------------------------------------------------------------

  it('backdrop click calls onClose', () => {
    const onClose = vi.fn();
    render(<AutoMapReviewDrawer {...makeProps({ onClose })} />);
    // Backdrop is aria-hidden, query by its unique class combination
    const backdrop = document.querySelector('.fixed.inset-0.z-40');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Escape key (AE-12)
  // -------------------------------------------------------------------------

  it('Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(<AutoMapReviewDrawer {...makeProps({ onClose })} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape key does not call onClose when drawer is closed', () => {
    const onClose = vi.fn();
    render(<AutoMapReviewDrawer {...makeProps({ isOpen: false, onClose })} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Bulk actions bar
  // -------------------------------------------------------------------------

  it('"Accept All Valid" button calls onAcceptAllValid', () => {
    const onAcceptAllValid = vi.fn();
    render(<AutoMapReviewDrawer {...makeProps({ onAcceptAllValid })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept All Valid' }));
    expect(onAcceptAllValid).toHaveBeenCalledTimes(1);
  });

  it('"Accept All Valid" button is disabled when summary.pending === 0', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({ summary: makeSummary({ pending: 0 }) })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Accept All Valid' })).toBeDisabled();
  });

  it('"Accept All Valid" button is enabled when pending > 0', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({ summary: makeSummary({ pending: 2 }) })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Accept All Valid' })).not.toBeDisabled();
  });

  it('shows "Accept All" label when no validation data exists', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({
          summary: makeSummary({ validCount: 0, warningCount: 0, invalidCount: 0 }),
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Accept All' })).toBeInTheDocument();
  });

  it('shows progress text when at least 1 suggestion is accepted', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({ summary: makeSummary({ accepted: 2, total: 3 }) })}
      />,
    );
    expect(screen.getByText('2 of 3 accepted')).toBeInTheDocument();
  });

  it('does not show progress text when accepted is 0', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({ summary: makeSummary({ accepted: 0 }) })}
      />,
    );
    expect(screen.queryByText(/of \d+ accepted/)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Focus trap: first focusable element receives focus on mount
  // -------------------------------------------------------------------------

  it('focuses the close button on mount', () => {
    render(<AutoMapReviewDrawer {...makeProps()} />);
    const closeBtn = screen.getByRole('button', { name: 'Close Auto-Map review' });
    expect(document.activeElement).toBe(closeBtn);
  });
});

// ---------------------------------------------------------------------------
// T-07: Loading, empty, error, and completion states
// ---------------------------------------------------------------------------

describe('AutoMapReviewDrawer — loading state (AE-15)', () => {
  it('renders loading state with spinner and section path message', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({ status: 'loading', sectionPath: 'Order.Header' })}
      />,
    );
    const loadingState = screen.getByTestId('drawer-loading-state');
    expect(loadingState).toBeInTheDocument();
    expect(loadingState).toHaveTextContent('Generating suggestions');
    expect(loadingState).toHaveTextContent('Order.Header');
    expect(screen.getByText('This may take a moment.')).toBeInTheDocument();
  });

  it('hides bulk actions bar during loading', () => {
    render(<AutoMapReviewDrawer {...makeProps({ status: 'loading' })} />);
    expect(screen.queryByRole('button', { name: 'Accept All Valid' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept All' })).not.toBeInTheDocument();
  });

  it('does not render children during loading', () => {
    render(<AutoMapReviewDrawer {...makeProps({ status: 'loading' })} />);
    expect(screen.queryByTestId('suggestion-cards')).not.toBeInTheDocument();
  });

  it('still shows section path subtitle during loading', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({ status: 'loading', sectionPath: 'Order.Header' })}
      />,
    );
    expect(screen.getByTestId('section-path-subtitle')).toHaveTextContent('Order.Header');
  });
});

describe('AutoMapReviewDrawer — empty state (AE-10)', () => {
  it('renders empty state when status=success and itemCount=0', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({
          status: 'success',
          itemCount: 0,
          summary: makeSummary({ total: 0, pending: 0 }),
        })}
      />,
    );
    expect(screen.getByTestId('drawer-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No suggestions generated')).toBeInTheDocument();
  });

  it('empty state Close button calls onClose', () => {
    const onClose = vi.fn();
    render(
      <AutoMapReviewDrawer
        {...makeProps({
          status: 'success',
          itemCount: 0,
          summary: makeSummary({ total: 0, pending: 0 }),
          onClose,
        })}
      />,
    );
    // There are two Close buttons (header X + empty state Close) — click the text one
    const closeBtns = screen.getAllByRole('button', { name: /close/i });
    // The empty state "Close" button is the last one
    fireEvent.click(closeBtns[closeBtns.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not render children in empty state', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({
          status: 'success',
          itemCount: 0,
          summary: makeSummary({ total: 0, pending: 0 }),
        })}
      />,
    );
    expect(screen.queryByTestId('suggestion-cards')).not.toBeInTheDocument();
  });
});

describe('AutoMapReviewDrawer — error state (AE-11)', () => {
  it('renders error state with error message', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({
          status: 'error',
          error: 'Could not reach the Auto-Map service. Check your connection and try again.',
        })}
      />,
    );
    expect(screen.getByTestId('drawer-error-state')).toBeInTheDocument();
    expect(screen.getByText('Failed to generate suggestions')).toBeInTheDocument();
    expect(
      screen.getByText('Could not reach the Auto-Map service. Check your connection and try again.'),
    ).toBeInTheDocument();
  });

  it('error state has role="alert" for accessibility', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({ status: 'error', error: 'Something went wrong.' })}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('"Try Again" button calls onRetry', () => {
    const onRetry = vi.fn();
    render(
      <AutoMapReviewDrawer
        {...makeProps({ status: 'error', error: 'Network error.', onRetry })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('"Try Again" button not rendered when onRetry is absent', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({ status: 'error', error: 'Network error.' })}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
  });

  it('error state Close button calls onClose', () => {
    const onClose = vi.fn();
    render(
      <AutoMapReviewDrawer
        {...makeProps({ status: 'error', error: 'Network error.', onClose })}
      />,
    );
    const closeBtns = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closeBtns[closeBtns.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });

  it('hides bulk actions bar during error state', () => {
    render(<AutoMapReviewDrawer {...makeProps({ status: 'error', error: 'Oops.' })} />);
    expect(screen.queryByRole('button', { name: 'Accept All Valid' })).not.toBeInTheDocument();
  });

  it('does not render children during error state', () => {
    render(<AutoMapReviewDrawer {...makeProps({ status: 'error', error: 'Oops.' })} />);
    expect(screen.queryByTestId('suggestion-cards')).not.toBeInTheDocument();
  });

  it('shows fallback message when error prop is null', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({ status: 'error', error: null })}
      />,
    );
    expect(
      screen.getByText('An unexpected error occurred. Please try again.'),
    ).toBeInTheDocument();
  });
});

describe('AutoMapReviewDrawer — completion banner (AE-13)', () => {
  it('renders completion banner when pending=0 and total>0', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({
          status: 'success',
          itemCount: 2,
          summary: makeSummary({ total: 2, pending: 0, accepted: 2 }),
        })}
      />,
    );
    expect(screen.getByTestId('completion-banner')).toBeInTheDocument();
    expect(screen.getByText(/All 2 suggestions reviewed/)).toBeInTheDocument();
  });

  it('completion banner shows accepted count', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({
          status: 'success',
          itemCount: 3,
          summary: makeSummary({ total: 3, pending: 0, accepted: 2, dismissed: 1 }),
        })}
      />,
    );
    expect(screen.getByText('2 accepted, 1 dismissed')).toBeInTheDocument();
  });

  it('completion banner does not appear when pending > 0', () => {
    render(
      <AutoMapReviewDrawer
        {...makeProps({
          status: 'success',
          itemCount: 3,
          summary: makeSummary({ total: 3, pending: 1, accepted: 2 }),
        })}
      />,
    );
    expect(screen.queryByTestId('completion-banner')).not.toBeInTheDocument();
  });
});
