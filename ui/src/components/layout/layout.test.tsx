import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';

import { AppLayout } from '@/components/layout/AppLayout';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { NavBar } from '@/components/layout/NavBar';

function renderNavBar(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavBar />
      <Routes>
        <Route path="/" element={<div data-testid="page-home" />} />
        <Route path="/schemas" element={<div data-testid="page-schemas" />} />
        <Route path="/templates" element={<div data-testid="page-templates" />} />
        <Route path="/settings" element={<div data-testid="page-settings" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderBreadcrumbs(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          element={
            <>
              <Breadcrumbs />
              <Outlet />
            </>
          }
        >
          <Route path="/" element={<div />} />
          <Route path="/projects/:projectId" element={<div />} />
          <Route path="/projects/:projectId/mappings/:mappingId" element={<div />} />
          <Route path="/schemas" element={<div />} />
          <Route path="/schemas/:schemaId" element={<div />} />
          <Route path="*" element={<div />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function renderAppLayout(path: string, content: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={content} />
          <Route path="/schemas" element={content} />
          <Route path="/projects/:projectId/mappings/:mappingId" element={content} />
          <Route path="*" element={<div data-testid="page-not-found">Not Found</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('NavBar', () => {
  it('renders the app name', () => {
    renderNavBar();

    expect(screen.getByText('KeyRa')).toBeInTheDocument();
  });

  it('renders all 4 primary nav links (AE-04)', () => {
    renderNavBar();

    expect(screen.getByRole('link', { name: /Home/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Schemas/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Templates/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Settings/ })).toBeInTheDocument();
  });

  it('highlights the active link', () => {
    renderNavBar('/schemas');

    const schemasLink = screen.getByRole('link', { name: /Schemas/ });
    expect(schemasLink).toHaveClass('bg-slate-700');
  });

  it('navigates to correct route on click (AE-04)', async () => {
    const user = userEvent.setup();
    renderNavBar('/');

    await user.click(screen.getByRole('link', { name: /Schemas/ }));

    expect(screen.getByTestId('page-schemas')).toBeInTheDocument();
  });

  it('has accessible navigation landmark', () => {
    renderNavBar();

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });
});

describe('Breadcrumbs', () => {
  it('does not render on home page', () => {
    renderBreadcrumbs('/');

    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
  });

  it('renders breadcrumbs for /schemas', () => {
    renderBreadcrumbs('/schemas');

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Schemas')).toBeInTheDocument();
  });

  it('renders breadcrumbs with dynamic params for nested routes (AE-05)', () => {
    renderBreadcrumbs('/projects/abc-123/mappings/map-456');

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'abc-123' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mappings' })).toBeInTheDocument();
    // Last segment is plain text, not a link
    expect(screen.getByText('map-456')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'map-456' })).not.toBeInTheDocument();
  });

  it('last segment is not a link (AE-05)', () => {
    renderBreadcrumbs('/schemas/my-schema');

    const lastSegment = screen.getByText('my-schema');
    expect(lastSegment.tagName).not.toBe('A');
    expect(lastSegment).toHaveAttribute('aria-current', 'page');
  });

  it('breadcrumb links navigate to parent routes (AE-05)', async () => {
    const user = userEvent.setup();
    renderBreadcrumbs('/projects/abc-123/mappings/map-456');

    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink).toHaveAttribute('href', '/');

    const projectsLink = screen.getByRole('link', { name: 'Projects' });
    expect(projectsLink).toHaveAttribute('href', '/projects');

    const projectLink = screen.getByRole('link', { name: 'abc-123' });
    expect(projectLink).toHaveAttribute('href', '/projects/abc-123');

    const mappingsLink = screen.getByRole('link', { name: 'Mappings' });
    expect(mappingsLink).toHaveAttribute('href', '/projects/abc-123/mappings');

    // Clicking home navigates
    await user.click(homeLink);
  });

  it('renders separators between segments', () => {
    renderBreadcrumbs('/schemas/my-schema');

    const separators = screen.getAllByText('/');
    expect(separators.length).toBeGreaterThan(0);
  });
});

describe('AppLayout', () => {
  it('renders NavBar, Breadcrumbs, and page content together', () => {
    renderAppLayout('/schemas', <div data-testid="page-content">Page</div>);

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('renders Not Found page within the shell (AE-10)', () => {
    renderAppLayout('/unknown/path', <div />);

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByTestId('page-not-found')).toBeInTheDocument();
  });

  it('renders content in a main element', () => {
    renderAppLayout('/', <div data-testid="page-content">Content</div>);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });
});
