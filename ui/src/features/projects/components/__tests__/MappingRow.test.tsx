import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  });

  it('renders "No schema" when sourceSchemaName is null', () => {
    renderRow({ ...MAPPING, sourceSchemaName: null });
    expect(screen.getAllByText('No schema').length).toBeGreaterThanOrEqual(1);
  });

  it('renders rule count', () => {
    renderRow();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders coverage as percentage', () => {
    renderRow();
    expect(screen.getByText('85%')).toBeInTheDocument();
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

  // AE-07: condensed deploy badge when all not-deployed
  it('AE-07: renders condensed "Not deployed" when all environments are not-deployed', () => {
    renderRow();
    expect(screen.getByTestId('deploy-condensed')).toBeInTheDocument();
    expect(screen.getByText('○ Not deployed')).toBeInTheDocument();
  });

  it('AE-07: condensed "Not deployed" is a link to deployment page', () => {
    renderRow();
    const link = screen.getByRole('link', { name: /not deployed/i });
    expect(link).toHaveAttribute('href', '/projects/proj-1/mappings/mapping-1/deploy');
  });

  it('AE-07: renders individual DEV/QA/PROD badges when any env differs', () => {
    renderRow({ ...MAPPING, devDeploy: 'deployed', qaDeploy: 'not-deployed', prodDeploy: 'not-deployed' });
    expect(screen.queryByTestId('deploy-condensed')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /DEV: Deployed/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /QA: Not deployed/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /PROD: Not deployed/i })).toBeInTheDocument();
  });

  it('AE-07: individual deploy badges link to deployment page', () => {
    renderRow({ ...MAPPING, devDeploy: 'stale', qaDeploy: 'not-deployed', prodDeploy: 'deployed' });
    const devLink = screen.getByRole('link', { name: /DEV: Stale/i });
    expect(devLink).toHaveAttribute('href', '/projects/proj-1/mappings/mapping-1/deploy');
  });

  // AE-14: deploy badge click navigates to deployment page
  it('AE-14: condensed deploy label navigates to deployment page', () => {
    renderRow();
    const link = screen.getByRole('link', { name: /not deployed/i });
    expect(link).toHaveAttribute('href', '/projects/proj-1/mappings/mapping-1/deploy');
  });

  // AE-17: Test Lab action
  it('AE-17: Test Lab action link is present', () => {
    renderRow();
    const link = screen.getByTestId('test-lab-link-mapping-1');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/projects/proj-1/mappings/mapping-1/test-lab');
  });

  it('AE-17: Test Lab link has accessible label', () => {
    renderRow();
    expect(screen.getByRole('link', { name: /test mapping my mapping in test lab/i })).toBeInTheDocument();
  });

  it('calls onDuplicate with mappingId when Duplicate clicked', () => {
    const onDuplicate = vi.fn();
    const { container } = render(
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
    const btn = container.querySelector('[aria-label="Duplicate mapping My Mapping"]')!;
    (btn as HTMLButtonElement).click();
    expect(onDuplicate).toHaveBeenCalledWith('mapping-1');
  });

  it('calls onDelete with mappingId when Delete clicked', () => {
    const onDelete = vi.fn();
    const { container } = render(
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
    const btn = container.querySelector('[aria-label="Delete mapping My Mapping"]')!;
    (btn as HTMLButtonElement).click();
    expect(onDelete).toHaveBeenCalledWith('mapping-1');
  });
});
