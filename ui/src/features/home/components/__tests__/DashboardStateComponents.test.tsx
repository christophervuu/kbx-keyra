import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DashboardSkeleton } from '../DashboardSkeleton';
import { DashboardErrorBanner } from '../DashboardErrorBanner';

// ---------------------------------------------------------------------------
// DashboardSkeleton
// ---------------------------------------------------------------------------

describe('DashboardSkeleton', () => {
  it('renders the status role with accessible label', () => {
    render(<DashboardSkeleton />);
    expect(screen.getByRole('status', { name: /loading dashboard/i })).toBeInTheDocument();
  });

  it('includes sr-only loading text', () => {
    render(<DashboardSkeleton />);
    expect(screen.getByText(/loading dashboard data/i)).toBeInTheDocument();
  });

  it('renders 6 project card skeleton blocks', () => {
    const { container } = render(<DashboardSkeleton />);
    // Card skeletons sit inside the 3-column grid — each has a footer border-t
    const footers = container.querySelectorAll('.border-t.border-slate-800');
    expect(footers).toHaveLength(6);
  });

  it('renders metrics bar skeleton blocks', () => {
    const { container } = render(<DashboardSkeleton />);
    // 4 single-stat cards + 1 status card = 5 top-level flex columns in the metrics row
    // Each single-stat card has an h-8 block (count placeholder)
    const countBlocks = container.querySelectorAll('.h-8.w-16');
    expect(countBlocks).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// DashboardErrorBanner
// ---------------------------------------------------------------------------

describe('DashboardErrorBanner', () => {
  it('renders the default error message', () => {
    render(<DashboardErrorBanner onRetry={vi.fn()} />);
    expect(screen.getByText('Failed to load dashboard data')).toBeInTheDocument();
  });

  it('renders a custom message when provided', () => {
    render(<DashboardErrorBanner message="Something went wrong" onRetry={vi.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders with role="alert"', () => {
    render(<DashboardErrorBanner onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the Retry button', () => {
    render(<DashboardErrorBanner onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('calls onRetry when Retry is clicked', () => {
    const onRetry = vi.fn();
    render(<DashboardErrorBanner onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
