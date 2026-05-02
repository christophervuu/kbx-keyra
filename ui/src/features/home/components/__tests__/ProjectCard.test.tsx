import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectCard, ProjectCardGrid } from '../ProjectCard';
import type { ProjectListItem } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    projectId: 'p-1',
    name: 'Alpha Project',
    description: 'A test project description',
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
// ProjectCard tests
// ---------------------------------------------------------------------------

describe('ProjectCard', () => {
  it('renders project name', () => {
    render(<ProjectCard project={makeProject()} onClick={vi.fn()} />);
    expect(screen.getByText('Alpha Project')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<ProjectCard project={makeProject()} onClick={vi.fn()} />);
    expect(screen.getByText('A test project description')).toBeInTheDocument();
  });

  it('renders mapping count with singular form', () => {
    render(<ProjectCard project={makeProject({ mappingCount: 1 })} onClick={vi.fn()} />);
    expect(screen.getByText('1 mapping')).toBeInTheDocument();
  });

  it('renders mapping count with plural form', () => {
    render(<ProjectCard project={makeProject({ mappingCount: 4 })} onClick={vi.fn()} />);
    expect(screen.getByText('4 mappings')).toBeInTheDocument();
  });

  it('renders has-errors worst-status badge', () => {
    render(<ProjectCard project={makeProject({ worstStatus: 'has-errors' })} onClick={vi.fn()} />);
    expect(screen.getByText('Has Errors')).toBeInTheDocument();
  });

  it('renders ready worst-status badge', () => {
    render(<ProjectCard project={makeProject({ worstStatus: 'ready' })} onClick={vi.fn()} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('renders draft worst-status badge', () => {
    render(<ProjectCard project={makeProject({ worstStatus: 'draft' })} onClick={vi.fn()} />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders no badge for no-mappings status', () => {
    render(<ProjectCard project={makeProject({ worstStatus: 'no-mappings' })} onClick={vi.fn()} />);
    expect(screen.queryByText('No Mappings')).not.toBeInTheDocument();
  });

  it('renders DEV/QA/PROD environment labels', () => {
    render(<ProjectCard project={makeProject()} onClick={vi.fn()} />);
    expect(screen.getByText('DEV')).toBeInTheDocument();
    expect(screen.getByText('QA')).toBeInTheDocument();
    expect(screen.getByText('PROD')).toBeInTheDocument();
  });

  it('calls onClick with project ID when clicked', () => {
    const onClick = vi.fn();
    render(<ProjectCard project={makeProject()} onClick={onClick} />);
    fireEvent.click(screen.getByRole('article'));
    expect(onClick).toHaveBeenCalledWith('p-1');
  });

  it('calls onClick when Enter key is pressed', () => {
    const onClick = vi.fn();
    render(<ProjectCard project={makeProject()} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('article'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledWith('p-1');
  });

  it('calls onClick when Space key is pressed', () => {
    const onClick = vi.fn();
    render(<ProjectCard project={makeProject()} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('article'), { key: ' ' });
    expect(onClick).toHaveBeenCalledWith('p-1');
  });

  it('renders "No description" placeholder when description is empty', () => {
    render(<ProjectCard project={makeProject({ description: '' })} onClick={vi.fn()} />);
    expect(screen.getByText('No description')).toBeInTheDocument();
  });

  it('card is keyboard focusable (has tabIndex)', () => {
    render(<ProjectCard project={makeProject()} onClick={vi.fn()} />);
    expect(screen.getByRole('article')).toHaveAttribute('tabindex', '0');
  });
});

// ---------------------------------------------------------------------------
// ProjectCardGrid tests
// ---------------------------------------------------------------------------

describe('ProjectCardGrid', () => {
  it('renders all project cards', () => {
    const projects = [
      makeProject({ projectId: 'p-1', name: 'Alpha' }),
      makeProject({ projectId: 'p-2', name: 'Beta' }),
      makeProject({ projectId: 'p-3', name: 'Gamma' }),
    ];

    render(<ProjectCardGrid projects={projects} onProjectClick={vi.fn()} />);

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('renders empty grid with no projects', () => {
    const { container } = render(<ProjectCardGrid projects={[]} onProjectClick={vi.fn()} />);
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('passes onClick through to each card', () => {
    const onProjectClick = vi.fn();
    const projects = [makeProject({ projectId: 'p-1', name: 'Alpha' })];

    render(<ProjectCardGrid projects={projects} onProjectClick={onProjectClick} />);
    fireEvent.click(screen.getByRole('article'));
    expect(onProjectClick).toHaveBeenCalledWith('p-1');
  });
});
