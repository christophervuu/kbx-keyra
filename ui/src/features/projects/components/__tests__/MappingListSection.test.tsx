import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { MappingRowData } from '../../types';
import { MappingListSection } from '../MappingListSection';

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
  } = {},
) {
  return render(
    <MemoryRouter>
      <MappingListSection
        mappings={mappings}
        projectId="proj-1"
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

  it('shows empty state when no mappings', () => {
    renderSection([]);
    expect(screen.getByTestId('mapping-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/no mappings yet/i)).toBeInTheDocument();
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
    // Use first Create Mapping button (header)
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
    expect(screen.getByText('DEV')).toBeInTheDocument();
    expect(screen.getByText('QA')).toBeInTheDocument();
    expect(screen.getByText('PROD')).toBeInTheDocument();
  });
});
