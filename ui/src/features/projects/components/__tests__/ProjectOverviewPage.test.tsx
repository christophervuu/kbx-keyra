import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ProjectOverviewPage } from '../ProjectOverviewPage';

import { BreadcrumbProvider } from '@/components/layout/BreadcrumbContext';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { MappingMetadata, ProjectDetail, SchemaDetail } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCHEMA_DETAIL: SchemaDetail = {
  metadata: {
    schemaId: 'schema-1',
    name: 'Schema One',
    format: 'json-schema',
    fieldCount: 5,
    origin: 'local',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  content: {},
};

const MAPPING_META: MappingMetadata = {
  mappingId: 'mapping-1',
  projectId: 'proj-1',
  name: 'Mapping One',
  version: 1,
  status: 'draft',
  sourceSchemaId: 'schema-1',
  targetSchemaId: undefined,
  ruleCount: 3,
  coverage: 0.75,
  updatedAt: '2026-01-01T00:00:00Z',
};

const PROJECT_DETAIL: ProjectDetail = {
  projectId: 'proj-1',
  name: 'My Project',
  description: 'A test project',
  slug: 'my-project',
  schemaRefs: [{ schemaId: 'schema-1', type: 'local' }],
  tags: ['alpha'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  mappings: [MAPPING_META],
};

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listSchemas: vi.fn(),
    getSchema: vi.fn().mockResolvedValue(SCHEMA_DETAIL),
    createSchema: vi.fn(),
    deleteSchema: vi.fn(),
    listMappings: vi.fn(),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn().mockResolvedValue(undefined),
    duplicateMapping: vi.fn().mockResolvedValue({ ...MAPPING_META, mappingId: 'mapping-2', name: 'Mapping One (Copy)' }),
    listProjects: vi.fn(),
    getProject: vi.fn().mockResolvedValue(PROJECT_DETAIL),
    createProject: vi.fn().mockResolvedValue({ ...PROJECT_DETAIL, projectId: 'new-proj' }),
    updateProject: vi.fn().mockResolvedValue(PROJECT_DETAIL),
    deleteProject: vi.fn().mockResolvedValue(undefined),
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    getDeploymentContext: vi.fn(),
    deploy: vi.fn(),
    promote: vi.fn(),
    rollback: vi.fn(),
    getDeploymentDiff: vi.fn(),
    getCurrentDeployments: vi.fn().mockResolvedValue({
      DEV: { environment: 'DEV', deployment: null, status: 'not-deployed' },
      QA: { environment: 'QA', deployment: null, status: 'not-deployed' },
      PROD: { environment: 'PROD', deployment: null, status: 'not-deployed' },
    }),
    listCdmSchemas: vi.fn(),
    linkCdmSchema: vi.fn(),
    syncCdmSchema: vi.fn(),
    listPublishedSchemas: vi.fn(),
    publishSchemaToGitHub: vi.fn(),
    linkPublishedSchema: vi.fn(),
    autoMap: vi.fn(),
    suggestExpression: vi.fn(),
    smartFix: vi.fn(),
    previewMapping: vi.fn(),
    ...overrides,
  } as unknown as ApiAdapter;
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(
  adapter: ApiAdapter,
  projectId = 'proj-1',
  initialPath = `/projects/${projectId}`,
  { withBreadcrumbs = false }: { withBreadcrumbs?: boolean } = {},
) {
  return render(
    <AdapterProvider adapter={adapter}>
      <MemoryRouter initialEntries={[initialPath]}>
        <BreadcrumbProvider>
          {withBreadcrumbs && <Breadcrumbs />}
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectOverviewPage />} />
            <Route path="/" element={<div data-testid="home-page">Home</div>} />
            <Route path="/projects/:projectId/mappings/new" element={<div data-testid="create-mapping-page" />} />
          </Routes>
        </BreadcrumbProvider>
      </MemoryRouter>
    </AdapterProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectOverviewPage', () => {
  let adapter: ApiAdapter;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it('preserves data-testid on root element', async () => {
    renderPage(adapter);
    expect(screen.getByTestId('page-project-overview')).toBeInTheDocument();
  });

  it('shows loading skeleton initially', () => {
    // Make getProject hang indefinitely
    adapter = createMockAdapter({ getProject: vi.fn(() => new Promise(() => {})) });
    renderPage(adapter);
    expect(screen.getByTestId('project-overview-skeleton')).toBeInTheDocument();
  });

  it('renders all four sections when loaded', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Project name' })).toBeInTheDocument();
    });

    // Header — project name as inline-editable h1 (role="button", aria-label="Project name")
    expect(screen.getByRole('button', { name: 'Project name' })).toBeInTheDocument();

    // Section — schemas (heading)
    expect(screen.getByRole('heading', { name: /schemas/i })).toBeInTheDocument();

    // Section — mappings (heading)
    expect(screen.getByRole('heading', { name: /mappings/i })).toBeInTheDocument();

    // Header — overflow menu trigger (replaces ProjectActionsSection)
    expect(screen.getByRole('button', { name: /more project actions/i })).toBeInTheDocument();
  });

  it('not-found state shows message and home link', async () => {
    adapter = createMockAdapter({
      getProject: vi.fn().mockRejectedValue(new Error('Project not found')),
    });
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('not-found-home-link')).toBeInTheDocument();
    });

    expect(screen.getByText(/doesn't exist or was deleted/i)).toBeInTheDocument();
  });

  it('error state shows retry button', async () => {
    adapter = createMockAdapter({
      getProject: vi.fn().mockRejectedValue(new Error('Server error')),
    });
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });

    expect(screen.getByText(/failed to load project/i)).toBeInTheDocument();
  });

  it('retry button re-fetches data', async () => {
    const getProject = vi.fn()
      .mockRejectedValueOnce(new Error('Server error'))
      .mockResolvedValueOnce(PROJECT_DETAIL);
    adapter = createMockAdapter({ getProject });
    renderPage(adapter);

    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('retry-button'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Project name' })).toBeInTheDocument();
    });

    expect(getProject).toHaveBeenCalledTimes(2);
  });

  it('clicking Upload Schema opens upload dialog and does not navigate to create mapping', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Project name' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /upload schema/i }));

    expect(screen.getByTestId('schema-upload-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('create-mapping-page')).not.toBeInTheDocument();
  });

  it('clicking Add Schema opens upload dialog', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Project name' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /add schema/i }));

    expect(screen.getByTestId('schema-upload-dialog')).toBeInTheDocument();
  });

  it('clicking Create Mapping navigates to create mapping route', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Project name' })).toBeInTheDocument();
    });

    const createButtons = screen.getAllByRole('button', { name: /create mapping/i });
    await user.click(createButtons[0]);

    expect(screen.getByTestId('create-mapping-page')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T-02 layout acceptance checks (FS-050 AE-04, AE-06, AE-16)
// ---------------------------------------------------------------------------

describe('ProjectOverviewPage — T-02 layout (AE-04, AE-06, AE-16)', () => {
  let adapter: ApiAdapter;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it('AE-04: project name is visible in the header and is inline-editable', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Project name' })).toBeInTheDocument();
    });

    // The inline-editable h1 renders as role="button" with aria-label="Project name"
    const nameButton = screen.getByRole('button', { name: 'Project name' });
    expect(nameButton.tagName).toBe('H1');
    // The text content is the actual project name
    expect(nameButton).toHaveTextContent('My Project');
  });

  it('AE-04 / AE-16: Create Mapping and Add Schema buttons are visible in the header', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('header-create-mapping-btn')).toBeInTheDocument();
    });

    expect(screen.getByTestId('header-create-mapping-btn')).toBeInTheDocument();
    expect(screen.getByTestId('header-add-schema-btn')).toBeInTheDocument();
  });

  it('AE-16: overflow menu trigger is visible', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-overflow-menu-trigger')).toBeInTheDocument();
    });
  });

  it('AE-16: overflow menu opens and contains expected items', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-overflow-menu-trigger')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('project-overflow-menu-trigger'));

    const menu = screen.getByTestId('project-overflow-menu');
    expect(menu).toBeInTheDocument();
    expect(within(menu).getByText('Open Deployments')).toBeInTheDocument();
    expect(within(menu).getByText('Project Settings')).toBeInTheDocument();
    expect(within(menu).getByText('Duplicate Project')).toBeInTheDocument();
    expect(within(menu).getByText('Export Project')).toBeInTheDocument();
    expect(within(menu).getByText('Delete Project')).toBeInTheDocument();
  });

  it('AE-16: overflow menu closes on outside click', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-overflow-menu-trigger')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('project-overflow-menu-trigger'));
    expect(screen.getByTestId('project-overflow-menu')).toBeInTheDocument();

    // Click outside
    await user.click(document.body);
    expect(screen.queryByTestId('project-overflow-menu')).not.toBeInTheDocument();
  });

  it('AE-06: mappings section precedes schemas section in DOM order', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /mappings/i })).toBeInTheDocument();
    });

    const mappingsHeading = screen.getByRole('heading', { name: /mappings/i });
    const schemasHeading = screen.getByRole('heading', { name: /schemas/i });

    // compareDocumentPosition: DOCUMENT_POSITION_FOLLOWING = 4
    // If mappings comes before schemas, schemas.compareDocumentPosition(mappings) returns PRECEDING (2)
    const position = schemasHeading.compareDocumentPosition(mappingsHeading);
    expect(position & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('data-testid="page-project-overview" is preserved', async () => {
    renderPage(adapter);
    expect(screen.getByTestId('page-project-overview')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Breadcrumb label integration (FS-050 T-01 AE-01, AE-02, AE-03)
// ---------------------------------------------------------------------------

describe('ProjectOverviewPage — breadcrumb label registration', () => {
  it('AE-01: breadcrumb shows project name once data loads', async () => {
    const adapter = createMockAdapter({
      getProject: vi.fn().mockResolvedValue({
        ...PROJECT_DETAIL,
        name: 'Order Processing',
      }),
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings: vi.fn().mockResolvedValue([]),
    });

    renderPage(adapter, 'proj-1', '/projects/proj-1', { withBreadcrumbs: true });

    // While loading, breadcrumb shows "Loading..."
    const breadcrumbNav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumbNav).getByText('Loading...')).toBeInTheDocument();

    // After data loads, breadcrumb shows the project name
    await waitFor(() => {
      expect(within(breadcrumbNav).getByText('Order Processing')).toBeInTheDocument();
    });

    // Raw ID should not appear in breadcrumb
    expect(within(breadcrumbNav).queryByText('proj-1')).not.toBeInTheDocument();
  });

  it('AE-02: breadcrumb shows "Loading..." while project data is loading', async () => {
    const adapter = createMockAdapter({
      getProject: vi.fn().mockReturnValue(new Promise(() => {})),
      listSchemas: vi.fn().mockReturnValue(new Promise(() => {})),
      listMappings: vi.fn().mockReturnValue(new Promise(() => {})),
    });

    renderPage(adapter, 'proj-1', '/projects/proj-1', { withBreadcrumbs: true });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('AE-03: breadcrumb shows raw project ID on load error', async () => {
    const adapter = createMockAdapter({
      getProject: vi.fn().mockRejectedValue(new Error('Network error')),
      listSchemas: vi.fn().mockRejectedValue(new Error('Network error')),
      listMappings: vi.fn().mockRejectedValue(new Error('Network error')),
    });

    renderPage(adapter, 'proj-1', '/projects/proj-1', { withBreadcrumbs: true });

    await waitFor(() => {
      // On error, breadcrumb falls back to raw project ID (not "Loading...")
      expect(screen.getByText('proj-1')).toBeInTheDocument();
    });
  });
});
