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
    origin: 'uploaded',
    ownership: 'user',
    dataFormat: 'JSON',
    status: 'ready',
    format: 'json-schema',
    displayFormat: 'JSON',
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

  it('renders JSON data format', () => {
    renderCard(makeItem({ dataFormat: 'JSON' }));
    expect(screen.getByTestId('data-format')).toHaveTextContent('JSON');
  });

  it('renders XML data format', () => {
    renderCard(makeItem({ dataFormat: 'XML', format: 'xsd' }));
    expect(screen.getByTestId('data-format')).toHaveTextContent('XML');
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

  it('renders CDM badge only for CDM ownership', () => {
    renderCard(makeItem({ origin: 'cdm', ownership: 'cdm' }));
    expect(screen.getByText('CDM')).toBeInTheDocument();
  });

  it('does not render origin badge for user-owned schemas', () => {
    renderCard(makeItem({ origin: 'uploaded', ownership: 'user' }));
    expect(screen.queryByText('Uploaded')).not.toBeInTheDocument();
  });

  it('falls back to Unknown label for malformed origin values', () => {
    renderCard(
      makeItem({
        origin: 'legacy-origin' as unknown as SchemaLibraryItem['origin'],
        ownership: 'cdm',
      }),
    );
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('CDM badge has schema-detail purple styling', () => {
    renderCard(makeItem({ origin: 'cdm', ownership: 'cdm' }));
    const badge = screen.getByText('CDM').closest('span');
    expect(badge?.className).toContain('border-purple-700');
    expect(badge?.className).toContain('bg-purple-900/40');
    expect(badge?.className).toContain('text-purple-200');
  });

  it('Uploaded badge has blue styling', () => {
    renderCard(makeItem({ origin: 'uploaded', ownership: 'cdm' }));
    const badge = screen.getByText('Uploaded').closest('span');
    expect(badge?.className).toContain('bg-blue-100');
    expect(badge?.className).toContain('text-blue-800');
  });

  it('renders disambiguator when present', () => {
    renderCard(makeItem({ disambiguator: 'KBXT · v1 · a1b2' }));
    expect(screen.getByTestId('schema-disambiguator')).toHaveTextContent('KBXT · v1 · a1b2');
  });

  // -------------------------------------------------------------------------
  // Status + sync metadata
  // -------------------------------------------------------------------------

  it('renders ready status badge', () => {
    renderCard(makeItem({ status: 'ready' }));
    expect(screen.getByTestId('schema-status-ready')).toBeInTheDocument();
  });

  it('renders ready status badge when schema status is needs_review', () => {
    renderCard(makeItem({ status: 'needs_review' }));
    expect(screen.getByTestId('schema-status-ready')).toBeInTheDocument();
  });

  it('renders processing status badge', () => {
    renderCard(makeItem({ status: 'processing' }));
    expect(screen.getByTestId('schema-status-processing')).toBeInTheDocument();
  });

  it('renders error status badge', () => {
    renderCard(makeItem({ status: 'error' }));
    expect(screen.getByTestId('schema-status-error')).toBeInTheDocument();
  });

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

  it('renders ready indicator for inferred sync status', () => {
    renderCard(makeItem({ syncStatus: 'inferred' }));
    expect(screen.getByTestId('sync-status-ready')).toBeInTheDocument();
  });

  it('renders no sync indicator for local (upload-only)', () => {
    renderCard(makeItem({ syncStatus: 'local' }));
    expect(screen.queryByTestId('sync-status-local')).not.toBeInTheDocument();
  });

  it('renders contextual zero-field copy for ready status', () => {
    renderCard(makeItem({ fieldCount: 0, status: 'ready' }));
    expect(screen.getByTestId('field-count')).toHaveTextContent('No fields detected');
  });

  it('renders contextual zero-field copy for processing status', () => {
    renderCard(makeItem({ fieldCount: 0, status: 'processing' }));
    expect(screen.getByTestId('field-count')).toHaveTextContent('No fields detected yet');
  });

  it('renders contextual zero-field copy for needs review status', () => {
    renderCard(makeItem({ fieldCount: 0, status: 'needs_review' }));
    expect(screen.getByTestId('field-count')).toHaveTextContent('No fields detected yet');
  });

  it('renders contextual zero-field copy for error status', () => {
    renderCard(makeItem({ fieldCount: 0, status: 'error' }));
    expect(screen.getByTestId('field-count')).toHaveTextContent('No fields detected (error)');
  });

  it('renders updated date row', () => {
    renderCard(makeItem({ updatedAt: '2026-05-10T00:00:00Z' }));
    expect(screen.getByTestId('updated-at')).toHaveTextContent('Updated');
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
