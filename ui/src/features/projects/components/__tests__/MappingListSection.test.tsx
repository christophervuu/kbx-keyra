import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MappingRowData } from '../../types';
import { MappingListSection } from '../MappingListSection';

// ---------------------------------------------------------------------------
// localStorage mock (mirrors use-recent-activity.test.ts pattern)
// ---------------------------------------------------------------------------

const store: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    Object.keys(store).forEach((k) => delete store[k]);
  }),
};

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
  localStorageMock.clear();
  vi.clearAllMocks();
  // Re-bind mock implementations after clearAllMocks
  localStorageMock.getItem.mockImplementation((key: string) => store[key] ?? null);
  localStorageMock.setItem.mockImplementation((key: string, value: string) => {
    store[key] = value;
  });
  localStorageMock.removeItem.mockImplementation((key: string) => {
    delete store[key];
  });
  localStorageMock.clear.mockImplementation(() => {
    Object.keys(store).forEach((k) => delete store[k]);
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMapping(overrides: Partial<MappingRowData> = {}): MappingRowData {
  return {
    mappingId: 'mapping-1',
    name: 'Alpha Mapping',
    sourceSchemaName: 'Schema A',
    targetSchemaName: 'Schema B',
    ruleCount: 3,
    coverage: 0.6,
    status: 'ready',
    devDeploy: 'not-deployed',
    qaDeploy: 'not-deployed',
    prodDeploy: 'not-deployed',
    updatedAt: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

const MAPPING_A = makeMapping({ mappingId: 'a', name: 'Alpha', updatedAt: '2026-01-01T00:00:00Z' });
const MAPPING_B = makeMapping({ mappingId: 'b', name: 'Beta', updatedAt: '2026-03-01T00:00:00Z' });

function renderSection(
  mappings: MappingRowData[],
  overrides: {
    onCreateMapping?: () => void;
    onDuplicate?: (id: string) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
    projectId?: string;
  } = {},
) {
  return render(
    <MemoryRouter>
      <MappingListSection
        mappings={mappings}
        projectId={overrides.projectId ?? 'proj-1'}
        onCreateMapping={overrides.onCreateMapping ?? vi.fn()}
        onDuplicate={overrides.onDuplicate ?? vi.fn().mockResolvedValue(undefined)}
        onDelete={overrides.onDelete ?? vi.fn().mockResolvedValue(undefined)}
      />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// localStorage helpers for recently-edited tests
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'keyra:recent-activity';

function setRecentActivity(entries: object[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function clearRecentActivity() {
  localStorage.setItem(STORAGE_KEY, '[]');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MappingListSection', () => {
  it('renders section heading', () => {
    renderSection([MAPPING_A]);
    expect(screen.getByRole('heading', { name: 'Mappings' })).toBeInTheDocument();
  });

  it('heading uses primary text-xl treatment', () => {
    renderSection([MAPPING_A]);
    const heading = screen.getByRole('heading', { name: 'Mappings' });
    expect(heading).toHaveClass('text-xl');
  });

  it('shows empty state when no mappings', () => {
    renderSection([]);
    expect(screen.getByTestId('mapping-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/no mappings yet/i)).toBeInTheDocument();
  });

  it('AE-11: empty state shows subtext and CTA', () => {
    renderSection([]);
    expect(
      screen.getByText(/create your first mapping to start transforming data/i),
    ).toBeInTheDocument();
    // Scope to the empty state container — header also has a Create Mapping button
    const emptyState = screen.getByTestId('mapping-empty-state');
    expect(
      emptyState.querySelector('button'),
    ).toHaveTextContent(/create mapping/i);
  });

  it('renders mapping rows when mappings are provided', () => {
    renderSection([MAPPING_A, MAPPING_B]);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('default sort is Last Modified descending — more recent mapping first', () => {
    renderSection([MAPPING_A, MAPPING_B]);
    const rows = screen.getAllByRole('row');
    // rows[0] = thead row, rows[1] = first data row, rows[2] = second data row
    expect(within(rows[1]).getByText('Beta')).toBeInTheDocument(); // more recent
    expect(within(rows[2]).getByText('Alpha')).toBeInTheDocument();
  });

  it('clicking Name header sorts by name ascending', async () => {
    const user = userEvent.setup();
    renderSection([MAPPING_B, MAPPING_A]);
    await user.click(screen.getByRole('button', { name: 'Sort by Name' }));
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Alpha')).toBeInTheDocument(); // a < b
  });

  it('clicking Name header twice toggles to descending', async () => {
    const user = userEvent.setup();
    renderSection([MAPPING_A, MAPPING_B]);
    await user.click(screen.getByRole('button', { name: 'Sort by Name' }));
    await user.click(screen.getByRole('button', { name: 'Sort by Name' }));
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Beta')).toBeInTheDocument(); // b > a desc
  });

  it('Create Mapping button calls onCreateMapping', async () => {
    const onCreateMapping = vi.fn();
    const user = userEvent.setup();
    renderSection([MAPPING_A], { onCreateMapping });
    const buttons = screen.getAllByRole('button', { name: /create mapping/i });
    await user.click(buttons[0]);
    expect(onCreateMapping).toHaveBeenCalled();
  });

  it('clicking Delete opens confirmation dialog', async () => {
    const user = userEvent.setup();
    renderSection([MAPPING_A]);
    await user.click(screen.getByRole('button', { name: /delete mapping alpha/i }));
    expect(screen.getByTestId('delete-confirm-dialog')).toBeInTheDocument();
    const dialog = screen.getByTestId('delete-confirm-dialog');
    expect(within(dialog).getByText(/alpha/i)).toBeInTheDocument();
  });

  it('confirming delete calls onDelete and closes dialog', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSection([MAPPING_A], { onDelete });
    await user.click(screen.getByRole('button', { name: /delete mapping alpha/i }));
    await user.click(screen.getByTestId('delete-confirm-button'));
    expect(onDelete).toHaveBeenCalledWith('a');
  });

  it('cancelling delete closes dialog without calling onDelete', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderSection([MAPPING_A], { onDelete });
    await user.click(screen.getByRole('button', { name: /delete mapping alpha/i }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByTestId('delete-confirm-dialog')).not.toBeInTheDocument();
  });

  it('clicking Duplicate calls onDuplicate immediately', async () => {
    const onDuplicate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSection([MAPPING_A], { onDuplicate });
    await user.click(screen.getByRole('button', { name: /duplicate mapping alpha/i }));
    expect(onDuplicate).toHaveBeenCalledWith('a');
  });

  it('table has correct column headers', () => {
    renderSection([MAPPING_A]);
    expect(screen.getByRole('button', { name: 'Sort by Name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by Rules' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by Coverage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by Status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by Last Modified' })).toBeInTheDocument();
    // Deploy column header (single header spanning 3 cols)
    expect(screen.getByText('Deploy')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Recently-edited affordance (AE-09, AE-10)
// ---------------------------------------------------------------------------

describe('MappingListSection — recently-edited affordance', () => {
  beforeEach(() => {
    clearRecentActivity();
  });

  it('AE-09: shows recently-edited card when matching activity exists', () => {
    setRecentActivity([
      {
        type: 'mapping',
        id: 'a',
        projectId: 'proj-1',
        name: 'Alpha',
        timestamp: new Date().toISOString(),
      },
    ]);

    renderSection([MAPPING_A]);

    expect(screen.getByTestId('recently-edited-mapping')).toBeInTheDocument();
    expect(screen.getByText('Continue where you left off')).toBeInTheDocument();
    const card = screen.getByTestId('recently-edited-mapping');
    expect(within(card).getByText('Alpha')).toBeInTheDocument();
  });

  it('AE-09: Resume link navigates to Mapping Editor', () => {
    setRecentActivity([
      {
        type: 'mapping',
        id: 'a',
        projectId: 'proj-1',
        name: 'Alpha',
        timestamp: new Date().toISOString(),
      },
    ]);

    renderSection([MAPPING_A]);

    const resumeLink = screen.getByTestId('recently-edited-resume-link');
    expect(resumeLink).toHaveAttribute('href', '/projects/proj-1/mappings/a');
  });

  it('AE-10: hides recently-edited card when no matching activity', () => {
    // No recent activity stored
    renderSection([MAPPING_A]);
    expect(screen.queryByTestId('recently-edited-mapping')).not.toBeInTheDocument();
  });

  it('AE-10: hides card when recent activity is for a different project', () => {
    setRecentActivity([
      {
        type: 'mapping',
        id: 'a',
        projectId: 'other-project',
        name: 'Alpha',
        timestamp: new Date().toISOString(),
      },
    ]);

    renderSection([MAPPING_A], { projectId: 'proj-1' });
    expect(screen.queryByTestId('recently-edited-mapping')).not.toBeInTheDocument();
  });

  it('AE-10: hides card when recent mapping no longer exists in mappings list', () => {
    setRecentActivity([
      {
        type: 'mapping',
        id: 'deleted-mapping-id',
        projectId: 'proj-1',
        name: 'Deleted Mapping',
        timestamp: new Date().toISOString(),
      },
    ]);

    renderSection([MAPPING_A]); // MAPPING_A has id 'a', not 'deleted-mapping-id'
    expect(screen.queryByTestId('recently-edited-mapping')).not.toBeInTheDocument();
  });

  it('AE-10: hides card when mappings list is empty', () => {
    setRecentActivity([
      {
        type: 'mapping',
        id: 'a',
        projectId: 'proj-1',
        name: 'Alpha',
        timestamp: new Date().toISOString(),
      },
    ]);

    renderSection([]); // empty mappings — card should not show
    expect(screen.queryByTestId('recently-edited-mapping')).not.toBeInTheDocument();
  });

  it('shows the most recently edited mapping when multiple exist', () => {
    const now = Date.now();
    setRecentActivity([
      {
        type: 'mapping',
        id: 'b',
        projectId: 'proj-1',
        name: 'Beta',
        timestamp: new Date(now - 1000).toISOString(), // 1 second ago
      },
      {
        type: 'mapping',
        id: 'a',
        projectId: 'proj-1',
        name: 'Alpha',
        timestamp: new Date(now - 60_000).toISOString(), // 1 minute ago
      },
    ]);

    renderSection([MAPPING_A, MAPPING_B]);

    const card = screen.getByTestId('recently-edited-mapping');
    // Beta is more recent
    expect(within(card).getByText('Beta')).toBeInTheDocument();
  });
});
