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

  it('renders Ready status badge in green', () => {
    renderRow();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toHaveClass('text-green-300');
  });

  it('renders Has Errors status badge in red', () => {
    renderRow({ ...MAPPING, status: 'has-errors' });
    expect(screen.getByText('Has Errors')).toHaveClass('text-red-300');
  });

  it('renders Draft status badge in gray', () => {
    renderRow({ ...MAPPING, status: 'draft' });
    expect(screen.getByText('Draft')).toHaveClass('text-slate-400');
  });

  it('renders three "Not deployed" deploy badges', () => {
    renderRow();
    const badges = screen.getAllByText('○ Not deployed');
    expect(badges).toHaveLength(3);
  });

  it('calls onDuplicate with mappingId when Duplicate clicked', async () => {
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
