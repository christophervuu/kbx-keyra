import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SuggestionFilter } from '../hooks/use-auto-map-workspace';
import type { AutoMapWorkspaceSummary } from '../types';
import { WorkspaceToolbar } from './WorkspaceToolbar';

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
  mode: null,
  chunkCount: null,
  retrievalCandidatesCount: null,
  retrievalSelectedCount: null,
  validationPassCount: null,
  validationFailCount: null,
  duplicatesCollapsed: null,
  noContext: false,
  noContextReason: null,
};

function makeSummary(overrides: Partial<AutoMapWorkspaceSummary> = {}): AutoMapWorkspaceSummary {
  return { ...EMPTY_SUMMARY, ...overrides };
}

const DEFAULT_CALLBACKS = {
  onToggleFilter: vi.fn(),
  onClearFilters: vi.fn(),
  onTargetSearchChange: vi.fn(),
  onClearTargetSearch: vi.fn(),
  onRefreshStale: vi.fn(),
};

function renderToolbar(
  summary: AutoMapWorkspaceSummary = EMPTY_SUMMARY,
  activeFilters: ReadonlySet<SuggestionFilter> = new Set(),
  isRefreshing = false,
  callbacks = DEFAULT_CALLBACKS,
) {
  return render(
    <WorkspaceToolbar
      summary={summary}
      activeFilters={activeFilters}
      totalFilteredCount={summary.total}
      targetSearchQuery=""
      isRefreshing={isRefreshing}
      {...callbacks}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests: rendering
// ---------------------------------------------------------------------------

describe('WorkspaceToolbar — rendering', () => {
  it('renders the toolbar container', () => {
    renderToolbar();
    expect(screen.getByTestId('workspace-toolbar')).toBeInTheDocument();
  });

  it('renders "All" chip', () => {
    renderToolbar();
    expect(screen.getByTestId('filter-chip-all')).toBeInTheDocument();
  });

  it('renders all filter chips', () => {
    renderToolbar();
    const chips: SuggestionFilter[] = [
      'needsReview', 'unmapped', 'replacing', 'valid', 'invalid', 'lowConfidence',
      'accepted', 'dismissed', 'stale',
    ];
    for (const chip of chips) {
      expect(screen.getByTestId(`filter-chip-${chip}`)).toBeInTheDocument();
    }
  });

  it('renders toolbar action group', () => {
    renderToolbar();
    expect(screen.getByRole('group', { name: 'Bulk actions' })).toBeInTheDocument();
  });

  it('renders target search input and filtered scope summary', () => {
    renderToolbar(makeSummary({ total: 7 }), new Set(), false);
    expect(screen.getByTestId('workspace-target-search')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-filtered-scope')).toHaveTextContent('Batch scope: 7 filtered rows');
  });
});

// ---------------------------------------------------------------------------
// Tests: "All" chip state
// ---------------------------------------------------------------------------

describe('WorkspaceToolbar — All chip', () => {
  it('"All" chip is aria-pressed=true when no filters active', () => {
    renderToolbar(EMPTY_SUMMARY, new Set());
    expect(screen.getByTestId('filter-chip-all')).toHaveAttribute('aria-pressed', 'true');
  });

  it('"All" chip is aria-pressed=false when filters are active', () => {
    renderToolbar(EMPTY_SUMMARY, new Set<SuggestionFilter>(['unmapped']));
    expect(screen.getByTestId('filter-chip-all')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onClearFilters when "All" chip is clicked', async () => {
    const onClearFilters = vi.fn();
    renderToolbar(EMPTY_SUMMARY, new Set(), false, { ...DEFAULT_CALLBACKS, onClearFilters });
    await userEvent.click(screen.getByTestId('filter-chip-all'));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it('shows total count in "All" chip', () => {
    renderToolbar(makeSummary({ total: 7 }));
    expect(screen.getByTestId('filter-chip-all')).toHaveTextContent('7');
  });
});

// ---------------------------------------------------------------------------
// Tests: filter chip toggle
// ---------------------------------------------------------------------------

describe('WorkspaceToolbar — filter chip toggle', () => {
  it('filter chip is aria-pressed=false when not active', () => {
    renderToolbar(EMPTY_SUMMARY, new Set());
    expect(screen.getByTestId('filter-chip-unmapped')).toHaveAttribute('aria-pressed', 'false');
  });

  it('filter chip is aria-pressed=true when active', () => {
    renderToolbar(EMPTY_SUMMARY, new Set<SuggestionFilter>(['unmapped']));
    expect(screen.getByTestId('filter-chip-unmapped')).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onToggleFilter with correct filter when chip clicked', async () => {
    const onToggleFilter = vi.fn();
    renderToolbar(EMPTY_SUMMARY, new Set(), false, { ...DEFAULT_CALLBACKS, onToggleFilter });
    await userEvent.click(screen.getByTestId('filter-chip-unmapped'));
    expect(onToggleFilter).toHaveBeenCalledWith('unmapped');
  });

  it('calls onToggleFilter with lowConfidence filter', async () => {
    const onToggleFilter = vi.fn();
    renderToolbar(EMPTY_SUMMARY, new Set(), false, { ...DEFAULT_CALLBACKS, onToggleFilter });
    await userEvent.click(screen.getByTestId('filter-chip-lowConfidence'));
    expect(onToggleFilter).toHaveBeenCalledWith('lowConfidence');
  });
});

// ---------------------------------------------------------------------------
// Tests: count badges on filter chips
// ---------------------------------------------------------------------------

describe('WorkspaceToolbar — count badges', () => {
  it('shows pending + stale on Needs Review chip', () => {
    renderToolbar(makeSummary({ pending: 3, stale: 1 }));
    expect(screen.getByTestId('filter-chip-needsReview')).toHaveTextContent('4');
  });

  it('shows pending count on Unmapped chip', () => {
    renderToolbar(makeSummary({ pending: 4 }));
    expect(screen.getByTestId('filter-chip-unmapped')).toHaveTextContent('4');
  });

  it('shows validCount on Valid chip', () => {
    renderToolbar(makeSummary({ validCount: 3 }));
    expect(screen.getByTestId('filter-chip-valid')).toHaveTextContent('3');
  });

  it('shows invalidCount on Invalid chip', () => {
    renderToolbar(makeSummary({ invalidCount: 2 }));
    expect(screen.getByTestId('filter-chip-invalid')).toHaveTextContent('2');
  });

  it('shows lowConfidence on Low Confidence chip', () => {
    renderToolbar(makeSummary({ lowConfidence: 1 }));
    expect(screen.getByTestId('filter-chip-lowConfidence')).toHaveTextContent('1');
  });

  it('shows accepted count on Accepted chip', () => {
    renderToolbar(makeSummary({ accepted: 5 }));
    expect(screen.getByTestId('filter-chip-accepted')).toHaveTextContent('5');
  });

  it('shows dismissed count on Dismissed chip', () => {
    renderToolbar(makeSummary({ dismissed: 2 }));
    expect(screen.getByTestId('filter-chip-dismissed')).toHaveTextContent('2');
  });

  it('shows stale count on Stale chip', () => {
    renderToolbar(makeSummary({ stale: 3 }));
    expect(screen.getByTestId('filter-chip-stale')).toHaveTextContent('3');
  });
});

// ---------------------------------------------------------------------------
// Tests: Clear filters button
// ---------------------------------------------------------------------------

describe('WorkspaceToolbar — clear filters', () => {
  it('does not render Clear button when no filters active', () => {
    renderToolbar(EMPTY_SUMMARY, new Set());
    expect(screen.queryByTestId('filter-clear')).not.toBeInTheDocument();
  });

  it('renders Clear button when filters are active', () => {
    renderToolbar(EMPTY_SUMMARY, new Set<SuggestionFilter>(['unmapped']));
    expect(screen.getByTestId('filter-clear')).toBeInTheDocument();
  });

  it('calls onClearFilters when Clear button is clicked', async () => {
    const onClearFilters = vi.fn();
    renderToolbar(
      EMPTY_SUMMARY,
      new Set<SuggestionFilter>(['unmapped']),
      false,
      { ...DEFAULT_CALLBACKS, onClearFilters },
    );
    await userEvent.click(screen.getByTestId('filter-clear'));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });
});

describe('WorkspaceToolbar — target search', () => {
  it('calls onTargetSearchChange when typing search text', async () => {
    const onTargetSearchChange = vi.fn();
    render(
      <WorkspaceToolbar
        summary={makeSummary({ total: 2 })}
        activeFilters={new Set()}
        totalFilteredCount={2}
        targetSearchQuery=""
        isRefreshing={false}
        onToggleFilter={vi.fn()}
        onClearFilters={vi.fn()}
        onTargetSearchChange={onTargetSearchChange}
        onClearTargetSearch={vi.fn()}
        onRefreshStale={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByTestId('workspace-target-search'), 'Order.Id');
    expect(onTargetSearchChange).toHaveBeenCalled();
  });

  it('renders clear search button and calls onClearTargetSearch', async () => {
    const onClearTargetSearch = vi.fn();
    render(
      <WorkspaceToolbar
        summary={makeSummary({ total: 1 })}
        activeFilters={new Set()}
        totalFilteredCount={1}
        targetSearchQuery="Order"
        isRefreshing={false}
        onToggleFilter={vi.fn()}
        onClearFilters={vi.fn()}
        onTargetSearchChange={vi.fn()}
        onClearTargetSearch={onClearTargetSearch}
        onRefreshStale={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByTestId('workspace-target-search-clear'));
    expect(onClearTargetSearch).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Tests: Refresh Stale button
// ---------------------------------------------------------------------------

describe('WorkspaceToolbar — Refresh Stale', () => {
  it('is hidden when stale count is 0', () => {
    renderToolbar(makeSummary({ stale: 0 }));
    expect(screen.queryByTestId('bulk-refresh-stale')).not.toBeInTheDocument();
  });

  it('is visible when stale count > 0', () => {
    renderToolbar(makeSummary({ stale: 2 }));
    expect(screen.getByTestId('bulk-refresh-stale')).toBeInTheDocument();
  });

  it('is disabled during refresh', () => {
    renderToolbar(makeSummary({ stale: 2 }), new Set(), true);
    expect(screen.getByTestId('bulk-refresh-stale')).toBeDisabled();
  });

  it('is enabled when not refreshing', () => {
    renderToolbar(makeSummary({ stale: 2 }), new Set(), false);
    expect(screen.getByTestId('bulk-refresh-stale')).not.toBeDisabled();
  });

  it('calls onRefreshStale when clicked', async () => {
    const onRefreshStale = vi.fn();
    renderToolbar(
      makeSummary({ stale: 2 }),
      new Set(),
      false,
      { ...DEFAULT_CALLBACKS, onRefreshStale },
    );
    await userEvent.click(screen.getByTestId('bulk-refresh-stale'));
    expect(onRefreshStale).toHaveBeenCalledOnce();
  });
});


// ---------------------------------------------------------------------------
// Tests: isRefreshing disables all buttons
// ---------------------------------------------------------------------------

describe('WorkspaceToolbar — isRefreshing', () => {
  it('disables stale refresh action when isRefreshing', () => {
    renderToolbar(
      makeSummary({ total: 5, pending: 3, validCount: 3, stale: 1 }),
      new Set(),
      true,
    );
    expect(screen.getByTestId('bulk-refresh-stale')).toBeDisabled();
  });
});
