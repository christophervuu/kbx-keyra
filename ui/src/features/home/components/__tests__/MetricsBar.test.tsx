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
};

const ZERO_METRICS: DashboardMetrics = {
  totalProjects: 0,
  totalMappings: 0,
  totalSchemas: 0,
  statusBreakdown: { ready: 0, draft: 0, hasErrors: 0 },
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

  it('does not render a "Deployed" card', () => {
    render(<MetricsBar metrics={METRICS} loading={false} />);
    expect(screen.queryByText('Deployed')).not.toBeInTheDocument();
  });

  it('applies error emphasis styling on status card when hasErrors > 0', () => {
    render(<MetricsBar metrics={METRICS} loading={false} />);
    const statusCard = screen.getByTestId('metrics-status-card');
    expect(statusCard.className).toMatch(/bg-red-500\/10/);
    expect(statusCard.className).toMatch(/border-red-500\/30/);
  });

  it('does not apply error emphasis styling when hasErrors is 0', () => {
    render(<MetricsBar metrics={ZERO_METRICS} loading={false} />);
    const statusCard = screen.getByTestId('metrics-status-card');
    expect(statusCard.className).not.toMatch(/bg-red-500\/10/);
    expect(statusCard.className).toMatch(/border-slate-700/);
  });

  it('renders zero metrics gracefully — all counts show 0', () => {
    render(<MetricsBar metrics={ZERO_METRICS} loading={false} />);
    // totalProjects(0), totalMappings(0), totalSchemas(0)
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/0\s+Ready/i)).toBeInTheDocument();
    expect(screen.getByText(/0\s+Draft/i)).toBeInTheDocument();
    expect(screen.getByText(/0\s+Has Errors/i)).toBeInTheDocument();
  });
});
