import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppLayout } from '@/components/layout/AppLayout';
import { BreadcrumbProvider, useBreadcrumbLabel } from '@/components/layout/BreadcrumbContext';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { NavBar, SIDEBAR_COLLAPSED_STORAGE_KEY } from '@/components/layout/NavBar';

let storage: Record<string, string> = {};

const localStorageMock = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => {
    storage[key] = value;
  },
  removeItem: (key: string) => {
    delete storage[key];
  },
  clear: () => {
    storage = {};
  },
};

beforeEach(() => {
  storage = {};
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
});

function resetSidebarPreference() {
  try {
    window.localStorage.removeItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
  } catch {
    // ignore localStorage unavailability in certain jsdom modes
  }
}

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
            <Route path="/projects/:projectId/mappings/:mappingId/deploy" element={<div />} />
            <Route path="/projects/:projectId/deployments" element={<div />} />
            <Route path="/projects/:projectId/value-mappings" element={<div />} />
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
          <Route path="/projects/:projectId/mappings/new" element={content} />
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
            <Route
              path="/projects/:projectId/mappings/new"
              element={<PageWithLabel segmentValue={segmentValue} label={label} />}
            />
            <Route
              path="/projects/:projectId/value-mappings"
              element={<PageWithLabel segmentValue={segmentValue} label={label} />}
            />
            <Route path="*" element={<div />} />
          </Route>
        </Routes>
      </BreadcrumbProvider>
    </MemoryRouter>,
  );
}

function PageWithProjectAndMappingLabels({
  projectSegmentValue,
  projectLabel,
  mappingSegmentValue,
  mappingLabel,
}: {
  projectSegmentValue: string;
  projectLabel: string | undefined;
  mappingSegmentValue: string;
  mappingLabel: string | undefined;
}) {
  useBreadcrumbLabel(projectSegmentValue, projectLabel);
  useBreadcrumbLabel(mappingSegmentValue, mappingLabel);
  return <div data-testid="page-content" />;
}

function renderDeploymentBreadcrumbsWithLabels(params: {
  path: string;
  projectSegmentValue: string;
  projectLabel: string | undefined;
  mappingSegmentValue: string;
  mappingLabel: string | undefined;
}) {
  return render(
    <MemoryRouter initialEntries={[params.path]}>
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
              path="/projects/:projectId/mappings/:mappingId/deploy"
              element={(
                <PageWithProjectAndMappingLabels
                  projectSegmentValue={params.projectSegmentValue}
                  projectLabel={params.projectLabel}
                  mappingSegmentValue={params.mappingSegmentValue}
                  mappingLabel={params.mappingLabel}
                />
              )}
            />
            <Route path="*" element={<div />} />
          </Route>
        </Routes>
      </BreadcrumbProvider>
    </MemoryRouter>,
  );
}

