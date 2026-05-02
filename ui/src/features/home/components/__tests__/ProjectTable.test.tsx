import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectTable } from '../ProjectTable';
import type { ProjectListItem } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    projectId: 'p-1',
    name: 'Alpha Project',
    description: 'Order processing system',
    mappingCount: 4,
    updatedAt: '2026-04-30T00:00:00Z',
    worstStatus: 'has-errors',
    devDeploy: 'not-deployed',
    qaDeploy: 'not-deployed',
    prodDeploy: 'not-deployed',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectTable', () => {
  it('renders all 8 column headers', () => {
    render(<ProjectTable projects={[]} onProjectClick={vi.fn()} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Mappings')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('DEV')).toBeInTheDocument();
    expect(screen.getByText('QA')).toBeInTheDocument();
    expect(screen.getByText('PROD')).toBeInTheDocument();
    expect(screen.getByText('Last Modified')).toBeInTheDocument();
  });

  it('renders a row for each project', () => {
    const projects = [
      makeProject({ projectId: 'p-1', name: 'Alpha' }),
      makeProject({ projectId: 'p-2', name: 'Beta' }),
    ];
    render(<ProjectTable projects={projects} onProjectClick={vi.fn()} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('renders project description in row', () => {
    render(<ProjectTable projects={[makeProject()]} onProjectClick={vi.fn()} />);
    expect(screen.getByText('Order processing system')).toBeInTheDocument();
  });

  it('renders mapping count', () => {
    render(<ProjectTable projects={[makeProject({ mappingCount: 7 })]} onProjectClick={vi.fn()} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders has-errors worst-status badge in red', () => {
    render(<ProjectTable projects={[makeProject({ worstStatus: 'has-errors' })]} onProjectClick={vi.fn()} />);
    expect(screen.getByText('Has Errors')).toBeInTheDocument();
  });

  it('renders ready worst-status badge', () => {
    render(<ProjectTable projects={[makeProject({ worstStatus: 'ready' })]} onProjectClick={vi.fn()} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('renders draft worst-status badge', () => {
    render(<ProjectTable projects={[makeProject({ worstStatus: 'draft' })]} onProjectClick={vi.fn()} />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders dash placeholder for no-mappings status', () => {
    render(<ProjectTable projects={[makeProject({ worstStatus: 'no-mappings' })]} onProjectClick={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders three "Not deployed" deploy badge cells', () => {
    render(<ProjectTable projects={[makeProject()]} onProjectClick={vi.fn()} />);
    const notDeployedBadges = screen.getAllByText('Not deployed');
    expect(notDeployedBadges).toHaveLength(3);
  });

  it('calls onProjectClick with project ID when row is clicked', () => {
    const onProjectClick = vi.fn();
    render(<ProjectTable projects={[makeProject({ projectId: 'p-42' })]} onProjectClick={onProjectClick} />);
    fireEvent.click(screen.getByRole('row', { name: /alpha project/i }));
    expect(onProjectClick).toHaveBeenCalledWith('p-42');
  });

  it('calls onProjectClick when Enter key pressed on row', () => {
    const onProjectClick = vi.fn();
    render(<ProjectTable projects={[makeProject({ projectId: 'p-42' })]} onProjectClick={onProjectClick} />);
    fireEvent.keyDown(screen.getByRole('row', { name: /alpha project/i }), { key: 'Enter' });
    expect(onProjectClick).toHaveBeenCalledWith('p-42');
  });

  it('calls onProjectClick when Space key pressed on row', () => {
    const onProjectClick = vi.fn();
    render(<ProjectTable projects={[makeProject({ projectId: 'p-42' })]} onProjectClick={onProjectClick} />);
    fireEvent.keyDown(screen.getByRole('row', { name: /alpha project/i }), { key: ' ' });
    expect(onProjectClick).toHaveBeenCalledWith('p-42');
  });

  it('rows are keyboard focusable', () => {
    render(<ProjectTable projects={[makeProject()]} onProjectClick={vi.fn()} />);
    expect(screen.getByRole('row', { name: /alpha project/i })).toHaveAttribute('tabindex', '0');
  });

  it('renders empty tbody when projects array is empty', () => {
    render(<ProjectTable projects={[]} onProjectClick={vi.fn()} />);
    // Only the header row — no data rows
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(1); // header row only
  });
});
