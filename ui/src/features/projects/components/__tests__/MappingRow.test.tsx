import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { MappingRowData } from '../../types';
import { MappingRow } from '../MappingRow';

const MAPPING: MappingRowData = {
  mappingId: 'mapping-1',
  name: 'My Mapping',
  sourceSchemaName: 'Schema A',
  targetSchemaName: 'Schema B',
  ruleCount: 5,
  coverage: 0.85,
  status: 'ready',
  devDeploy: 'not-deployed',
  qaDeploy: 'not-deployed',
  prodDeploy: 'not-deployed',
  updatedAt: '2026-04-01T00:00:00Z',
};

function renderRow(mapping: MappingRowData = MAPPING, projectId = 'proj-1') {
  return render(
    <MemoryRouter>
      <table>
        <tbody>
          <MappingRow
            mapping={mapping}
            projectId={projectId}
            onDuplicate={vi.fn()}
            onDelete={vi.fn()}
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
}

describe('MappingRow', () => {
  it('renders mapping name as link to editor', () => {
    renderRow();
    const link = screen.getByRole('link', { name: 'My Mapping' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/projects/proj-1/mappings/mapping-1');
  });

  it('renders source and target schema names', () => {
    renderRow();
    expect(screen.getByText('Schema A')).toBeInTheDocument();
    expect(screen.getByText('Schema B')).toBeInTheDocument();
    expect(screen.getByTestId('source-target-cell')).toHaveClass('whitespace-nowrap');
  });

  it('renders "No schema" when sourceSchemaName is null', () => {
    renderRow({ ...MAPPING, sourceSchemaName: null });
    expect(screen.getAllByText('No schema').length).toBeGreaterThanOrEqual(1);
  });

  it('renders rule count centered in the Rules column', () => {
    renderRow();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByTestId('rules-cell')).toHaveClass('text-center');
  });

  it('renders coverage as percentage centered in the Coverage column', () => {
    renderRow();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByTestId('coverage-cell')).toHaveClass('text-center');
  });

  it('renders "—" when ruleCount is 0 and coverage is 0', () => {
    renderRow({ ...MAPPING, ruleCount: 0, coverage: 0 });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  // AE-08: filled background status badges
  it('AE-08: Ready status badge has green filled background', () => {
    renderRow();
    const badge = screen.getByText('Ready');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-green-600');
    expect(badge).toHaveClass('text-white');
  });

  it('AE-08: Has Errors status badge has red filled background', () => {
    renderRow({ ...MAPPING, status: 'has-errors' });
    const badge = screen.getByText('Has Errors');
    expect(badge).toHaveClass('bg-red-600');
    expect(badge).toHaveClass('text-white');
  });

  it('AE-08: Draft status badge has slate filled background', () => {
    renderRow({ ...MAPPING, status: 'draft' });
    const badge = screen.getByText('Draft');
    expect(badge).toHaveClass('bg-slate-600');
  });

  it('renders compact "Not deployed" deployment value centered in the Deployment column', () => {
    renderRow();
    expect(screen.getByTestId('deployment-cell')).toBeInTheDocument();
    expect(screen.getByTestId('deployment-cell')).toHaveClass('text-center');
    expect(screen.getByText('Not deployed')).toBeInTheDocument();
  });

  it('deployment cell links to mapping deployment page', () => {
    renderRow();
    const link = screen.getByRole('link', { name: /deployment state: not deployed/i });
    expect(link).toHaveAttribute('href', '/projects/proj-1/mappings/mapping-1/deploy');
  });

  it('normalizes stale to "Changed since deploy" in deployment column', () => {
    renderRow({ ...MAPPING, devDeploy: 'deployed', qaDeploy: 'not-deployed', prodDeploy: 'not-deployed' });
    expect(screen.getByText('DEV deployed')).toBeInTheDocument();
  });

  it('shows "Changed since deploy" instead of stale', () => {
    renderRow({ ...MAPPING, devDeploy: 'stale', qaDeploy: 'not-deployed', prodDeploy: 'deployed' });
    expect(screen.getByText('Changed since deploy')).toBeInTheDocument();
    expect(screen.queryByText(/stale/i)).not.toBeInTheDocument();
  });

  it('shows Deploying when any env is deploying', () => {
    renderRow({ ...MAPPING, devDeploy: 'deploying' });
    expect(screen.getByText('Deploying')).toBeInTheDocument();
  });

  it('shows highest deployed env preference (PROD > QA > DEV)', () => {
    renderRow({ ...MAPPING, devDeploy: 'deployed', qaDeploy: 'deployed', prodDeploy: 'deployed' });
    expect(screen.getByText('PROD deployed')).toBeInTheDocument();
  });

  it('ready mappings show icon actions and no Open/More text buttons', () => {
    renderRow({ ...MAPPING, status: 'ready' });
    expect(screen.getByRole('button', { name: /deploy mapping my mapping/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /test mapping my mapping in test lab/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /duplicate mapping my mapping/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete mapping my mapping/i })).toBeInTheDocument();
    expect(screen.queryByText(/^open$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more actions for my mapping/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('status-cell')).toHaveClass('text-center');
    expect(screen.getByTestId('last-modified-cell')).toHaveClass('text-center');
  });

  it('draft mappings show disabled Deploy action icon', () => {
    renderRow({ ...MAPPING, status: 'draft' });
    const deployButton = screen.getByRole('button', { name: /deploy mapping my mapping \(disabled\)/i });
    expect(deployButton).toBeInTheDocument();
    expect(deployButton).toBeDisabled();
  });

  it('has-errors mappings show disabled Deploy action icon', () => {
    renderRow({ ...MAPPING, status: 'has-errors' });
    const deployButton = screen.getByRole('button', { name: /deploy mapping my mapping \(disabled\)/i });
    expect(deployButton).toBeInTheDocument();
    expect(deployButton).toBeDisabled();
  });

  it('row click navigates to mapping editor route', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={(
              <table>
                <tbody>
                  <MappingRow
                    mapping={{ ...MAPPING, status: 'draft' }}
                    projectId="proj-1"
                    onDuplicate={vi.fn()}
                    onDelete={vi.fn()}
                  />
                </tbody>
              </table>
            )}
          />
          <Route path="/projects/:projectId/mappings/:mappingId" element={<div data-testid="mapping-editor-page" />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId('source-target-cell'));
    expect(screen.getByTestId('mapping-editor-page')).toBeInTheDocument();
  });

  it('Test Lab icon links to Test Lab route', () => {
    renderRow();
    expect(screen.getByRole('link', { name: /test mapping my mapping in test lab/i })).toHaveAttribute(
      'href',
      '/projects/proj-1/mappings/mapping-1/test-lab',
    );
  });

  it('Deploy icon is enabled for ready mappings', () => {
    renderRow({ ...MAPPING, status: 'ready' });
    const deployButton = screen.getByRole('button', { name: /deploy mapping my mapping/i });
    expect(deployButton).toBeEnabled();
  });

  it('calls onDuplicate with mappingId when duplicate icon clicked', async () => {
    const onDuplicate = vi.fn();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <table>
          <tbody>
            <MappingRow
              mapping={MAPPING}
              projectId="proj-1"
              onDuplicate={onDuplicate}
              onDelete={vi.fn()}
            />
          </tbody>
        </table>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /duplicate mapping my mapping/i }));
    expect(onDuplicate).toHaveBeenCalledWith('mapping-1');
  });

  it('calls onDelete with mappingId when delete icon clicked', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <table>
          <tbody>
            <MappingRow
              mapping={MAPPING}
              projectId="proj-1"
              onDuplicate={vi.fn()}
              onDelete={onDelete}
            />
          </tbody>
        </table>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /delete mapping my mapping/i }));
    expect(onDelete).toHaveBeenCalledWith('mapping-1');
  });
});
