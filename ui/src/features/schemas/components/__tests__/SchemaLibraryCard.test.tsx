import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SchemaLibraryItem } from '../../types';
import { SchemaLibraryCard } from '../SchemaLibraryCard';

// ---------------------------------------------------------------------------
// Mock useNavigate
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<SchemaLibraryItem> = {}): SchemaLibraryItem {
  return {
    schemaId: 'schema-abc',
    name: 'Customer Schema',
    description: 'Holds customer data',
    origin: 'local',
    scope: 'project',
    format: 'json-schema',
    displayFormat: 'JSON Schema',
    fieldCount: 12,
    syncStatus: 'local',
    projectCount: 2,
    projectNames: ['Project A', 'Project B'],
    updatedAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderCard(item: SchemaLibraryItem) {
  return render(
    <MemoryRouter>
      <SchemaLibraryCard item={item} />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaLibraryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the schema name', () => {
    renderCard(makeItem({ name: 'Order Schema' }));
    expect(screen.getByText('Order Schema')).toBeInTheDocument();
  });

  it('renders the field count', () => {
    renderCard(makeItem({ fieldCount: 42 }));
    expect(screen.getByTestId('field-count')).toHaveTextContent('42 fields');
  });

  it('renders singular field count', () => {
    renderCard(makeItem({ fieldCount: 1 }));
    expect(screen.getByTestId('field-count')).toHaveTextContent('1 field');
  });

  it('renders the display format', () => {
    renderCard(makeItem({ displayFormat: 'JSON Schema' }));
    expect(screen.getByTestId('display-format')).toHaveTextContent('JSON Schema');
  });

  it('renders XSD format', () => {
    renderCard(makeItem({ displayFormat: 'XSD', format: 'xsd' }));
    expect(screen.getByTestId('display-format')).toHaveTextContent('XSD');
  });

  it('renders Inferred format', () => {
    renderCard(makeItem({ displayFormat: 'Inferred' }));
    expect(screen.getByTestId('display-format')).toHaveTextContent('Inferred');
  });

  it('renders project count', () => {
    renderCard(makeItem({ projectCount: 3, projectNames: ['A', 'B', 'C'] }));
    expect(screen.getByTestId('project-count')).toHaveTextContent('Used by 3 projects');
  });

  it('renders singular project count', () => {
    renderCard(makeItem({ projectCount: 1, projectNames: ['Alpha'] }));
    expect(screen.getByTestId('project-count')).toHaveTextContent('Used by 1 project');
  });

  it('renders "not used" when project count is 0', () => {
    renderCard(makeItem({ projectCount: 0, projectNames: [] }));
    expect(screen.getByTestId('project-count')).toHaveTextContent('Not used by any project');
  });

  it('renders description when provided', () => {
    renderCard(makeItem({ description: 'Invoice data schema' }));
    expect(screen.getByText('Invoice data schema')).toBeInTheDocument();
  });

  it('omits description section when undefined', () => {
    renderCard(makeItem({ description: undefined }));
    expect(screen.queryByText('Invoice data schema')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Origin badges
  // -------------------------------------------------------------------------

  it('renders CDM origin badge with canonical text', () => {
    renderCard(makeItem({ origin: 'cdm' }));
    expect(screen.getByText('CDM (KBXT/KBX-Canonicals)')).toBeInTheDocument();
  });

  it('renders Published origin badge with correct text', () => {
    renderCard(makeItem({ origin: 'published' }));
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('renders Local origin badge with correct text', () => {
    renderCard(makeItem({ origin: 'local' }));
    expect(screen.getByText('Local')).toBeInTheDocument();
  });

  it('falls back to Unknown label for malformed origin values', () => {
    renderCard(
      makeItem({
        origin: 'legacy-origin' as unknown as SchemaLibraryItem['origin'],
      }),
    );
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('CDM badge has purple styling', () => {
    renderCard(makeItem({ origin: 'cdm' }));
    const badge = screen.getByText('CDM (KBXT/KBX-Canonicals)').closest('span');
    expect(badge?.className).toContain('bg-purple-100');
    expect(badge?.className).toContain('text-purple-800');
  });

  it('Published badge has blue styling', () => {
    renderCard(makeItem({ origin: 'published' }));
    const badge = screen.getByText('Published').closest('span');
    expect(badge?.className).toContain('bg-blue-100');
    expect(badge?.className).toContain('text-blue-800');
  });

  it('Local badge has green styling', () => {
    renderCard(makeItem({ origin: 'local' }));
    const badge = screen.getByText('Local').closest('span');
    expect(badge?.className).toContain('bg-green-100');
    expect(badge?.className).toContain('text-green-800');
  });

  // -------------------------------------------------------------------------
  // Scope badges
  // -------------------------------------------------------------------------

  it('renders Global scope badge', () => {
    renderCard(makeItem({ scope: 'global' }));
    expect(screen.getByText('Global')).toBeInTheDocument();
  });

  it('renders Project-Level scope badge', () => {
    renderCard(makeItem({ scope: 'project' }));
    expect(screen.getByText('Project-Level')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Sync status
  // -------------------------------------------------------------------------

  it('renders synced indicator', () => {
    renderCard(makeItem({ syncStatus: 'synced' }));
    expect(screen.getByTestId('sync-status-synced')).toBeInTheDocument();
    expect(screen.getByTestId('sync-status-synced')).toHaveTextContent('Synced');
  });

  it('renders update-available indicator', () => {
    renderCard(makeItem({ syncStatus: 'update-available' }));
    expect(screen.getByTestId('sync-status-update-available')).toBeInTheDocument();
    expect(screen.getByText('Update available')).toBeInTheDocument();
  });

  it('renders sync-failed indicator', () => {
    renderCard(makeItem({ syncStatus: 'sync-failed' }));
    expect(screen.getByTestId('sync-status-sync-failed')).toBeInTheDocument();
    expect(screen.getByText('Sync failed')).toBeInTheDocument();
  });

  it('renders inferred indicator', () => {
    renderCard(makeItem({ syncStatus: 'inferred' }));
    expect(screen.getByTestId('sync-status-inferred')).toBeInTheDocument();
  });

  it('renders no sync indicator for local (upload-only)', () => {
    renderCard(makeItem({ syncStatus: 'local' }));
    expect(screen.queryByTestId('sync-status-local')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it('has tabIndex={0}', () => {
    renderCard(makeItem());
    const card = screen.getByTestId('schema-library-card');
    expect(card).toHaveAttribute('tabindex', '0');
  });

  it('has role="article"', () => {
    renderCard(makeItem({ name: 'My Schema' }));
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('has aria-label with schema name', () => {
    renderCard(makeItem({ name: 'Invoice Schema' }));
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', 'Invoice Schema');
  });

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  it('click navigates to schema detail URL', async () => {
    renderCard(makeItem({ schemaId: 'schema-xyz' }));
    await userEvent.click(screen.getByTestId('schema-library-card'));
    expect(mockNavigate).toHaveBeenCalledWith('/schemas/schema-xyz');
  });

  it('Enter key navigates to schema detail URL', async () => {
    renderCard(makeItem({ schemaId: 'schema-xyz' }));
    const card = screen.getByTestId('schema-library-card');
    card.focus();
    await userEvent.keyboard('{Enter}');
    expect(mockNavigate).toHaveBeenCalledWith('/schemas/schema-xyz');
  });

  it('Space key navigates to schema detail URL', async () => {
    renderCard(makeItem({ schemaId: 'schema-xyz' }));
    const card = screen.getByTestId('schema-library-card');
    card.focus();
    await userEvent.keyboard(' ');
    expect(mockNavigate).toHaveBeenCalledWith('/schemas/schema-xyz');
  });

  // -------------------------------------------------------------------------
  // Project names tooltip
  // -------------------------------------------------------------------------

  it('renders tooltip with project names when projectCount > 0', () => {
    renderCard(makeItem({ projectCount: 2, projectNames: ['Alpha', 'Beta'] }));
    const el = screen.getByTestId('project-count');
    expect(el).toHaveAttribute('title', 'Alpha, Beta');
  });

  it('truncates tooltip to first 5 project names', () => {
    renderCard(
      makeItem({
        projectCount: 6,
        projectNames: ['A', 'B', 'C', 'D', 'E', 'F'],
      }),
    );
    const el = screen.getByTestId('project-count');
    expect(el.getAttribute('title')).toBe('A, B, C, D, E');
  });
});
