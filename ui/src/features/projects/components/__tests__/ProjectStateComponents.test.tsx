import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ProjectErrorState } from '../ProjectErrorState';
import { ProjectNotFoundState } from '../ProjectNotFoundState';
import { ProjectOverviewSkeleton } from '../ProjectOverviewSkeleton';

// ---------------------------------------------------------------------------
// ProjectOverviewSkeleton
// ---------------------------------------------------------------------------

describe('ProjectOverviewSkeleton', () => {
  it('renders with testid', () => {
    render(<ProjectOverviewSkeleton />);
    expect(screen.getByTestId('project-overview-skeleton')).toBeInTheDocument();
  });

  it('renders animated pulse blocks', () => {
    const { container } = render(<ProjectOverviewSkeleton />);
    const pulseBlocks = container.querySelectorAll('.animate-pulse');
    expect(pulseBlocks.length).toBeGreaterThan(0);
  });

  // AE-15: skeleton reflects new layout
  it('AE-15: has role="status" for accessibility', () => {
    render(<ProjectOverviewSkeleton />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('AE-15: has sr-only "Loading project..." text', () => {
    render(<ProjectOverviewSkeleton />);
    expect(screen.getByText('Loading project...')).toBeInTheDocument();
  });

  it('AE-15: renders header area skeleton', () => {
    render(<ProjectOverviewSkeleton />);
    expect(screen.getByTestId('skeleton-header-area')).toBeInTheDocument();
  });

  it('does not render legacy summary row skeleton in FS-086 layout', () => {
    render(<ProjectOverviewSkeleton />);
    expect(screen.queryByTestId('skeleton-summary-row')).not.toBeInTheDocument();
  });

  it('AE-15: renders mappings area skeleton', () => {
    render(<ProjectOverviewSkeleton />);
    expect(screen.getByTestId('skeleton-mappings-area')).toBeInTheDocument();
  });

  it('does not render legacy schemas area skeleton in FS-086 layout', () => {
    render(<ProjectOverviewSkeleton />);
    expect(screen.queryByTestId('skeleton-schemas-area')).not.toBeInTheDocument();
  });

  it('AE-15: no tab bar skeleton (tabs removed in T-02)', () => {
    render(<ProjectOverviewSkeleton />);
    expect(screen.queryByTestId('skeleton-tab-bar')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ProjectErrorState
// ---------------------------------------------------------------------------

describe('ProjectErrorState', () => {
  it('renders with testid', () => {
    render(<ProjectErrorState onRetry={vi.fn()} />);
    expect(screen.getByTestId('project-error-state')).toBeInTheDocument();
  });

  it('shows "Failed to load project" heading', () => {
    render(<ProjectErrorState onRetry={vi.fn()} />);
    expect(screen.getByText(/failed to load project/i)).toBeInTheDocument();
  });

  it('shows optional error detail text', () => {
    render(<ProjectErrorState error="Network timeout" onRetry={vi.fn()} />);
    expect(screen.getByText('Network timeout')).toBeInTheDocument();
  });

  it('renders retry button', () => {
    render(<ProjectErrorState onRetry={vi.fn()} />);
    expect(screen.getByTestId('retry-button')).toBeInTheDocument();
  });

  it('retry button calls onRetry', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ProjectErrorState onRetry={onRetry} />);
    await user.click(screen.getByTestId('retry-button'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('has role=alert', () => {
    render(<ProjectErrorState onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ProjectNotFoundState
// ---------------------------------------------------------------------------

describe('ProjectNotFoundState', () => {
  it('renders with testid', () => {
    render(
      <MemoryRouter>
        <ProjectNotFoundState />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('project-not-found-state')).toBeInTheDocument();
  });

  it('shows "Project not found" heading', () => {
    render(
      <MemoryRouter>
        <ProjectNotFoundState />
      </MemoryRouter>,
    );
    expect(screen.getByText(/project not found/i)).toBeInTheDocument();
  });

  it('shows descriptive message', () => {
    render(
      <MemoryRouter>
        <ProjectNotFoundState />
      </MemoryRouter>,
    );
    expect(screen.getByText(/doesn't exist or was deleted/i)).toBeInTheDocument();
  });

  it('renders home dashboard link with correct href', () => {
    render(
      <MemoryRouter>
        <ProjectNotFoundState />
      </MemoryRouter>,
    );
    const link = screen.getByTestId('not-found-home-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });
});
