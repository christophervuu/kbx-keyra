import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MetricsBar } from '../MetricsBar';
import type { DashboardMetrics } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const METRICS: DashboardMetrics = {
  totalProjects: 3,
  totalMappings: 6,
  totalSchemas: 5,
  statusBreakdown: { ready: 2, draft: 3, hasErrors: 1 },
  deployedCount: 0,
};

const ZERO_METRICS: DashboardMetrics = {
  totalProjects: 0,
  totalMappings: 0,
  totalSchemas: 0,
  statusBreakdown: { ready: 0, draft: 0, hasErrors: 0 },
  deployedCount: 0,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MetricsBar', () => {
  it('shows animated skeleton when loading is true', () => {
    render(<MetricsBar metrics={null} loading={true} />);
    expect(screen.getByRole('status', { name: /loading metrics/i })).toBeInTheDocument();
  });

  it('shows animated skeleton when metrics is null even if loading is false', () => {
    render(<MetricsBar metrics={null} loading={false} />);
    expect(screen.getByRole('status', { name: /loading metrics/i })).toBeInTheDocument();
  });

  it('renders the metrics region when data is loaded', () => {
    render(<MetricsBar metrics={METRICS} loading={false} />);
    expect(screen.getByRole('region', { name: /dashboard metrics/i })).toBeInTheDocument();
  });

  it('shows correct project count', () => {
    render(<MetricsBar metrics={METRICS} loading={false} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('shows correct mappings count', () => {
    render(<MetricsBar metrics={METRICS} loading={false} />);
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Mappings')).toBeInTheDocument();
  });

  it('shows correct schemas count', () => {
    render(<MetricsBar metrics={METRICS} loading={false} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Schemas')).toBeInTheDocument();
  });

  it('shows status breakdown with correct counts', () => {
    render(<MetricsBar metrics={METRICS} loading={false} />);
    expect(screen.getByText(/2\s+Ready/i)).toBeInTheDocument();
    expect(screen.getByText(/3\s+Draft/i)).toBeInTheDocument();
    expect(screen.getByText(/1\s+Has Errors/i)).toBeInTheDocument();
  });

  it('shows deployments card with 0 value', () => {
    render(<MetricsBar metrics={METRICS} loading={false} />);
    expect(screen.getByText('Deployed')).toBeInTheDocument();
  });

  it('renders zero metrics gracefully — all counts show 0', () => {
    render(<MetricsBar metrics={ZERO_METRICS} loading={false} />);
    const zeros = screen.getAllByText('0');
    // totalProjects(0), totalMappings(0), totalSchemas(0), deployedCount(0)
    expect(zeros.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/0\s+Ready/i)).toBeInTheDocument();
    expect(screen.getByText(/0\s+Draft/i)).toBeInTheDocument();
    expect(screen.getByText(/0\s+Has Errors/i)).toBeInTheDocument();
  });
});
