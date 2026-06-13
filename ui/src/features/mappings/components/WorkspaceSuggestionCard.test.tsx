import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SuggestionWorkspaceItem } from '../types';
import { WorkspaceSuggestionCard } from './WorkspaceSuggestionCard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<SuggestionWorkspaceItem> = {}): SuggestionWorkspaceItem {
  return {
    targetPath: 'Order.Id',
    suggestedExpression: 'source.orderId',
    explanation: 'Maps the order identifier',
    confidence: 'high',
    status: 'suggested',
    isNew: true,
    existingExpressionAtGeneration: null,
    ...overrides,
  };
}

const DEFAULT_CALLBACKS = {
  onToggleExpand: vi.fn(),
  onAccept: vi.fn(),
  onEdit: vi.fn(),
  onDismiss: vi.fn(),
  onUndoDismiss: vi.fn(),
};

function renderCard(
  item: SuggestionWorkspaceItem,
  isExpanded = true,
  callbacks = DEFAULT_CALLBACKS,
  extra: Partial<{ onRefreshItem: (p: string) => void; previewSlot: React.ReactNode }> = {},
) {
  return render(
    <WorkspaceSuggestionCard
      item={item}
      isExpanded={isExpanded}
      {...callbacks}
      {...extra}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests: status badges
// ---------------------------------------------------------------------------

describe('WorkspaceSuggestionCard — status badges', () => {
  const statuses: SuggestionWorkspaceItem['status'][] = [
    'suggested',
    'accepted',
    'edited',
    'stale',
  ];

  for (const status of statuses) {
    it(`renders ${status} status badge`, () => {
      renderCard(makeItem({ status }), true);
      expect(screen.getByTestId(`status-badge-${status}`)).toBeInTheDocument();
    });
  }

  it('renders dismissed status badge in dismissed row', () => {
    renderCard(makeItem({ status: 'dismissed' }), false);
    expect(screen.getByTestId('status-badge-dismissed')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: collapsed state
// ---------------------------------------------------------------------------

describe('WorkspaceSuggestionCard — collapsed', () => {
  it('renders target path', () => {
    renderCard(makeItem(), false);
    expect(screen.getByTestId('suggestion-card-Order.Id')).toBeInTheDocument();
    expect(screen.getByText('Order.Id')).toBeInTheDocument();
  });

  it('expand toggle has aria-expanded=false', () => {
    renderCard(makeItem(), false);
    const toggle = screen.getByTestId('expand-toggle-Order.Id');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('calls onToggleExpand when expand toggle is clicked', async () => {
    const onToggleExpand = vi.fn();
    renderCard(makeItem(), false, { ...DEFAULT_CALLBACKS, onToggleExpand });
    await userEvent.click(screen.getByTestId('expand-toggle-Order.Id'));
    expect(onToggleExpand).toHaveBeenCalledOnce();
  });

  it('calls onToggleExpand when collapsed row is clicked', async () => {
    const onToggleExpand = vi.fn();
    renderCard(makeItem(), false, { ...DEFAULT_CALLBACKS, onToggleExpand });
    await userEvent.click(screen.getByTestId('suggestion-card-Order.Id'));
    expect(onToggleExpand).toHaveBeenCalledOnce();
  });

  it('does not render action buttons in collapsed state', () => {
    renderCard(makeItem(), false);
    expect(screen.queryByTestId('accept-Order.Id')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: dismissed state
// ---------------------------------------------------------------------------

describe('WorkspaceSuggestionCard — dismissed', () => {
  it('renders undo button', () => {
    renderCard(makeItem({ status: 'dismissed' }), false);
    expect(screen.getByTestId('undo-dismiss-Order.Id')).toBeInTheDocument();
  });

  it('calls onUndoDismiss when Undo is clicked', async () => {
    const onUndoDismiss = vi.fn();
    renderCard(makeItem({ status: 'dismissed' }), false, {
      ...DEFAULT_CALLBACKS,
      onUndoDismiss,
    });
    await userEvent.click(screen.getByTestId('undo-dismiss-Order.Id'));
    expect(onUndoDismiss).toHaveBeenCalledWith('Order.Id');
  });

  it('does not render action buttons for dismissed', () => {
    renderCard(makeItem({ status: 'dismissed' }), false);
    expect(screen.queryByTestId('accept-Order.Id')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: expanded state
// ---------------------------------------------------------------------------

describe('WorkspaceSuggestionCard — expanded', () => {
  it('renders target path', () => {
    renderCard(makeItem());
    expect(screen.getByText('Order.Id')).toBeInTheDocument();
  });

  it('expand toggle has aria-expanded=true', () => {
    renderCard(makeItem());
    expect(screen.getByTestId('expand-toggle-Order.Id')).toHaveAttribute('aria-expanded', 'true');
  });

  it('calls onToggleExpand when collapse toggle is clicked', async () => {
    const onToggleExpand = vi.fn();
    renderCard(makeItem(), true, { ...DEFAULT_CALLBACKS, onToggleExpand });
    await userEvent.click(screen.getByTestId('expand-toggle-Order.Id'));
    expect(onToggleExpand).toHaveBeenCalledOnce();
  });

  it('calls onToggleExpand when expanded header row is clicked', async () => {
    const onToggleExpand = vi.fn();
    renderCard(makeItem(), true, { ...DEFAULT_CALLBACKS, onToggleExpand });
    await userEvent.click(screen.getByText('Order.Id'));
    expect(onToggleExpand).toHaveBeenCalledOnce();
  });

  it('renders Accept, Edit, Dismiss buttons', () => {
    renderCard(makeItem());
    expect(screen.getByTestId('accept-Order.Id')).toBeInTheDocument();
    expect(screen.getByTestId('edit-Order.Id')).toBeInTheDocument();
    expect(screen.getByTestId('dismiss-Order.Id')).toBeInTheDocument();
  });

  it('calls onAccept with targetPath', async () => {
    const onAccept = vi.fn();
    renderCard(makeItem(), true, { ...DEFAULT_CALLBACKS, onAccept });
    await userEvent.click(screen.getByTestId('accept-Order.Id'));
    expect(onAccept).toHaveBeenCalledWith('Order.Id');
  });

  it('calls onEdit with targetPath', async () => {
    const onEdit = vi.fn();
    renderCard(makeItem(), true, { ...DEFAULT_CALLBACKS, onEdit });
    await userEvent.click(screen.getByTestId('edit-Order.Id'));
    expect(onEdit).toHaveBeenCalledWith('Order.Id');
  });

  it('calls onDismiss with targetPath', async () => {
    const onDismiss = vi.fn();
    renderCard(makeItem(), true, { ...DEFAULT_CALLBACKS, onDismiss });
    await userEvent.click(screen.getByTestId('dismiss-Order.Id'));
    expect(onDismiss).toHaveBeenCalledWith('Order.Id');
  });

  it('renders "Dismiss" label for new suggestions', () => {
    renderCard(makeItem({ isNew: true }));
    expect(screen.getByTestId('dismiss-Order.Id')).toHaveTextContent('Dismiss');
  });

  it('renders "Keep Current" label for replacement suggestions', () => {
    renderCard(makeItem({ isNew: false }));
    expect(screen.getByTestId('dismiss-Order.Id')).toHaveTextContent('Keep Current');
  });

  it('renders explanation text', () => {
    renderCard(makeItem({ explanation: 'Maps the order identifier' }));
    expect(screen.getByText(/Maps the order identifier/)).toBeInTheDocument();
  });

  it('renders "No existing rule" when existingExpressionAtGeneration is null', () => {
    renderCard(makeItem({ existingExpressionAtGeneration: null }));
    expect(screen.getByText('No existing rule')).toBeInTheDocument();
  });

  it('renders existing expression when provided', () => {
    renderCard(makeItem({ existingExpressionAtGeneration: 'source.oldId', isNew: false }));
    expect(screen.getByText('source.oldId')).toBeInTheDocument();
  });

  it('renders suggested expression', () => {
    renderCard(makeItem({ suggestedExpression: 'source.orderId' }));
    expect(screen.getByText('source.orderId')).toBeInTheDocument();
  });

  it('renders generated-state label copy', () => {
    renderCard(makeItem());
    expect(screen.getByTestId('suggestion-generated-label-Order.Id')).toHaveTextContent(
      'AI-generated assistance. Suggestions are not persisted until you explicitly accept.',
    );
  });

  it('renders New rule badge for new suggestions', () => {
    renderCard(makeItem({ isNew: true }));
    expect(screen.getByTestId('badge-new')).toBeInTheDocument();
  });

  it('renders Replaces existing badge for replacement suggestions', () => {
    renderCard(makeItem({ isNew: false }));
    expect(screen.getByTestId('badge-replacing')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: confidence badges
// ---------------------------------------------------------------------------

describe('WorkspaceSuggestionCard — confidence badges', () => {
  it('renders high confidence badge for "high"', () => {
    renderCard(makeItem({ confidence: 'high' }));
    expect(screen.getByTestId('confidence-badge-high')).toBeInTheDocument();
  });

  it('renders medium confidence badge for "medium"', () => {
    renderCard(makeItem({ confidence: 'medium' }));
    expect(screen.getByTestId('confidence-badge-medium')).toBeInTheDocument();
  });

  it('renders low confidence badge for "low"', () => {
    renderCard(makeItem({ confidence: 'low' }));
    expect(screen.getByTestId('confidence-badge-low')).toBeInTheDocument();
  });

  it('resolves numeric confidence >= 0.8 to high', () => {
    renderCard(makeItem({ confidence: 0.9 }));
    expect(screen.getByTestId('confidence-badge-high')).toBeInTheDocument();
  });

  it('resolves numeric confidence >= 0.5 to medium', () => {
    renderCard(makeItem({ confidence: 0.6 }));
    expect(screen.getByTestId('confidence-badge-medium')).toBeInTheDocument();
  });

  it('resolves numeric confidence < 0.5 to low', () => {
    renderCard(makeItem({ confidence: 0.3 }));
    expect(screen.getByTestId('confidence-badge-low')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: validation badges
// ---------------------------------------------------------------------------

describe('WorkspaceSuggestionCard — validation badges', () => {
  it('renders valid badge when validation.valid is true with no warnings', () => {
    renderCard(
      makeItem({
        validation: { valid: true, diagnostics: [] },
      }),
    );
    expect(screen.getByTestId('validation-badge-valid')).toBeInTheDocument();
  });

  it('renders warning badge when validation.valid is true with warning diagnostics', () => {
    renderCard(
      makeItem({
        validation: {
          valid: true,
          diagnostics: [{ severity: 'warning', code: 'W001', message: 'Possible issue' }],
        },
      }),
    );
    expect(screen.getByTestId('validation-badge-warning')).toBeInTheDocument();
  });

  it('renders invalid badge when validation.valid is false', () => {
    renderCard(
      makeItem({
        validation: {
          valid: false,
          diagnostics: [{ severity: 'error', code: 'E001', message: 'Type mismatch' }],
        },
      }),
    );
    expect(screen.getByTestId('validation-badge-invalid')).toBeInTheDocument();
  });

  it('renders no validation badge when validation is undefined', () => {
    renderCard(makeItem({ validation: undefined }));
    expect(screen.queryByTestId('validation-badge-valid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('validation-badge-invalid')).not.toBeInTheDocument();
  });

  it('renders invalid validation badge when backend-normalized missing validation is provided', () => {
    renderCard(
      makeItem({
        validation: {
          valid: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'VALIDATION_MISSING',
              message: 'No validation status returned',
            },
          ],
        },
      }),
    );

    expect(screen.getByTestId('validation-badge-invalid')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: diagnostics section
// ---------------------------------------------------------------------------

describe('WorkspaceSuggestionCard — diagnostics', () => {
  const itemWithDiagnostics = makeItem({
    validation: {
      valid: false,
      diagnostics: [
        { severity: 'error', code: 'E001', message: 'Type mismatch' },
        { severity: 'warning', code: 'W001', message: 'Possible null' },
      ],
    },
  });

  it('renders diagnostics toggle button', () => {
    renderCard(itemWithDiagnostics);
    expect(screen.getByTestId('diagnostics-section')).toBeInTheDocument();
    expect(screen.getByText('Diagnostics (2)')).toBeInTheDocument();
  });

  it('diagnostics list is hidden by default', () => {
    renderCard(itemWithDiagnostics);
    expect(screen.queryByTestId('diagnostics-list')).not.toBeInTheDocument();
  });

  it('expands diagnostics list on click', async () => {
    renderCard(itemWithDiagnostics);
    await userEvent.click(screen.getByText('Diagnostics (2)'));
    expect(screen.getByTestId('diagnostics-list')).toBeInTheDocument();
    expect(screen.getByText(/Type mismatch/)).toBeInTheDocument();
    expect(screen.getByText(/Possible null/)).toBeInTheDocument();
  });

  it('diagnostics toggle has aria-expanded', async () => {
    renderCard(itemWithDiagnostics);
    const toggle = screen.getByText('Diagnostics (2)').closest('button')!;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not render diagnostics section when no diagnostics', () => {
    renderCard(makeItem({ validation: { valid: true, diagnostics: [] } }));
    expect(screen.queryByTestId('diagnostics-section')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: stale state
// ---------------------------------------------------------------------------

describe('WorkspaceSuggestionCard — stale', () => {
  it('renders stale indicator when status is stale', () => {
    renderCard(makeItem({ status: 'stale' }));
    expect(screen.getByTestId('stale-indicator')).toBeInTheDocument();
  });

  it('does not render stale indicator for non-stale items', () => {
    renderCard(makeItem({ status: 'suggested' }));
    expect(screen.queryByTestId('stale-indicator')).not.toBeInTheDocument();
  });

  it('renders per-item refresh button when onRefreshItem provided and status is stale', () => {
    const onRefreshItem = vi.fn();
    renderCard(makeItem({ status: 'stale' }), true, DEFAULT_CALLBACKS, { onRefreshItem });
    expect(screen.getByTestId('refresh-item-Order.Id')).toBeInTheDocument();
  });

  it('calls onRefreshItem with targetPath when refresh button clicked', async () => {
    const onRefreshItem = vi.fn();
    renderCard(makeItem({ status: 'stale' }), true, DEFAULT_CALLBACKS, { onRefreshItem });
    await userEvent.click(screen.getByTestId('refresh-item-Order.Id'));
    expect(onRefreshItem).toHaveBeenCalledWith('Order.Id');
  });

  it('does not render refresh button when onRefreshItem not provided', () => {
    renderCard(makeItem({ status: 'stale' }));
    expect(screen.queryByTestId('refresh-item-Order.Id')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: preview slot
// ---------------------------------------------------------------------------

describe('WorkspaceSuggestionCard — preview slot', () => {
  it('renders preview slot when provided', () => {
    renderCard(makeItem(), true, DEFAULT_CALLBACKS, {
      previewSlot: <div data-testid="preview-content">Preview here</div>,
    });
    expect(screen.getByTestId('preview-slot')).toBeInTheDocument();
    expect(screen.getByTestId('preview-content')).toBeInTheDocument();
  });

  it('does not render preview slot when not provided', () => {
    renderCard(makeItem());
    expect(screen.queryByTestId('preview-slot')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: isRefreshing loading indicator
// ---------------------------------------------------------------------------

describe('WorkspaceSuggestionCard — isRefreshing', () => {
  it('shows loading indicator in expanded state when isRefreshing', () => {
    render(
      <WorkspaceSuggestionCard
        item={makeItem()}
        isExpanded={true}
        {...DEFAULT_CALLBACKS}
        isRefreshing={true}
      />,
    );
    expect(screen.getByLabelText('Refreshing')).toBeInTheDocument();
  });

  it('shows loading indicator in collapsed state when isRefreshing', () => {
    render(
      <WorkspaceSuggestionCard
        item={makeItem()}
        isExpanded={false}
        {...DEFAULT_CALLBACKS}
        isRefreshing={true}
      />,
    );
    expect(screen.getByLabelText('Refreshing')).toBeInTheDocument();
  });

  it('does not show loading indicator when not refreshing', () => {
    renderCard(makeItem());
    expect(screen.queryByLabelText('Refreshing')).not.toBeInTheDocument();
  });
});
