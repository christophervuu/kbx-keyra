import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { DashboardEmptyState } from '../DashboardEmptyState';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderComponent() {
  return render(
    <MemoryRouter>
      <DashboardEmptyState />
    </MemoryRouter>,
  );
}

describe('DashboardEmptyState', () => {
  it('renders "No projects yet" heading', () => {
    renderComponent();
    expect(screen.getByRole('heading', { name: /no projects yet/i })).toBeInTheDocument();
  });

  it('renders the subtext', () => {
    renderComponent();
    expect(
      screen.getByText(/create your first project to start mapping data/i),
    ).toBeInTheDocument();
  });

  it('renders "Create Your First Project" button', () => {
    renderComponent();
    expect(
      screen.getByRole('button', { name: /create your first project/i }),
    ).toBeInTheDocument();
  });

  it('button navigates to /projects/new on click', () => {
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /create your first project/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/projects/new');
  });

  it('has centered layout container', () => {
    const { container } = renderComponent();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toMatch(/items-center/);
    expect(wrapper.className).toMatch(/justify-center/);
  });
});
