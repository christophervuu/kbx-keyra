import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SchemaCardData } from '../../types';
import { SchemaCard } from '../SchemaCard';

const SCHEMA: SchemaCardData = {
  schemaId: 'schema-1',
  name: 'Customer Schema',
  format: 'json-schema',
  origin: 'local',
  scope: 'project-level',
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

  it('renders JSON Schema format badge', () => {
    renderCard();
    expect(screen.getByText('JSON Schema')).toBeInTheDocument();
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

  it('calls onRemove with schemaId when Remove button clicked', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <SchemaCard schema={SCHEMA} usageCount={0} onView={vi.fn()} onRemove={onRemove} />,
    );
    await user.click(screen.getByRole('button', { name: /remove schema customer schema/i }));
    expect(onRemove).toHaveBeenCalledWith('schema-1');
  });

  // AE-13: color-coded origin badges
  it('AE-13: CDM origin shows blue badge', () => {
    renderCard({ origin: 'cdm' });
    const badge = screen.getByTestId('origin-badge-cdm');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('CDM');
    expect(badge).toHaveClass('bg-blue-100');
    expect(badge).toHaveClass('text-blue-800');
  });

  it('AE-13: Published origin shows purple badge', () => {
    renderCard({ origin: 'published' });
    const badge = screen.getByTestId('origin-badge-published');
    expect(badge).toHaveTextContent('Published');
    expect(badge).toHaveClass('bg-purple-100');
    expect(badge).toHaveClass('text-purple-800');
  });

  it('AE-13: Local origin shows gray badge', () => {
    renderCard({ origin: 'local' });
    const badge = screen.getByTestId('origin-badge-local');
    expect(badge).toHaveTextContent('Local');
    expect(badge).toHaveClass('bg-gray-100');
    expect(badge).toHaveClass('text-gray-700');
  });

  // AE-13: scope badges
  it('AE-13: global scope shows "Global" badge', () => {
    renderCard({ scope: 'global' });
    expect(screen.getByTestId('scope-badge-global')).toHaveTextContent('Global');
  });

  it('AE-13: project scope shows "Project" badge', () => {
    renderCard({ scope: 'project-level' });
    expect(screen.getByTestId('scope-badge-project')).toHaveTextContent('Project');
  });

  // AE-13: sync status indicators
  it('AE-13: shows "Synced" indicator for synced non-local schema', () => {
    renderCard({ origin: 'cdm', syncStatus: 'synced' });
    expect(screen.getByTestId('sync-status-synced')).toBeInTheDocument();
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('AE-13: shows "Not synced" indicator for not-synced non-local schema', () => {
    renderCard({ origin: 'cdm', syncStatus: 'not-synced' });
    expect(screen.getByTestId('sync-status-not-synced')).toBeInTheDocument();
    expect(screen.getByText('Not synced')).toBeInTheDocument();
  });

  it('AE-13: shows "Local changes" indicator for local-changes non-local schema', () => {
    renderCard({ origin: 'published', syncStatus: 'local-changes' });
    expect(screen.getByTestId('sync-status-local-changes')).toBeInTheDocument();
    expect(screen.getByText('Local changes')).toBeInTheDocument();
  });

  it('AE-13: no sync indicator for local-origin schemas', () => {
    renderCard({ origin: 'local', syncStatus: 'not-synced' });
    expect(screen.queryByTestId(/sync-status/)).not.toBeInTheDocument();
    expect(screen.queryByText('Not synced')).not.toBeInTheDocument();
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
