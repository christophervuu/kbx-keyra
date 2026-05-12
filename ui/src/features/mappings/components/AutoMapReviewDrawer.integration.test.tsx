/**
 * T-05 Integration tests
 *
 * Composes useAutoMapReview + AutoMapReviewDrawer + SuggestionReviewCard
 * to verify that per-suggestion actions and bulk Accept All Valid correctly
 * wire hook state transitions to the rendered UI.
 */
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AutoMapReviewDrawer } from './AutoMapReviewDrawer';
import { SuggestionReviewCard } from './SuggestionReviewCard';
import { useAutoMapReview } from '../hooks/use-auto-map-review';

import type { ApiAdapter } from '@/lib/api/types';
import type {
  AutoMapSectionResult,
  AutoMapSuggestion,
  MappingRule,
} from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUGGESTION_VALID: AutoMapSuggestion = {
  target: 'Order.Header.Currency',
  expression: 'default(source("Invoice.CurrencyCode"), "USD")',
  explanation: 'Uses source currency.',
  confidence: 'high',
  validation: { valid: true, diagnostics: [] },
};

const SUGGESTION_INVALID: AutoMapSuggestion = {
  target: 'Order.Header.Amount',
  expression: 'source("Invoice.InvoiceAmount")',
  explanation: 'Direct mapping.',
  confidence: 'medium',
  validation: { valid: false, diagnostics: [{ code: 'E001', severity: 'error', message: 'Type mismatch' }] },
};

const SUGGESTION_NO_VALIDATION: AutoMapSuggestion = {
  target: 'Order.Header.Reference',
  expression: 'source("Invoice.Reference")',
  explanation: 'Direct mapping.',
  confidence: 'low',
};

const MOCK_RESULT: AutoMapSectionResult = {
  suggestions: [SUGGESTION_VALID, SUGGESTION_INVALID, SUGGESTION_NO_VALIDATION],
};

const MOCK_RULES: MappingRule[] = [
  { id: 'r1', target: 'Order.Header.Currency', expression: 'source("Invoice.OldCurrency")', type: 'direct' },
];

// ---------------------------------------------------------------------------
// Composed test component
// ---------------------------------------------------------------------------

interface TestHarnessProps {
  autoMapSection: ApiAdapter['autoMapSection'];
  updateDraft?: (targetPath: string, expression: string) => void;
  setSelectedTargetPath?: (path: string) => void;
}

