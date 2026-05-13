import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ProjectSummaryRow } from '../ProjectSummaryRow';

function renderRow(props: Partial<React.ComponentProps<typeof ProjectSummaryRow>> = {}) {
  const defaults = {
    mappingCount: 0,
    schemaCount: 0,
    errorCount: 0,
    projectId: 'proj-1',
  };
  return render(
    <MemoryRouter>
      <ProjectSummaryRow {...defaults} {...props} />
    </MemoryRouter>,
  );
}

describe('ProjectSummaryRow', () => {
  it('renders data-testid="project-summary-row" on root element', () => {
    renderRow();
    expect(screen.getByTestId('project-summary-row')).toBeInTheDocument();
  });

  it('renders mapping count', () => {
    renderRow({ mappingCount: 7 });
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Mappings')).toBeInTheDocument();
  });

  it('renders schema count', () => {
    renderRow({ schemaCount: 3 });
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Schemas')).toBeInTheDocument();
  });

  it('renders error count', () => {
    renderRow({ errorCount: 2 });
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();
  });

  it('AE-05: error count has red accent class when > 0', () => {
    renderRow({ errorCount: 1 });
    // The value "1" should have the red text class
    const errorValue = screen.getByText('1');
    expect(errorValue).toHaveClass('text-red-400');
  });

  it('AE-18: error count has neutral styling when 0', () => {
    renderRow({ errorCount: 0 });
    // The "0" error count value should NOT have red class
    // Find the error metric item by its aria-label
    const errorItem = screen.getByLabelText('Errors: 0');
    const valueEl = errorItem.querySelector('.text-red-400');
    expect(valueEl).not.toBeInTheDocument();
  });

  it('renders scaffold placeholder "—" for Stale Deployments', () => {
    renderRow();
    expect(screen.getByLabelText('Stale Deployments: not yet available')).toBeInTheDocument();
  });

  it('renders scaffold placeholder "—" for Ready to Deploy', () => {
    renderRow();
    expect(screen.getByLabelText('Ready to Deploy: not yet available')).toBeInTheDocument();
  });

  it('renders "View Deployments" link with correct href', () => {
    renderRow({ projectId: 'proj-abc' });
    const link = screen.getByTestId('view-deployments-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/projects/proj-abc/deployments');
  });

  it('renders correctly when all counts are 0 (new project)', () => {
    renderRow({ mappingCount: 0, schemaCount: 0, errorCount: 0 });
    expect(screen.getByTestId('project-summary-row')).toBeInTheDocument();
    // All zero values are rendered
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3); // mappings, schemas, errors
  });

  it('renders all 5 metric labels', () => {
    renderRow({ mappingCount: 4, schemaCount: 2, errorCount: 1 });
    expect(screen.getByText('Mappings')).toBeInTheDocument();
    expect(screen.getByText('Schemas')).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();
    expect(screen.getByText('Stale Deployments')).toBeInTheDocument();
    expect(screen.getByText('Ready to Deploy')).toBeInTheDocument();
  });
});
