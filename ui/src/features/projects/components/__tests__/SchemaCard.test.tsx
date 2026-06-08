import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SchemaCardData } from '../../types';
import { SchemaCard } from '../SchemaCard';

const SCHEMA: SchemaCardData = {
  schemaId: 'schema-1',
  name: 'Customer Schema',
  format: 'json-schema',
  origin: 'uploaded',
  sourceType: 'upload',
  fieldCount: 12,
  syncStatus: 'synced',
  isInferred: false,
};

function renderCard(
  overrides: Partial<SchemaCardData> = {},
  usageCount = 0,
) {
  return render(
    <SchemaCard
      schema={{ ...SCHEMA, ...overrides }}
      usageCount={usageCount}
      onView={vi.fn()}
      onRemove={vi.fn()}
    />,
  );
}

describe('SchemaCard', () => {
  it('renders schema name', () => {
    renderCard();
    expect(screen.getByText('Customer Schema')).toBeInTheDocument();
  });

  it('renders JSON format badge', () => {
    renderCard();
    expect(screen.getByText('JSON')).toBeInTheDocument();
  });

  it('renders XSD format badge for xsd format', () => {
    renderCard({ format: 'xsd' });
    expect(screen.getByText('XSD')).toBeInTheDocument();
  });

  it('renders field count', () => {
    renderCard();
    expect(screen.getByText('12 fields')).toBeInTheDocument();
  });

  it('renders inferred warning when isInferred is true', () => {
    renderCard({ isInferred: true });
    expect(screen.getByText('Inferred from sample data')).toBeInTheDocument();
  });

  it('does not render inferred warning when isInferred is false', () => {
    renderCard();
    expect(screen.queryByText('Inferred from sample data')).not.toBeInTheDocument();
  });

  it('calls onView with schemaId when View button clicked', async () => {
    const onView = vi.fn();
    const user = userEvent.setup();
    render(
      <SchemaCard schema={SCHEMA} usageCount={0} onView={onView} onRemove={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: /view schema customer schema/i }));
    expect(onView).toHaveBeenCalledWith('schema-1');
  });

  it('calls onRemove with schemaId when Unlink button clicked', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <SchemaCard schema={SCHEMA} usageCount={0} onView={vi.fn()} onRemove={onRemove} />,
    );
    await user.click(screen.getByRole('button', { name: /unlink schema customer schema/i }));
    expect(onRemove).toHaveBeenCalledWith('schema-1');
  });

  it('shows Unlink action for CDM schemas', () => {
    renderCard({ origin: 'cdm' });
    expect(screen.getByRole('button', { name: /unlink schema customer schema/i })).toBeInTheDocument();
  });

  it('shows Re-sync action for CDM github schemas', () => {
    renderCard({ origin: 'cdm', sourceType: 'github' });
    expect(screen.getByRole('button', { name: /re-sync schema customer schema/i })).toBeInTheDocument();
  });

  it('hides Re-sync action for upload-backed schemas', () => {
    renderCard({ origin: 'uploaded', sourceType: 'upload' });
    expect(screen.queryByRole('button', { name: /re-sync schema customer schema/i })).not.toBeInTheDocument();
  });

  // AE-13: color-coded origin badges
  it('AE-13: CDM origin shows blue badge', () => {
    renderCard({ origin: 'cdm' });
    const badge = screen.getByTestId('origin-badge-cdm');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('CDM (KBXT/KBX-Canonicals)');
    expect(badge).toHaveClass('bg-blue-100');
    expect(badge).toHaveClass('text-blue-800');
  });

  it('AE-13: Uploaded origin shows purple badge', () => {
    renderCard({ origin: 'uploaded' });
    const badge = screen.getByTestId('origin-badge-uploaded');
    expect(badge).toHaveTextContent('Uploaded');
    expect(badge).toHaveClass('bg-purple-100');
    expect(badge).toHaveClass('text-purple-800');
  });

  it('AE-13: Inferred origin shows amber badge', () => {
    renderCard({ origin: 'inferred' });
    const badge = screen.getByTestId('origin-badge-inferred');
    expect(badge).toHaveTextContent('Inferred');
    expect(badge).toHaveClass('bg-amber-100');
    expect(badge).toHaveClass('text-amber-800');
  });

  // AE-13: sync status indicators
  it('AE-13: shows "Synced" indicator for synced schema', () => {
    renderCard({ origin: 'cdm', syncStatus: 'synced' });
    expect(screen.getByTestId('sync-status-synced')).toBeInTheDocument();
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('AE-13: shows "Update available" indicator for update-available schema', () => {
    renderCard({ origin: 'cdm', syncStatus: 'update-available' });
    expect(screen.getByTestId('sync-status-update-available')).toBeInTheDocument();
    expect(screen.getByText('Update available')).toBeInTheDocument();
  });

  it('AE-13: shows "Sync failed" indicator for sync-failed schema', () => {
    renderCard({ origin: 'cdm', syncStatus: 'sync-failed' });
    expect(screen.getByTestId('sync-status-sync-failed')).toBeInTheDocument();
    expect(screen.getByText('Sync failed')).toBeInTheDocument();
  });

  it('AE-13: shows sync indicator for uploaded schemas when sync metadata exists', () => {
    renderCard({ origin: 'uploaded', syncStatus: 'sync-failed' });
    expect(screen.getByTestId('sync-status-sync-failed')).toBeInTheDocument();
    expect(screen.getByText('Sync failed')).toBeInTheDocument();
  });

  // Usage count
  it('shows "Not used" when usageCount is 0', () => {
    renderCard({}, 0);
    expect(screen.getByTestId('schema-usage-count')).toHaveTextContent('Not used');
  });

  it('shows "Used by 1 mapping" when usageCount is 1', () => {
    renderCard({}, 1);
    expect(screen.getByTestId('schema-usage-count')).toHaveTextContent('Used by 1 mapping');
  });

  it('shows "Used by 3 mappings" when usageCount is 3', () => {
    renderCard({}, 3);
    expect(screen.getByTestId('schema-usage-count')).toHaveTextContent('Used by 3 mappings');
  });
});