describe('NavBar', () => {
  beforeEach(() => {
    resetSidebarPreference();
  });

  it('renders the app name', () => {
    renderNavBar();

    expect(screen.getByText('Key')).toBeInTheDocument();
    expect(screen.getByText('Ra')).toBeInTheDocument();
  });

  it('renders all 4 primary nav links in expanded mode', () => {
    renderNavBar();

    expect(screen.getByTestId('sidebar-link-home')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-link-schemas')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-link-templates')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-link-settings')).toBeInTheDocument();
  });

  it('highlights the active link with non-color active marker (AE-03)', () => {
    renderNavBar('/schemas');

    const schemasLink = screen.getByTestId('sidebar-link-schemas');
    expect(schemasLink).toHaveClass('border-l-blue-400');
    expect(schemasLink).toHaveClass('font-semibold');
  });

  it('navigates to correct route on click', async () => {
    const user = userEvent.setup();
    renderNavBar('/');

    await user.click(screen.getByRole('link', { name: /Schemas/ }));

    expect(screen.getByTestId('page-schemas')).toBeInTheDocument();
  });

  it('supports collapsing to icon-only mode and expanding back (AE-02)', async () => {
    const user = userEvent.setup();
    renderNavBar();

    const sidebar = screen.getByTestId('app-sidebar');
    const toggle = screen.getByTestId('sidebar-toggle');

    expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByText('Workspace')).toBeInTheDocument();

    await user.click(toggle);

    expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();

    await user.click(toggle);

    expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByText('Workspace')).toBeInTheDocument();
  });

  it('persists collapse preference in localStorage (AE-08)', async () => {
    const user = userEvent.setup();
    const { unmount } = renderNavBar();

    await user.click(screen.getByTestId('sidebar-toggle'));

    unmount();
    renderNavBar();

    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('data-collapsed', 'true');
  });

  it('has accessible navigation landmarks', () => {
    renderNavBar();

    expect(screen.getByRole('complementary', { name: 'App sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Sidebar navigation' })).toBeInTheDocument();
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
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'abc-123' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mappings' })).not.toBeInTheDocument();
    expect(screen.getByText('Mappings')).toBeInTheDocument();
    // Last segment is plain text, not a link
    expect(screen.getByText('map-456')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'map-456' })).not.toBeInTheDocument();
  });

  it('renders create-mapping breadcrumbs as Home / {project-name} / Mappings / New', () => {
    renderBreadcrumbsWithLabel('/projects/abc-123/mappings/new', 'abc-123', 'My Project');

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Project' })).toHaveAttribute('href', '/projects/abc-123');
    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
    expect(screen.getByText('Mappings')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mappings' })).not.toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New' })).not.toBeInTheDocument();
  });

  it('renders value-mappings breadcrumbs as Home / Projects / {project-name} / Value Mappings', () => {
    renderBreadcrumbsWithLabel('/projects/abc-123/value-mappings', 'abc-123', 'My Project');

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Project' })).toHaveAttribute('href', '/projects/abc-123');
    expect(screen.getByText('Value Mappings')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Value Mappings' })).not.toBeInTheDocument();
  });

  it('renders breadcrumbs for mapping deployment hierarchy', () => {
    renderBreadcrumbs('/projects/abc-123/mappings/map-456/deploy');

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'abc-123' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mappings' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'map-456' })).toBeInTheDocument();
    expect(screen.getByText('Deployment')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Deployment' })).not.toBeInTheDocument();
  });

  it('uses registered project and mapping labels on mapping deployment breadcrumbs', () => {
    renderDeploymentBreadcrumbsWithLabels({
      path: '/projects/abc-123/mappings/map-456/deploy',
      projectSegmentValue: 'abc-123',
      projectLabel: 'chris-test',
      mappingSegmentValue: 'map-456',
      mappingLabel: 'direct-mapping',
    });

    expect(screen.getByRole('link', { name: 'chris-test' })).toHaveAttribute('href', '/projects/abc-123');
    expect(screen.getByRole('link', { name: 'direct-mapping' })).toHaveAttribute('href', '/projects/abc-123/mappings/map-456');
    expect(screen.queryByText('abc-123')).not.toBeInTheDocument();
    expect(screen.queryByText('map-456')).not.toBeInTheDocument();
    expect(screen.getByText('Deployment')).toBeInTheDocument();
  });

  it('renders breadcrumbs for project deployments hierarchy', () => {
    renderBreadcrumbs('/projects/abc-123/deployments');

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'abc-123' })).toBeInTheDocument();
    expect(screen.getByText('Deployments')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Deployments' })).not.toBeInTheDocument();
  });

  it('last segment is not a link (AE-05)', () => {
    renderBreadcrumbs('/schemas/my-schema');

    const lastSegment = screen.getByText('my-schema');
    expect(lastSegment.tagName).not.toBe('A');
    expect(lastSegment).toHaveAttribute('aria-current', 'page');
  });

  it('breadcrumb links navigate to valid parent routes (AE-05)', async () => {
    const user = userEvent.setup();
    renderBreadcrumbs('/projects/abc-123/mappings/map-456');

    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink).toHaveAttribute('href', '/');

    // Projects remains structural/non-clickable until /projects route exists.
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();

    const projectLink = screen.getByRole('link', { name: 'abc-123' });
    expect(projectLink).toHaveAttribute('href', '/projects/abc-123');

    // Mappings is structural in this hierarchy and is intentionally non-clickable.
    expect(screen.queryByRole('link', { name: 'Mappings' })).not.toBeInTheDocument();

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
    // "Projects" static segment still renders correctly as non-clickable
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
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
  beforeEach(() => {
    resetSidebarPreference();
  });

  it('renders sidebar, Breadcrumbs, and page content together', () => {
    renderAppLayout('/schemas', <div data-testid="page-content">Page</div>);

    expect(screen.getByRole('complementary', { name: 'App sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('renders Not Found page within the shell (AE-10)', () => {
    renderAppLayout('/unknown/path', <div />);

    expect(screen.getByRole('complementary', { name: 'App sidebar' })).toBeInTheDocument();
    expect(screen.getByTestId('page-not-found')).toBeInTheDocument();
  });

  it('does not render top-nav landmark on primary routes (AE-01)', () => {
    renderAppLayout('/', <div data-testid="page-content">Content</div>);

    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'App sidebar' })).toBeInTheDocument();
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
    // "Schemas" appears in both the sidebar link and the breadcrumb — confirm
    // at least one instance is present in the breadcrumb nav
    const breadcrumbNav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumbNav).getByText('Schemas')).toBeInTheDocument();
  });

  it('keeps focused workspace routes usable with sidebar and no dual top-nav (AE-09)', () => {
    renderAppLayout('/projects/p1/mappings/m1', <div data-testid="page-content">Editor</div>);

    expect(screen.getByRole('complementary', { name: 'App sidebar' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('keeps create-mapping route in standard framed layout with breadcrumbs', () => {
    renderAppLayout('/projects/p1/mappings/new', <div data-testid="page-content">Create Mapping</div>);

    expect(screen.getByRole('complementary', { name: 'App sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });
});
