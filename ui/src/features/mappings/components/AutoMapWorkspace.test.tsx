import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AutoMapWorkspaceSummary, SuggestionWorkspaceItem } from '../types';
import { AutoMapWorkspace } from './AutoMapWorkspace';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_SUMMARY: AutoMapWorkspaceSummary = {
  total: 0,
  pending: 0,
  accepted: 0,
  edited: 0,
  dismissed: 0,
  stale: 0,
  validCount: 0,
  warningCount: 0,
  invalidCount: 0,
  highConfidence: 0,
  mediumConfidence: 0,
  lowConfidence: 0,
  generatedAt: null,
  lastRefreshedAt: null,
};

function makeSummary(overrides: Partial<AutoMapWorkspaceSummary> = {}): AutoMapWorkspaceSummary {
  return { ...EMPTY_SUMMARY, ...overrides };
}

function makeItem(targetPath: string, status: SuggestionWorkspaceItem['status'] = 'suggested'): SuggestionWorkspaceItem {
  return {
    targetPath,
    suggestedExpression: `source.${targetPath}`,
    explanation: 'Maps field',
    confidence: 'high',
    status,
    isNew: true,
    existingExpressionAtGeneration: null,
  };
}

const DEFAULT_PROPS = {
  status: 'idle' as const,
  error: null,
  items: [] as readonly SuggestionWorkspaceItem[],
  filteredItems: [] as readonly SuggestionWorkspaceItem[],
  summary: EMPTY_SUMMARY,
  sectionPath: 'Order',
  onRetry: vi.fn(),
  onRefreshAll: vi.fn(),
  onExitWorkspace: vi.fn(),
  previousSuggestionsAvailable: false,
  onRestorePrevious: vi.fn(),
  generatedAt: null,
};

// ---------------------------------------------------------------------------
// Tests: AutoMapWorkspace body states
// ---------------------------------------------------------------------------

