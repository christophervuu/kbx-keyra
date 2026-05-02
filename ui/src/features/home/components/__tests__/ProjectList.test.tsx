import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ProjectList } from '../ProjectList';
import type { ProjectListItem } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    projectId: 'p-1',
    name: 'Alpha Project',
    description: 'Order system',
    mappingCount: 2,
    updatedAt: '2026-04-01T00:00:00Z',
    worstStatus: 'ready',
    devDeploy: 'not-deployed',
    qaDeploy: 'not-deployed',
    prodDeploy: 'not-deployed',
    ...overrides,
  };
}

const PROJECTS: ProjectListItem[] = [
  makeProject({ projectId: 'p-1', name: 'Alpha', description: 'order processing', worstStatus: 'ready', mappingCount: 1, updatedAt: '2026-04-01T00:00:00Z' }),
  makeProject({ projectId: 'p-2', name: 'Beta',  description: 'billing',          worstStatus: 'draft', mappingCount: 5, updatedAt: '2026-03-01T00:00:00Z' }),
  makeProject({ projectId: 'p-3', name: 'Gamma', description: 'customer portal',  worstStatus: 'has-errors', mappingCount: 3, updatedAt: '2026-05-01T00:00:00Z' }),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectList', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders all projects by default', () => {
    render(<ProjectList projects={PROJECTS} onProjectClick={vi.fn()} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<ProjectList projects={PROJECTS} onProjectClick={vi.fn()} />);
    expect(screen.getByRole('searchbox', { name: /search projects/i })).toBeInTheDocument();
  });

  it('filters projects by search query', () => {
    render(<ProjectList projects={PROJECTS} onProjectClick={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alpha' } });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument();
  });

  it('shows "Showing X of Y projects" when filtered', () => {
    render(<ProjectList projects={PROJECTS} onProjectClick={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alpha' } });
    expect(screen.getByText(/showing 1 of 3 projects/i)).toBeInTheDocument();
  });

  it('shows empty state message when no projects match', () => {
    render(<ProjectList projects={PROJECTS} onProjectClick={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz-no-match' } });
    expect(screen.getByText(/no projects match/i)).toBeInTheDocument();
  });

  it('filters by status via filter dropdown', () => {
    render(<ProjectList projects={PROJECTS} onProjectClick={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox', { name: /filter by status/i }), {
      target: { value: 'has-errors' },
    });
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  it('toggles sort direction', () => {
    render(<ProjectList projects={PROJECTS} onProjectClick={vi.fn()} />);
    const toggleBtn = screen.getByRole('button', { name: /sort ascending/i });
    fireEvent.click(toggleBtn);
    expect(screen.getByRole('button', { name: /sort descending/i })).toBeInTheDocument();
  });

  it('switches to table view via toggle button', () => {
    render(<ProjectList projects={PROJECTS} onProjectClick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /table view/i }));
    expect(screen.getByRole('table', { name: /projects table/i })).toBeInTheDocument();
  });

  it('switches back to grid view via toggle button', () => {
    render(<ProjectList projects={PROJECTS} onProjectClick={vi.fn()} />);
    // Switch to table
    fireEvent.click(screen.getByRole('button', { name: /table view/i }));
    // Switch back to grid
    fireEvent.click(screen.getByRole('button', { name: /grid view/i }));
    // Grid is the default — articles should be visible
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
  });

  it('persists view mode to localStorage when toggled', () => {
    render(<ProjectList projects={PROJECTS} onProjectClick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /table view/i }));
    expect(localStorage.getItem('keyra:dashboard:viewMode')).toBe('table');
  });

  it('reads initial view mode from localStorage', () => {
    localStorage.setItem('keyra:dashboard:viewMode', 'table');
    render(<ProjectList projects={PROJECTS} onProjectClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /table view/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('calls onProjectClick when a project card is clicked', () => {
    const onProjectClick = vi.fn();
    render(<ProjectList projects={[makeProject({ projectId: 'p-1', name: 'Alpha' })]} onProjectClick={onProjectClick} />);
    fireEvent.click(screen.getByRole('article', { name: /alpha/i }));
    expect(onProjectClick).toHaveBeenCalledWith('p-1');
  });
});
