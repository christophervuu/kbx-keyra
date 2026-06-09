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
    expect(screen.getByRole('columnheader', { name: 'Fields' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Used by' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Updated' })).toBeInTheDocument();
  });

  it('shows CDM badge in name column for CDM rows only', () => {
    renderList([
      makeItem({ schemaId: 'schema-cdm', name: 'CDM Customer', ownership: 'cdm', origin: 'cdm' }),
      makeItem({ schemaId: 'schema-user', name: 'User Customer', ownership: 'user', origin: 'uploaded' }),
    ]);

    const cdmBadge = screen.getByTestId('schema-list-cdm-badge');
    expect(cdmBadge).toBeInTheDocument();
    expect(within(cdmBadge).getByText('CDM')).toBeInTheDocument();
    expect(screen.getAllByTestId('schema-library-list-row')).toHaveLength(2);
  });

  it('shows disambiguator when provided', () => {
    renderList([makeItem({ disambiguator: 'KBXT · v2 · a1b2' })]);
    expect(screen.getByTestId('schema-list-disambiguator')).toHaveTextContent('KBXT · v2 · a1b2');
  });

  it('renders contextual no-field summary in fields column', () => {
    renderList([makeItem({ fieldCount: 0, status: 'needs_review' })]);
    expect(screen.getByText('No fields (review)')).toBeInTheDocument();
  });

  it('row click navigates to schema detail', async () => {
    renderList([makeItem({ schemaId: 'schema-xyz', name: 'Customer Schema' })]);

    await userEvent.click(screen.getByTestId('schema-library-list-row'));
    expect(mockNavigate).toHaveBeenCalledWith('/schemas/schema-xyz');
  });
});
