import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';

import { AppLayout } from '@/components/layout/AppLayout';
import { BreadcrumbProvider, useBreadcrumbLabel } from '@/components/layout/BreadcrumbContext';
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
      <BreadcrumbProvider>
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
      </BreadcrumbProvider>
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

// ---------------------------------------------------------------------------
// Helper: a page component that registers a breadcrumb label
// ---------------------------------------------------------------------------

function PageWithLabel({
  segmentValue,
  label,
}: {
  segmentValue: string;
  label: string | undefined;
}) {
  useBreadcrumbLabel(segmentValue, label);
  return <div data-testid="page-content" />;
}

function renderBreadcrumbsWithLabel(
  path: string,
  segmentValue: string,
  label: string | undefined,
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BreadcrumbProvider>
        <Routes>
          <Route
            element={
              <>
                <Breadcrumbs />
                <Outlet />
              </>
            }
          >
            <Route
              path="/projects/:projectId"
              element={<PageWithLabel segmentValue={segmentValue} label={label} />}
            />
            <Route path="*" element={<div />} />
          </Route>
        </Routes>
      </BreadcrumbProvider>
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

  // -------------------------------------------------------------------------
  // BreadcrumbContext label resolution (FS-050 AE-01, AE-02, AE-03)
  // -------------------------------------------------------------------------

  it('AE-01: shows registered human-readable label instead of raw segment', () => {
    renderBreadcrumbsWithLabel('/projects/abc-123-uuid', 'abc-123-uuid', 'Order Processing');

    // Should show the human-readable name, not the raw UUID
    expect(screen.getByText('Order Processing')).toBeInTheDocument();
    expect(screen.queryByText('abc-123-uuid')).not.toBeInTheDocument();
  });

  it('AE-02: shows "Loading..." when label is undefined (data still loading)', () => {
    renderBreadcrumbsWithLabel('/projects/abc-123-uuid', 'abc-123-uuid', undefined);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('abc-123-uuid')).not.toBeInTheDocument();
  });

  it('AE-03: shows raw segment when no label is registered (fallback)', () => {
    // Render without PageWithLabel — no label registered for the segment
    renderBreadcrumbs('/projects/abc-123-uuid');

    expect(screen.getByText('abc-123-uuid')).toBeInTheDocument();
  });

  it('multiple labels coexist for different segments', () => {
    // Register a label for the project segment; mapping segment has no label
    renderBreadcrumbsWithLabel(
      '/projects/proj-id',
      'proj-id',
      'My Project',
    );

    expect(screen.getByText('My Project')).toBeInTheDocument();
    // "Projects" static segment still renders correctly
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
  });

  it('falls back to raw segment when context has no label for that segment', () => {
    // Register a label for a different segment — the project segment gets no label
    render(
      <MemoryRouter initialEntries={['/projects/proj-id']}>
        <BreadcrumbProvider>
          <Routes>
            <Route
              element={
                <>
                  <Breadcrumbs />
                  <Outlet />
                </>
              }
            >
              <Route
                path="/projects/:projectId"
                element={
                  // Register label for a different segment value
                  <PageWithLabel segmentValue="some-other-id" label="Other Thing" />
                }
              />
            </Route>
          </Routes>
        </BreadcrumbProvider>
      </MemoryRouter>,
    );

    // proj-id has no registered label → shows raw value
    expect(screen.getByText('proj-id')).toBeInTheDocument();
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

  it('provides BreadcrumbProvider so useBreadcrumbLabel works inside layout', () => {
    // Verify that a page inside AppLayout can register a label without throwing
    function PageWithBreadcrumb() {
      useBreadcrumbLabel('some-id', 'Human Name');
      return <div data-testid="inner-page" />;
    }

    render(
      <MemoryRouter initialEntries={['/schemas']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/schemas" element={<PageWithBreadcrumb />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('inner-page')).toBeInTheDocument();
    // "Schemas" appears in both the NavBar link and the breadcrumb — confirm
    // at least one instance is present in the breadcrumb nav
    const breadcrumbNav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumbNav).getByText('Schemas')).toBeInTheDocument();
  });
});