function TestHarness({
  autoMapSection,
  updateDraft = vi.fn(),
  setSelectedTargetPath = vi.fn(),
}: TestHarnessProps) {
  const review = useAutoMapReview({
    adapter: { autoMapSection } as unknown as ApiAdapter,
    projectId: 'project-1',
    mappingId: 'mapping-1',
    rules: MOCK_RULES,
    updateDraft,
    setSelectedTargetPath,
    parsedSourceSchema: null,
  });

  return (
    <>
      <button
        type="button"
        data-testid="trigger-btn"
        onClick={() => void review.triggerAutoMap('Order.Header')}
      >
        Trigger
      </button>
      <AutoMapReviewDrawer
        isOpen={review.isDrawerOpen}
        onClose={review.closeDrawer}
        sectionPath={review.sectionPath}
        summary={review.summary}
        onAcceptAllValid={review.acceptAllValid}
      >
        {review.items.map((item) => (
          <SuggestionReviewCard
            key={item.suggestion.target}
            item={item}
            onAccept={review.acceptSuggestion}
            onEdit={review.editSuggestion}
            onDismiss={review.dismissSuggestion}
            onUndoDismiss={review.undoDismiss}
          />
        ))}
      </AutoMapReviewDrawer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderAndTrigger(props: TestHarnessProps) {
  render(<TestHarness {...props} />);
  await act(async () => {
    fireEvent.click(screen.getByTestId('trigger-btn'));
  });
  // Wait for drawer to open
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T-05 Auto-Map Review integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Drawer opens with cards
  // -------------------------------------------------------------------------

  it('drawer opens with suggestion cards after trigger', async () => {
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue(MOCK_RESULT),
    });

    expect(screen.getByText('Order.Header.Currency')).toBeInTheDocument();
    expect(screen.getByText('Order.Header.Amount')).toBeInTheDocument();
    expect(screen.getByText('Order.Header.Reference')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Accept (AE-02, AE-03)
  // -------------------------------------------------------------------------

  it('Accept calls updateDraft with correct target and expression (AE-02)', async () => {
    const updateDraft = vi.fn();
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue(MOCK_RESULT),
      updateDraft,
    });

    const acceptBtns = screen.getAllByRole('button', { name: 'Accept' });
    // First card is Order.Header.Currency
    fireEvent.click(acceptBtns[0]);

    expect(updateDraft).toHaveBeenCalledWith(
      'Order.Header.Currency',
      SUGGESTION_VALID.expression,
    );
  });

  it('after Accept, card shows "Accepted" state (AE-02)', async () => {
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue(MOCK_RESULT),
    });

    const acceptBtns = screen.getAllByRole('button', { name: 'Accept' });
    fireEvent.click(acceptBtns[0]);

    expect(screen.getByText('Accepted')).toBeInTheDocument();
    // Accept/Edit/Dismiss buttons for that card should be gone
    // (other cards still have them, so check count decreased)
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Edit (AE-04)
  // -------------------------------------------------------------------------

  it('Edit calls updateDraft and setSelectedTargetPath (AE-04)', async () => {
    const updateDraft = vi.fn();
    const setSelectedTargetPath = vi.fn();
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue(MOCK_RESULT),
      updateDraft,
      setSelectedTargetPath,
    });

    const editBtns = screen.getAllByRole('button', { name: 'Edit' });
    fireEvent.click(editBtns[0]);

    expect(updateDraft).toHaveBeenCalledWith(
      'Order.Header.Currency',
      SUGGESTION_VALID.expression,
    );
    expect(setSelectedTargetPath).toHaveBeenCalledWith('Order.Header.Currency');
  });

  it('after Edit, card shows "Editing" state (AE-04)', async () => {
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue(MOCK_RESULT),
    });

    const editBtns = screen.getAllByRole('button', { name: 'Edit' });
    fireEvent.click(editBtns[0]);

    expect(screen.getByText('Editing')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Dismiss (AE-05)
  // -------------------------------------------------------------------------

  it('Dismiss does NOT call updateDraft (AE-05)', async () => {
    const updateDraft = vi.fn();
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue(MOCK_RESULT),
      updateDraft,
    });

    const dismissBtns = screen.getAllByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissBtns[0]);

    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('after Dismiss, card shows "Dismissed" state with Undo button (AE-05)', async () => {
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue(MOCK_RESULT),
    });

    const dismissBtns = screen.getAllByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissBtns[0]);

    expect(screen.getByText('Dismissed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Undo Dismiss (AE-16)
  // -------------------------------------------------------------------------

  it('Undo restores dismissed card to pending state (AE-16)', async () => {
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue(MOCK_RESULT),
    });

    // Dismiss first card
    const dismissBtns = screen.getAllByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissBtns[0]);
    expect(screen.getByText('Dismissed')).toBeInTheDocument();

    // Undo
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    // Card should be back to pending — Accept/Edit/Dismiss buttons visible again
    expect(screen.queryByText('Dismissed')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(3);
  });

  it('Undo does NOT call updateDraft (AE-16)', async () => {
    const updateDraft = vi.fn();
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue(MOCK_RESULT),
      updateDraft,
    });

    const dismissBtns = screen.getAllByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissBtns[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(updateDraft).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Accept All Valid (AE-06)
  // -------------------------------------------------------------------------

  it('Accept All Valid accepts only valid/unvalidated pending suggestions (AE-06)', async () => {
    const updateDraft = vi.fn();
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue(MOCK_RESULT),
      updateDraft,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Accept All Valid' }));

    // SUGGESTION_VALID (valid=true) and SUGGESTION_NO_VALIDATION (absent) → accepted
    // SUGGESTION_INVALID (valid=false) → still pending
    expect(updateDraft).toHaveBeenCalledTimes(2);
    expect(updateDraft).toHaveBeenCalledWith(
      'Order.Header.Currency',
      SUGGESTION_VALID.expression,
    );
    expect(updateDraft).toHaveBeenCalledWith(
      'Order.Header.Reference',
      SUGGESTION_NO_VALIDATION.expression,
    );
    // Invalid suggestion still has action buttons
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(1);
  });

  it('invalid suggestion remains pending after Accept All Valid (AE-06)', async () => {
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue(MOCK_RESULT),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Accept All Valid' }));

    // Order.Header.Amount (invalid) should still show Accept button
    expect(screen.getByText('Order.Header.Amount')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(1);
  });

  it('"Accept All Valid" button is disabled when no pending valid suggestions remain', async () => {
    // Only one suggestion, invalid — Accept All Valid should be disabled after trigger
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue({
        suggestions: [SUGGESTION_INVALID],
      }),
    });

    // Dismiss the invalid one to make pending=0
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.getByRole('button', { name: 'Accept All Valid' })).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // Completion summary (AE-13)
  // -------------------------------------------------------------------------

  it('completion banner appears when all suggestions are resolved (AE-13)', async () => {
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue({
        suggestions: [SUGGESTION_VALID, SUGGESTION_NO_VALIDATION],
      }),
    });

    // Accept all
    fireEvent.click(screen.getByRole('button', { name: 'Accept All Valid' }));

    expect(screen.getByTestId('completion-banner')).toBeInTheDocument();
    expect(screen.getByText(/All 2 suggestions reviewed/)).toBeInTheDocument();
    expect(screen.getByText('2 accepted')).toBeInTheDocument();
  });

  it('completion banner shows breakdown omitting zero-count categories', async () => {
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue({
        suggestions: [SUGGESTION_VALID],
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Accept All Valid' }));

    expect(screen.getByTestId('completion-banner')).toBeInTheDocument();
    // Only accepted, no edited or dismissed
    expect(screen.getByText('1 accepted')).toBeInTheDocument();
    expect(screen.queryByText(/edited/)).not.toBeInTheDocument();
    expect(screen.queryByText(/dismissed/)).not.toBeInTheDocument();
  });

  it('completion banner does not appear when some suggestions are still pending', async () => {
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue(MOCK_RESULT),
    });

    // Accept only one
    const acceptBtns = screen.getAllByRole('button', { name: 'Accept' });
    fireEvent.click(acceptBtns[0]);

    expect(screen.queryByTestId('completion-banner')).not.toBeInTheDocument();
  });

  it('"Accept All Valid" button is disabled when completion banner is shown', async () => {
    await renderAndTrigger({
      autoMapSection: vi.fn().mockResolvedValue({
        suggestions: [SUGGESTION_VALID],
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Accept All Valid' }));

    expect(screen.getByRole('button', { name: 'Accept All Valid' })).toBeDisabled();
  });
});
