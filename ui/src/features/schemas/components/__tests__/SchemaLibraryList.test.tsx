import { render, screen } from '@testing-library/react';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { SchemaLibraryItem } from '../../types';
import { SchemaLibraryList } from '../SchemaLibraryList';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeItem(overrides: Partial<SchemaLibraryItem> = {}): SchemaLibraryItem {
  return {
    schemaId: 'schema-1',
    name: 'Customer',
    origin: 'uploaded',
    ownership: 'user',
    dataFormat: 'JSON',
    status: 'ready',
    format: 'json-schema',
    displayFormat: 'JSON',
    fieldCount: 12,
    syncStatus: 'local',
    projectCount: 1,
    projectNames: ['A'],
    lifecycle: 'draft',
    latestVersion: 0,
    draftRevision: null,
    archived: false,
    updatedAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderList(items: SchemaLibraryItem[]) {
  return render(
    <MemoryRouter>
      <SchemaLibraryList items={items} />
    </MemoryRouter>,
  );
}

describe('SchemaLibraryList', () => {
  it('renders required columns for list mode', () => {
    renderList([makeItem()]);
    expect(screen.getByRole('columnheader', { name: 'Schema' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Format' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '# of Fields' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Lifecycle' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Used by # of Projects' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Updated on' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Ownership' })).not.toBeInTheDocument();
  });

  it('shows CDM badge in name column for CDM rows only', () => {
    renderList([
      makeItem({ schemaId: 'schema-cdm', name: 'CDM Customer', ownership: 'cdm', origin: 'cdm' }),
      makeItem({ schemaId: 'schema-user', name: 'User Customer', ownership: 'user', origin: 'uploaded' }),
    ]);

    const cdmBadge = screen.getByTestId('schema-list-cdm-badge');
    expect(cdmBadge).toBeInTheDocument();
    expect(within(cdmBadge).getByText('CDM')).toBeInTheDocument();
    expect(cdmBadge.className).toContain('border-purple-700');
    expect(cdmBadge.className).toContain('bg-purple-900/40');
    expect(cdmBadge.className).toContain('text-purple-200');
    expect(screen.getAllByTestId('schema-library-list-row')).toHaveLength(2);
  });

  it('shows disambiguator when provided', () => {
    renderList([makeItem({ disambiguator: 'KBXT · v2 · a1b2' })]);
    expect(screen.getByTestId('schema-list-disambiguator')).toHaveTextContent('KBXT · v2 · a1b2');
  });

  it('renders contextual no-field summary in fields column', () => {
    renderList([makeItem({ fieldCount: 0, status: 'needs_review' })]);
    expect(screen.getByText('No fields yet')).toBeInTheDocument();
  });

  it('renders lifecycle summary in list rows', () => {
    renderList([makeItem({ latestVersion: 2, draftRevision: 6, lifecycle: 'versioned' })]);
    expect(screen.getByTestId('schema-list-lifecycle')).toHaveTextContent('v2 · Draft r6');
  });

  it('row click navigates to schema detail', async () => {
    renderList([makeItem({ schemaId: 'schema-xyz', name: 'Customer Schema' })]);

    await userEvent.click(screen.getByTestId('schema-library-list-row'));
    expect(mockNavigate).toHaveBeenCalledWith('/schemas/schema-xyz');
  });
});
