import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ProjectActionsSection } from '../ProjectActionsSection';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderSection(
  overrides: Partial<{
    projectId: string;
    mappingCount: number;
    schemaCount: number;
    onCreateMapping: () => void;
    onAddSchema: () => void;
    onDuplicateProject: () => Promise<void>;
    onDeleteProject: () => Promise<void>;
  }> = {},
) {
  return render(
    <MemoryRouter>
      <ProjectActionsSection
        projectId={overrides.projectId ?? 'proj-1'}
        mappingCount={overrides.mappingCount ?? 3}
        schemaCount={overrides.schemaCount ?? 2}
        onCreateMapping={overrides.onCreateMapping ?? vi.fn()}
        onAddSchema={overrides.onAddSchema ?? vi.fn()}
        onDuplicateProject={overrides.onDuplicateProject ?? vi.fn().mockResolvedValue(undefined)}
        onDeleteProject={overrides.onDeleteProject ?? vi.fn().mockResolvedValue(undefined)}
      />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectActionsSection', () => {
  it('renders Create Mapping button with primary styling', () => {
    renderSection();
    const btn = screen.getByRole('button', { name: /create mapping/i });
    expect(btn).toBeInTheDocument();
    // primary variant uses bg-blue-600
    expect(btn.className).toMatch(/bg-blue-600/);
  });

  it('renders Add Schema button', () => {
    renderSection();
    expect(screen.getByRole('button', { name: /add schema/i })).toBeInTheDocument();
  });

  it('renders Duplicate Project button', () => {
    renderSection();
    expect(screen.getByRole('button', { name: /duplicate project/i })).toBeInTheDocument();
  });

  it('Export Project button is disabled', () => {
    renderSection();
    expect(screen.getByRole('button', { name: /export project/i })).toBeDisabled();
  });

  it('Import Mapping button is disabled', () => {
    renderSection();
    expect(screen.getByRole('button', { name: /import mapping/i })).toBeDisabled();
  });

  it('renders Delete Project button', () => {
    renderSection();
    expect(screen.getByRole('button', { name: /delete project/i })).toBeInTheDocument();
  });

  it('Project Settings link points to correct route', () => {
    renderSection({ projectId: 'abc-123' });
    const link = screen.getByRole('link', { name: /project settings/i });
    expect(link).toHaveAttribute('href', '/projects/abc-123/settings');
  });

  it('clicking Create Mapping calls onCreateMapping', async () => {
    const onCreateMapping = vi.fn();
    const user = userEvent.setup();
    renderSection({ onCreateMapping });
    await user.click(screen.getByRole('button', { name: /create mapping/i }));
    expect(onCreateMapping).toHaveBeenCalled();
  });

  it('clicking Add Schema calls onAddSchema', async () => {
    const onAddSchema = vi.fn();
    const user = userEvent.setup();
    renderSection({ onAddSchema });
    await user.click(screen.getByRole('button', { name: /add schema/i }));
    expect(onAddSchema).toHaveBeenCalled();
  });

  it('clicking Duplicate Project calls onDuplicateProject', async () => {
    const onDuplicateProject = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSection({ onDuplicateProject });
    await user.click(screen.getByRole('button', { name: /duplicate project/i }));
    expect(onDuplicateProject).toHaveBeenCalled();
  });

  it('clicking Delete Project opens confirmation dialog', async () => {
    const user = userEvent.setup();
    renderSection({ mappingCount: 4, schemaCount: 2 });
    await user.click(screen.getByRole('button', { name: /delete project/i }));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
  });

  it('delete confirmation message includes mapping and schema counts', async () => {
    const user = userEvent.setup();
    renderSection({ mappingCount: 4, schemaCount: 2 });
    await user.click(screen.getByRole('button', { name: /delete project/i }));
    expect(
      screen.getByText(/this will delete 4 mappings and unlink 2 schemas/i),
    ).toBeInTheDocument();
  });

  it('delete confirmation message handles singular counts', async () => {
    const user = userEvent.setup();
    renderSection({ mappingCount: 1, schemaCount: 1 });
    await user.click(screen.getByRole('button', { name: /delete project/i }));
    expect(
      screen.getByText(/this will delete 1 mapping and unlink 1 schema\./i),
    ).toBeInTheDocument();
  });

  it('confirming delete calls onDeleteProject', async () => {
    const onDeleteProject = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSection({ onDeleteProject });
    await user.click(screen.getByRole('button', { name: /delete project/i }));
    await user.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onDeleteProject).toHaveBeenCalled();
  });

  it('cancelling delete does not call onDeleteProject', async () => {
    const onDeleteProject = vi.fn();
    const user = userEvent.setup();
    renderSection({ onDeleteProject });
    await user.click(screen.getByRole('button', { name: /delete project/i }));
    await user.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(onDeleteProject).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  it('section has accessible label', () => {
    renderSection();
    expect(screen.getByRole('region', { name: /project actions/i })).toBeInTheDocument();
  });
});
