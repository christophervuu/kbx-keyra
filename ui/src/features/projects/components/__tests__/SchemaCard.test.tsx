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
  syncStatus: 'ready',
  isInferred: false,
};

describe('SchemaCard', () => {
  it('renders schema name', () => {
    render(<SchemaCard schema={SCHEMA} onView={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Customer Schema')).toBeInTheDocument();
  });

  it('renders JSON Schema format badge', () => {
    render(<SchemaCard schema={SCHEMA} onView={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('JSON Schema')).toBeInTheDocument();
  });

  it('renders XSD format badge for xsd format', () => {
    const xsd: SchemaCardData = { ...SCHEMA, format: 'xsd' };
    render(<SchemaCard schema={xsd} onView={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('XSD')).toBeInTheDocument();
  });

  it('renders origin badge', () => {
    render(<SchemaCard schema={SCHEMA} onView={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Local')).toBeInTheDocument();
  });

  it('renders scope badge', () => {
    render(<SchemaCard schema={SCHEMA} onView={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Project-Level')).toBeInTheDocument();
  });

  it('renders field count', () => {
    render(<SchemaCard schema={SCHEMA} onView={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('12 fields')).toBeInTheDocument();
  });

  it('renders "Not synced" sync status', () => {
    render(<SchemaCard schema={SCHEMA} onView={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Not synced')).toBeInTheDocument();
  });

  it('renders inferred badge when isInferred is true', () => {
    const inferred: SchemaCardData = { ...SCHEMA, isInferred: true };
    render(<SchemaCard schema={inferred} onView={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Inferred from sample data')).toBeInTheDocument();
  });

  it('does not render inferred badge when isInferred is false', () => {
    render(<SchemaCard schema={SCHEMA} onView={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.queryByText('Inferred from sample data')).not.toBeInTheDocument();
  });

  it('calls onView with schemaId when View button clicked', async () => {
    const onView = vi.fn();
    const user = userEvent.setup();
    render(<SchemaCard schema={SCHEMA} onView={onView} onRemove={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /view schema customer schema/i }));
    expect(onView).toHaveBeenCalledWith('schema-1');
  });

  it('calls onRemove with schemaId when Remove button clicked', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<SchemaCard schema={SCHEMA} onView={vi.fn()} onRemove={onRemove} />);
    await user.click(screen.getByRole('button', { name: /remove schema customer schema/i }));
    expect(onRemove).toHaveBeenCalledWith('schema-1');
  });
});
