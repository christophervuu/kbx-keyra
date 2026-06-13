import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    await user.click(screen.getByRole('button', { name: 'Sort by NAME' }));
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Alpha')).toBeInTheDocument(); // a < b
  });

  it('clicking Name header twice toggles to descending', async () => {
    const user = userEvent.setup();
    renderSection([MAPPING_A, MAPPING_B]);
    await user.click(screen.getByRole('button', { name: 'Sort by NAME' }));
    await user.click(screen.getByRole('button', { name: 'Sort by NAME' }));
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Beta')).toBeInTheDocument(); // b > a desc
  });

  it('clicking Delete icon opens confirmation dialog', async () => {
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

  it('clicking Duplicate icon calls onDuplicate immediately', async () => {
    const onDuplicate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSection([MAPPING_A], { onDuplicate });
    await user.click(screen.getByRole('button', { name: /duplicate mapping alpha/i }));
    expect(onDuplicate).toHaveBeenCalledWith('a');
  });

  it('table has correct all-caps column headers', () => {
    renderSection([MAPPING_A]);
    expect(screen.getByRole('button', { name: 'Sort by NAME' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by RULES' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by COVERAGE' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by STATUS' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by LAST MODIFIED' })).toBeInTheDocument();
    // Deployment / Actions headers
    expect(screen.getByText('DEPLOYMENT')).toBeInTheDocument();
    expect(screen.getByText('ACTIONS')).toBeInTheDocument();
  });

  it('table uses full-width container and fixed minimum width for readability', () => {
    renderSection([MAPPING_A]);
    expect(screen.getByTestId('mappings-table-container')).toBeInTheDocument();
    expect(screen.getByTestId('mappings-table')).toBeInTheDocument();
    expect(screen.getByTestId('mappings-table')).toHaveClass('min-w-[1080px]');
  });

  it('centers Rules, Coverage, Status, Deployment, and Last Modified headers', () => {
    renderSection([MAPPING_A]);

    expect(screen.getByRole('columnheader', { name: /RULES/i })).toHaveClass('text-center');
    expect(screen.getByRole('columnheader', { name: /COVERAGE/i })).toHaveClass('text-center');
    expect(screen.getByRole('columnheader', { name: /STATUS/i })).toHaveClass('text-center');
    expect(screen.getByRole('columnheader', { name: 'DEPLOYMENT' })).toHaveClass('text-center');
    expect(screen.getByRole('columnheader', { name: /LAST MODIFIED/i })).toHaveClass('text-center');
  });

  it('filters mappings by name search', async () => {
    const user = userEvent.setup();
    renderSection([MAPPING_A, MAPPING_B]);

    await user.type(screen.getByTestId('mappings-search-input'), 'alp');

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  it('filters mappings by source/target schema search', async () => {
    const user = userEvent.setup();
    const sourceMatch = makeMapping({
      mappingId: 's1',
      name: 'Gamma',
      sourceSchemaName: 'CustomerSource',
      targetSchemaName: 'TargetX',
    });
    const other = makeMapping({
      mappingId: 's2',
      name: 'Delta',
      sourceSchemaName: 'OrderSource',
      targetSchemaName: 'TargetY',
    });
    renderSection([sourceMatch, other]);

    await user.type(screen.getByTestId('mappings-search-input'), 'customer');

    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.queryByText('Delta')).not.toBeInTheDocument();
  });

  it('shows empty-search-result state when no mapping matches query', async () => {
    const user = userEvent.setup();
    renderSection([MAPPING_A]);

    await user.type(screen.getByTestId('mappings-search-input'), 'zzz-no-match');

    expect(screen.getByTestId('mappings-no-search-results')).toBeInTheDocument();
  });
});
