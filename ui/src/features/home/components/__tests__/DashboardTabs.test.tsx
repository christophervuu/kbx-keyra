import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardTabs } from '../DashboardTabs';

const PROJECTS_CONTENT = <div>Projects content here</div>;

describe('DashboardTabs', () => {
  it('renders the tablist with accessible label', () => {
    render(<DashboardTabs>{PROJECTS_CONTENT}</DashboardTabs>);
    expect(screen.getByRole('tablist', { name: /dashboard sections/i })).toBeInTheDocument();
  });

  it('renders all three tab buttons', () => {
    render(<DashboardTabs>{PROJECTS_CONTENT}</DashboardTabs>);
    expect(screen.getByRole('tab', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Deployments' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeInTheDocument();
  });

  it('Projects tab is active by default (aria-selected=true)', () => {
    render(<DashboardTabs>{PROJECTS_CONTENT}</DashboardTabs>);
    expect(screen.getByRole('tab', { name: 'Projects' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Deployments' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'false');
  });

  it('renders children content in the Projects panel by default', () => {
    render(<DashboardTabs>{PROJECTS_CONTENT}</DashboardTabs>);
    expect(screen.getByText('Projects content here')).toBeInTheDocument();
  });

  it('Projects tabpanel has correct aria-labelledby', () => {
    render(<DashboardTabs>{PROJECTS_CONTENT}</DashboardTabs>);
    const panel = document.getElementById('tabpanel-projects');
    expect(panel).toHaveAttribute('aria-labelledby', 'tab-projects');
  });

  it('clicking Deployments tab shows the deployments placeholder message', () => {
    render(<DashboardTabs>{PROJECTS_CONTENT}</DashboardTabs>);
    fireEvent.click(screen.getByRole('tab', { name: 'Deployments' }));
    expect(
      screen.getByText(/deployment tracking available when backend is connected/i),
    ).toBeInTheDocument();
  });

  it('clicking Deployments tab sets its aria-selected to true', () => {
    render(<DashboardTabs>{PROJECTS_CONTENT}</DashboardTabs>);
    fireEvent.click(screen.getByRole('tab', { name: 'Deployments' }));
    expect(screen.getByRole('tab', { name: 'Deployments' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Projects' })).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking Activity tab shows the activity placeholder message', () => {
    render(<DashboardTabs>{PROJECTS_CONTENT}</DashboardTabs>);
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(
      screen.getByText(/activity feed available when backend is connected/i),
    ).toBeInTheDocument();
  });

  it('clicking Activity tab sets its aria-selected to true', () => {
    render(<DashboardTabs>{PROJECTS_CONTENT}</DashboardTabs>);
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking Projects again after switching restores children content', () => {
    render(<DashboardTabs>{PROJECTS_CONTENT}</DashboardTabs>);
    fireEvent.click(screen.getByRole('tab', { name: 'Deployments' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }));
    expect(screen.getByText('Projects content here')).toBeInTheDocument();
  });

  it('each tab has aria-controls pointing to its panel id', () => {
    render(<DashboardTabs>{PROJECTS_CONTENT}</DashboardTabs>);
    expect(screen.getByRole('tab', { name: 'Projects' })).toHaveAttribute('aria-controls', 'tabpanel-projects');
    expect(screen.getByRole('tab', { name: 'Deployments' })).toHaveAttribute('aria-controls', 'tabpanel-deployments');
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-controls', 'tabpanel-activity');
  });
});
