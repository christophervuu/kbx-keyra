import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { SuggestionReviewCard } from './SuggestionReviewCard';
import type { SuggestionReviewCardProps } from './SuggestionReviewCard';

import type { SuggestionReviewItem } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(overrides?: Partial<SuggestionReviewItem>): SuggestionReviewItem {
  return {
    suggestion: {
      target: 'Order.Header.Currency',
      expression: 'default(source("Invoice.CurrencyCode"), "USD")',
      explanation: 'Uses source currency and falls back to USD.',
      confidence: 'high',
      validation: { valid: true, diagnostics: [] },
    },
    currentExpression: 'source("Invoice.OldCurrency")',
    reviewStatus: 'pending',
    isNew: false,
    ...overrides,
  };
}

function makeProps(overrides?: Partial<SuggestionReviewCardProps>): SuggestionReviewCardProps {
  return {
    item: makeItem(),
    onAccept: vi.fn(),
    onEdit: vi.fn(),
    onDismiss: vi.fn(),
    onUndoDismiss: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SuggestionReviewCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Pending state — content
  // -------------------------------------------------------------------------

  it('renders target path prominently', () => {
    render(<SuggestionReviewCard {...makeProps()} />);
    expect(screen.getByText('Order.Header.Currency')).toBeInTheDocument();
  });

  it('shows "New rule" badge when isNew === true (AE-02)', () => {
    render(<SuggestionReviewCard {...makeProps({ item: makeItem({ isNew: true }) })} />);
    expect(screen.getByText('New rule')).toBeInTheDocument();
  });

  it('shows "Replaces existing" badge when isNew === false (AE-03)', () => {
    render(<SuggestionReviewCard {...makeProps({ item: makeItem({ isNew: false }) })} />);
    expect(screen.getByText('Replaces existing')).toBeInTheDocument();
  });

  it('shows current expression when present', () => {
    render(<SuggestionReviewCard {...makeProps()} />);
    expect(screen.getByText('source("Invoice.OldCurrency")')).toBeInTheDocument();
  });

  it('shows "No existing rule" placeholder when currentExpression is null', () => {
    render(
      <SuggestionReviewCard
        {...makeProps({ item: makeItem({ currentExpression: null }) })}
      />,
    );
    expect(screen.getByText('No existing rule')).toBeInTheDocument();
  });

  it('shows suggested expression', () => {
    render(<SuggestionReviewCard {...makeProps()} />);
    expect(
      screen.getByText('default(source("Invoice.CurrencyCode"), "USD")'),
    ).toBeInTheDocument();
  });

  it('shows explanation text', () => {
    render(<SuggestionReviewCard {...makeProps()} />);
    expect(
      screen.getByText('Uses source currency and falls back to USD.'),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Confidence badges (AE-07)
  // -------------------------------------------------------------------------

  it('shows "High confidence" badge for high confidence', () => {
    render(
      <SuggestionReviewCard
        {...makeProps({ item: makeItem({ suggestion: { ...makeItem().suggestion, confidence: 'high' } }) })}
      />,
    );
    expect(screen.getByText('High confidence')).toBeInTheDocument();
  });

  it('shows "Medium confidence" badge for medium confidence', () => {
    render(
      <SuggestionReviewCard
        {...makeProps({
          item: makeItem({
            suggestion: { ...makeItem().suggestion, confidence: 'medium' },
          }),
        })}
      />,
    );
    expect(screen.getByText('Medium confidence')).toBeInTheDocument();
  });

  it('shows "Low confidence" badge for low confidence', () => {
    render(
      <SuggestionReviewCard
        {...makeProps({
          item: makeItem({
            suggestion: { ...makeItem().suggestion, confidence: 'low' },
          }),
        })}
      />,
    );
    expect(screen.getByText('Low confidence')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Validation badges (AE-07, AE-08, AE-09, AE-14)
  // -------------------------------------------------------------------------

  it('shows "Valid ✓" badge when validation.valid is true and no warnings (AE-07)', () => {
    render(<SuggestionReviewCard {...makeProps()} />);
    expect(screen.getByText('Valid ✓')).toBeInTheDocument();
  });

  it('shows "Warning" badge when valid=true but has warning diagnostics (AE-08)', () => {
    render(
      <SuggestionReviewCard
        {...makeProps({
          item: makeItem({
            suggestion: {
              ...makeItem().suggestion,
              validation: {
                valid: true,
                diagnostics: [{ code: 'W001', severity: 'warning', message: 'Possible null' }],
              },
            },
          }),
        })}
      />,
    );
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('shows "Invalid ✕" badge when validation.valid is false (AE-09)', () => {
    render(
      <SuggestionReviewCard
        {...makeProps({
          item: makeItem({
            suggestion: {
              ...makeItem().suggestion,
              validation: {
                valid: false,
                diagnostics: [{ code: 'E001', severity: 'error', message: 'Type mismatch' }],
              },
            },
          }),
        })}
      />,
    );
    expect(screen.getByText('Invalid ✕')).toBeInTheDocument();
  });

  it('shows no validation badge when validation is absent (AE-14)', () => {
    render(
      <SuggestionReviewCard
        {...makeProps({
          item: makeItem({
            suggestion: {
              ...makeItem().suggestion,
              validation: undefined,
            },
          }),
        })}
      />,
    );
    expect(screen.queryByText('Valid ✓')).not.toBeInTheDocument();
    expect(screen.queryByText('Warning')).not.toBeInTheDocument();
    expect(screen.queryByText('Invalid ✕')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Diagnostics expansion (AE-08)
  // -------------------------------------------------------------------------

  it('shows diagnostics toggle when diagnostics are present', () => {
    render(
      <SuggestionReviewCard
        {...makeProps({
          item: makeItem({
            suggestion: {
              ...makeItem().suggestion,
              validation: {
                valid: true,
                diagnostics: [
                  { code: 'W001', severity: 'warning', message: 'Possible null' },
                  { code: 'W002', severity: 'warning', message: 'Deprecated field' },
                ],
              },
            },
          }),
        })}
      />,
    );
    expect(screen.getByText('Diagnostics (2)')).toBeInTheDocument();
  });

  it('expands diagnostics on toggle click', () => {
    render(
      <SuggestionReviewCard
        {...makeProps({
          item: makeItem({
            suggestion: {
              ...makeItem().suggestion,
              validation: {
                valid: true,
                diagnostics: [{ code: 'W001', severity: 'warning', message: 'Possible null' }],
              },
            },
          }),
        })}
      />,
    );
    fireEvent.click(screen.getByText('Diagnostics (1)'));
    expect(screen.getByText('[W001]')).toBeInTheDocument();
    expect(screen.getByText('Possible null')).toBeInTheDocument();
  });

  it('does not show diagnostics toggle when diagnostics array is empty', () => {
    render(<SuggestionReviewCard {...makeProps()} />);
    expect(screen.queryByText(/Diagnostics/)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Action buttons — pending state
  // -------------------------------------------------------------------------

  it('Accept button calls onAccept with target path', () => {
    const onAccept = vi.fn();
    render(<SuggestionReviewCard {...makeProps({ onAccept })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAccept).toHaveBeenCalledWith('Order.Header.Currency');
  });

  it('Edit button calls onEdit with target path', () => {
    const onEdit = vi.fn();
    render(<SuggestionReviewCard {...makeProps({ onEdit })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith('Order.Header.Currency');
  });

  it('Dismiss button calls onDismiss with target path', () => {
    const onDismiss = vi.fn();
    render(<SuggestionReviewCard {...makeProps({ onDismiss })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledWith('Order.Header.Currency');
  });

  // -------------------------------------------------------------------------
  // Accepted state
  // -------------------------------------------------------------------------

  it('accepted state: shows ✓ indicator and "Accepted" label', () => {
    render(
      <SuggestionReviewCard
        {...makeProps({ item: makeItem({ reviewStatus: 'accepted' }) })}
      />,
    );
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('accepted state: shows the accepted expression', () => {
    render(
      <SuggestionReviewCard
        {...makeProps({ item: makeItem({ reviewStatus: 'accepted' }) })}
      />,
    );
    expect(
      screen.getByText('default(source("Invoice.CurrencyCode"), "USD")'),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Edited state
  // -------------------------------------------------------------------------

  it('edited state: shows "Editing" indicator, no action buttons', () => {
    render(
      <SuggestionReviewCard
        {...makeProps({ item: makeItem({ reviewStatus: 'edited' }) })}
      />,
    );
    expect(screen.getByText('Editing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Dismissed state (AE-05, AE-16)
  // -------------------------------------------------------------------------

  it('dismissed state: shows "Dismissed" label and Undo button, no Accept/Edit/Dismiss buttons', () => {
    render(
      <SuggestionReviewCard
        {...makeProps({ item: makeItem({ reviewStatus: 'dismissed' }) })}
      />,
    );
    expect(screen.getByText('Dismissed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('Undo button on dismissed card calls onUndoDismiss with target path (AE-16)', () => {
    const onUndoDismiss = vi.fn();
    render(
      <SuggestionReviewCard
        {...makeProps({
          item: makeItem({ reviewStatus: 'dismissed' }),
          onUndoDismiss,
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndoDismiss).toHaveBeenCalledWith('Order.Header.Currency');
  });

  // -------------------------------------------------------------------------
  // Expression truncation
  // -------------------------------------------------------------------------

  it('truncates long expressions and shows "Show full" toggle', () => {
    const longExpr = 'source("Invoice.Field")'.padEnd(130, '_');
    render(
      <SuggestionReviewCard
        {...makeProps({
          item: makeItem({
            suggestion: { ...makeItem().suggestion, expression: longExpr },
          }),
        })}
      />,
    );
    expect(screen.getAllByText('Show full').length).toBeGreaterThan(0);
  });

  it('expands truncated expression on "Show full" click', () => {
    const longExpr = 'source("Invoice.Field")' + 'X'.repeat(110);
    render(
      <SuggestionReviewCard
        {...makeProps({
          item: makeItem({
            suggestion: { ...makeItem().suggestion, expression: longExpr },
          }),
        })}
      />,
    );
    const showFullBtns = screen.getAllByText('Show full');
    fireEvent.click(showFullBtns[showFullBtns.length - 1]);
    expect(screen.getByText(longExpr)).toBeInTheDocument();
  });
});
