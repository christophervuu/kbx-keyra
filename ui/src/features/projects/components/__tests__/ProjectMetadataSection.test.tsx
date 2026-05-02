import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectDetail } from '@/lib/types/domain';
import { ProjectMetadataSection } from '../ProjectMetadataSection';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const MOCK_PROJECT: ProjectDetail = {
  projectId: 'project-1',
  name: 'My Project',
  description: 'A great project',
  slug: 'my-project',
  schemaRefs: [],
  tags: ['alpha', 'beta'],
  createdAt: '2026-01-15T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
  mappings: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectMetadataSection', () => {
  it('renders project name as a heading', () => {
    render(
      <ProjectMetadataSection
        project={MOCK_PROJECT}
        onUpdateName={vi.fn()}
        onUpdateDescription={vi.fn()}
        onUpdateTags={vi.fn()}
      />,
    );
    expect(screen.getByText('My Project')).toBeInTheDocument();
  });

  it('renders project description', () => {
    render(
      <ProjectMetadataSection
        project={MOCK_PROJECT}
        onUpdateName={vi.fn()}
        onUpdateDescription={vi.fn()}
        onUpdateTags={vi.fn()}
      />,
    );
    expect(screen.getByText('A great project')).toBeInTheDocument();
  });

  it('renders tags as pills', () => {
    render(
      <ProjectMetadataSection
        project={MOCK_PROJECT}
        onUpdateName={vi.fn()}
        onUpdateDescription={vi.fn()}
        onUpdateTags={vi.fn()}
      />,
    );
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('renders created and last-modified dates', () => {
    render(
      <ProjectMetadataSection
        project={MOCK_PROJECT}
        onUpdateName={vi.fn()}
        onUpdateDescription={vi.fn()}
        onUpdateTags={vi.fn()}
      />,
    );
    expect(screen.getByText(/Created:/)).toBeInTheDocument();
    expect(screen.getByText(/Last modified:/)).toBeInTheDocument();
  });

  it('renders "Updated by: Local User"', () => {
    render(
      <ProjectMetadataSection
        project={MOCK_PROJECT}
        onUpdateName={vi.fn()}
        onUpdateDescription={vi.fn()}
        onUpdateTags={vi.fn()}
      />,
    );
    expect(screen.getByText('Updated by: Local User')).toBeInTheDocument();
  });

  it('clicking name enters edit mode with pre-filled input', async () => {
    const user = userEvent.setup();
    render(
      <ProjectMetadataSection
        project={MOCK_PROJECT}
        onUpdateName={vi.fn()}
        onUpdateDescription={vi.fn()}
        onUpdateTags={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /project name/i }));
    expect(screen.getByRole('textbox', { name: /project name/i })).toHaveValue('My Project');
  });

  it('pressing Enter on name input calls onUpdateName', async () => {
    const onUpdateName = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ProjectMetadataSection
        project={MOCK_PROJECT}
        onUpdateName={onUpdateName}
        onUpdateDescription={vi.fn()}
        onUpdateTags={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /project name/i }));
    await user.clear(screen.getByRole('textbox', { name: /project name/i }));
    await user.type(screen.getByRole('textbox', { name: /project name/i }), 'New Name{Enter}');
    expect(onUpdateName).toHaveBeenCalledWith('New Name');
  });

  it('clicking description enters edit mode', async () => {
    const user = userEvent.setup();
    render(
      <ProjectMetadataSection
        project={MOCK_PROJECT}
        onUpdateName={vi.fn()}
        onUpdateDescription={vi.fn()}
        onUpdateTags={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /project description/i }));
    expect(screen.getByRole('textbox', { name: /project description/i })).toBeInTheDocument();
  });

  it('shows "Add a description…" placeholder when description is empty', () => {
    const emptyProject: ProjectDetail = { ...MOCK_PROJECT, description: '' };
    render(
      <ProjectMetadataSection
        project={emptyProject}
        onUpdateName={vi.fn()}
        onUpdateDescription={vi.fn()}
        onUpdateTags={vi.fn()}
      />,
    );
    expect(screen.getByText('Add a description…')).toBeInTheDocument();
  });
});