describe('AutoMapWorkspace', () => {
  it('has role="region" with correct aria-label', () => {
    render(<AutoMapWorkspace {...DEFAULT_PROPS} status="loading" />);
    expect(screen.getByRole('region', { name: 'Auto-Map Review Workspace' })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  it('renders loading state with section path', () => {
    render(<AutoMapWorkspace {...DEFAULT_PROPS} status="loading" sectionPath="Order" />);
    expect(screen.getByTestId('workspace-loading')).toBeInTheDocument();
    expect(screen.getByText(/Generating mapping suggestions/)).toBeInTheDocument();
    expect(screen.getByTestId('workspace-header-section-path')).toHaveTextContent('Order');
  });

  it('renders loading state without section path', () => {
    render(<AutoMapWorkspace {...DEFAULT_PROPS} status="loading" sectionPath={null} />);
    expect(screen.getByTestId('workspace-loading')).toBeInTheDocument();
    expect(screen.queryByText('Order')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  it('renders error state with role="alert" and Try Again button', () => {
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="error"
        error="Could not reach the server"
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Could not reach the server')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-retry-button')).toBeInTheDocument();
  });

  it('calls onRetry when Try Again is clicked', async () => {
    const onRetry = vi.fn();
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="error"
        error="Network error"
        onRetry={onRetry}
      />,
    );
    await userEvent.click(screen.getByTestId('workspace-retry-button'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows "Show previous suggestions" link when previousSuggestionsAvailable', () => {
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="error"
        error="Network error"
        previousSuggestionsAvailable={true}
      />,
    );
    expect(screen.getByTestId('workspace-restore-previous')).toBeInTheDocument();
  });

  it('hides "Show previous suggestions" link when not available', () => {
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="error"
        error="Network error"
        previousSuggestionsAvailable={false}
      />,
    );
    expect(screen.queryByTestId('workspace-restore-previous')).not.toBeInTheDocument();
  });

  it('calls onRestorePrevious when "Show previous suggestions" is clicked', async () => {
    const onRestorePrevious = vi.fn();
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="error"
        error="Network error"
        previousSuggestionsAvailable={true}
        onRestorePrevious={onRestorePrevious}
      />,
    );
    await userEvent.click(screen.getByTestId('workspace-restore-previous'));
    expect(onRestorePrevious).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it('renders empty state when success with no items', () => {
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="success"
        items={[]}
        filteredItems={[]}
      />,
    );
    expect(screen.getByTestId('workspace-empty')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-empty-back')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-empty-refresh')).toBeInTheDocument();
  });

  it('calls onExitWorkspace from empty state Back to Editor', async () => {
    const onExitWorkspace = vi.fn();
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="success"
        items={[]}
        filteredItems={[]}
        onExitWorkspace={onExitWorkspace}
      />,
    );
    await userEvent.click(screen.getByTestId('workspace-empty-back'));
    expect(onExitWorkspace).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Success with items
  // -------------------------------------------------------------------------

  it('renders card list when success with items', () => {
    const items = [makeItem('Order.Id'), makeItem('Order.Amount')];
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="success"
        items={items}
        filteredItems={items}
        summary={makeSummary({ total: 2, pending: 2 })}
      />,
    );
    expect(screen.getByTestId('workspace-card-list')).toBeInTheDocument();
    expect(screen.getByTestId('suggestion-card-Order.Id')).toBeInTheDocument();
    expect(screen.getByTestId('suggestion-card-Order.Amount')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-preview-Order.Id')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-preview-no-data-Order.Id')).toBeInTheDocument();
  });

  it('renders children slot instead of placeholder when provided', () => {
    const items = [makeItem('Order.Id')];
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="success"
        items={items}
        filteredItems={items}
        summary={makeSummary({ total: 1, pending: 1 })}
      >
        <div data-testid="custom-card-list">Custom cards</div>
      </AutoMapWorkspace>,
    );
    expect(screen.getByTestId('custom-card-list')).toBeInTheDocument();
    expect(screen.queryByTestId('suggestion-card-Order.Id')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Completion banner
  // -------------------------------------------------------------------------

  it('renders completion banner when all items are in terminal states', () => {
    const items = [
      makeItem('Order.Id', 'accepted'),
      makeItem('Order.Amount', 'dismissed'),
    ];
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="success"
        items={items}
        filteredItems={items}
        summary={makeSummary({ total: 2, accepted: 1, dismissed: 1 })}
      />,
    );
    expect(screen.getByTestId('workspace-completion-banner')).toBeInTheDocument();
    expect(screen.getByText(/All 2 suggestions reviewed/)).toBeInTheDocument();
  });

  it('does not render completion banner when some items are still suggested', () => {
    const items = [
      makeItem('Order.Id', 'accepted'),
      makeItem('Order.Amount', 'suggested'),
    ];
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="success"
        items={items}
        filteredItems={items}
        summary={makeSummary({ total: 2, accepted: 1, pending: 1 })}
      />,
    );
    expect(screen.queryByTestId('workspace-completion-banner')).not.toBeInTheDocument();
  });

  it('calls onRefreshAll from completion banner', async () => {
    const onRefreshAll = vi.fn();
    const items = [makeItem('Order.Id', 'accepted')];
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="success"
        items={items}
        filteredItems={items}
        summary={makeSummary({ total: 1, accepted: 1 })}
        onRefreshAll={onRefreshAll}
      />,
    );
    await userEvent.click(screen.getByTestId('workspace-completion-refresh'));
    expect(onRefreshAll).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Toolbar slot
  // -------------------------------------------------------------------------

  it('renders toolbarSlot between header and body', () => {
    const items = [makeItem('Order.Id')];
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="success"
        items={items}
        filteredItems={items}
        summary={makeSummary({ total: 1, pending: 1 })}
        toolbarSlot={<div data-testid="toolbar-slot">Toolbar</div>}
      />,
    );
    expect(screen.getByTestId('toolbar-slot')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: WorkspaceHeader
// ---------------------------------------------------------------------------

import { WorkspaceHeader } from './WorkspaceHeader';

describe('WorkspaceHeader', () => {
  const BASE_PROPS = {
    sectionPath: 'Order',
    summary: EMPTY_SUMMARY,
    lastRefreshedAt: null,
    onExitWorkspace: vi.fn(),
  };

  it('displays section path', () => {
    render(<WorkspaceHeader {...BASE_PROPS} />);
    expect(screen.getByTestId('workspace-header-section-path')).toHaveTextContent('Order');
  });

  it('shows "All fields" when sectionPath is null', () => {
    render(<WorkspaceHeader {...BASE_PROPS} sectionPath={null} />);
    expect(screen.getByTestId('workspace-header-section-path')).toHaveTextContent('All fields');
  });

  it('shows valid badge when validCount > 0', () => {
    render(
      <WorkspaceHeader
        {...BASE_PROPS}
        summary={makeSummary({ validCount: 5 })}
      />,
    );
    expect(screen.getByTestId('badge-valid')).toBeInTheDocument();
  });

  it('shows invalid badge when invalidCount > 0', () => {
    render(
      <WorkspaceHeader
        {...BASE_PROPS}
        summary={makeSummary({ invalidCount: 2 })}
      />,
    );
    expect(screen.getByTestId('badge-invalid')).toBeInTheDocument();
  });

  it('shows accepted badge when accepted > 0', () => {
    render(
      <WorkspaceHeader
        {...BASE_PROPS}
        summary={makeSummary({ accepted: 3 })}
      />,
    );
    expect(screen.getByTestId('badge-accepted')).toBeInTheDocument();
  });

  it('shows dismissed badge when dismissed > 0', () => {
    render(
      <WorkspaceHeader
        {...BASE_PROPS}
        summary={makeSummary({ dismissed: 1 })}
      />,
    );
    expect(screen.getByTestId('badge-dismissed')).toBeInTheDocument();
  });

  it('shows stale badge when stale > 0', () => {
    render(
      <WorkspaceHeader
        {...BASE_PROPS}
        summary={makeSummary({ stale: 2 })}
      />,
    );
    expect(screen.getByTestId('badge-stale')).toBeInTheDocument();
  });

  it('shows last refreshed timestamp when provided', () => {
    const now = new Date().toISOString();
    render(<WorkspaceHeader {...BASE_PROPS} lastRefreshedAt={now} />);
    expect(screen.getByTestId('workspace-last-refreshed')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-last-refreshed')).toHaveTextContent('Refreshed');
  });

  it('hides last refreshed when null', () => {
    render(<WorkspaceHeader {...BASE_PROPS} lastRefreshedAt={null} />);
    expect(screen.queryByTestId('workspace-last-refreshed')).not.toBeInTheDocument();
  });

  it('calls onExitWorkspace when Back to Editor is clicked', async () => {
    const onExitWorkspace = vi.fn();
    render(<WorkspaceHeader {...BASE_PROPS} onExitWorkspace={onExitWorkspace} />);
    await userEvent.click(screen.getByTestId('workspace-back-to-editor'));
    expect(onExitWorkspace).toHaveBeenCalledOnce();
  });

  it('renders moved action buttons and expand control', () => {
    render(
      <WorkspaceHeader
        {...BASE_PROPS}
        summary={makeSummary({ validCount: 2, pending: 2 })}
        onAcceptAllValid={vi.fn()}
        onRefreshUnmapped={vi.fn()}
        onRefreshAll={vi.fn()}
        onToggleExpandAll={vi.fn()}
      />,
    );

    expect(screen.getByTestId('bulk-accept-all-valid')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-refresh-unmapped')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-refresh-all')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-toggle-expand-all')).toBeInTheDocument();
  });
});

describe('AutoMapWorkspace interactions', () => {
  it('toggles all visible suggestions with expand/collapse all button', async () => {
    const items = [makeItem('Order.Id'), makeItem('Order.Amount')];
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="success"
        items={items}
        filteredItems={items}
        summary={makeSummary({ total: 2, pending: 2 })}
        onAcceptAllValid={vi.fn()}
        onRefreshUnmapped={vi.fn()}
      />,
    );

    expect(screen.getByTestId('expand-toggle-Order.Id')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('expand-toggle-Order.Amount')).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(screen.getByTestId('workspace-toggle-expand-all'));
    expect(screen.getByTestId('expand-toggle-Order.Id')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('expand-toggle-Order.Amount')).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(screen.getByTestId('workspace-toggle-expand-all'));
    expect(screen.getByTestId('expand-toggle-Order.Id')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('expand-toggle-Order.Amount')).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses accepted suggestion and opens next item', async () => {
    const onAccept = vi.fn();
    const items = [makeItem('Order.Id'), makeItem('Order.Amount')];
    render(
      <AutoMapWorkspace
        {...DEFAULT_PROPS}
        status="success"
        items={items}
        filteredItems={items}
        summary={makeSummary({ total: 2, pending: 2 })}
        onAccept={onAccept}
      />,
    );

    await userEvent.click(screen.getByTestId('accept-Order.Id'));
    expect(onAccept).toHaveBeenCalledWith('Order.Id');
    expect(screen.getByTestId('expand-toggle-Order.Id')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('expand-toggle-Order.Amount')).toHaveAttribute('aria-expanded', 'true');
  });
});
