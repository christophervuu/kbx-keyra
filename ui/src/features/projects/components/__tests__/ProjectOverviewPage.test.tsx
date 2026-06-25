import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    origin: 'uploaded',
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

const ENRICHED_MAPPING_META: MappingMetadata = {
  ...MAPPING_META,
  mappingId: 'mapping-enriched',
  name: 'Enriched Mapping',
  enrichmentSources: [
    { alias: 'customerProfile', schemaId: 'schema-1', required: true },
    { alias: 'accountSettings', schemaId: 'schema-2', required: false },
  ],
};

const PROJECT_DETAIL: ProjectDetail = {
  projectId: 'proj-1',
  name: 'My Project',
  description: 'A test project',
  slug: 'my-project',
  schemaRefs: [{ schemaId: 'schema-1', type: 'published' }],
  linkedSchemaIds: ['schema-1'],
  tags: ['alpha'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  mappings: [MAPPING_META],
};

const SCHEMA_DETAIL_2: SchemaDetail = {
  metadata: {
    schemaId: 'schema-2',
    name: 'Schema Two',
    format: 'json-schema',
    fieldCount: 4,
    origin: 'uploaded',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  content: {},
};

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listSchemas: vi.fn(),
    getSchema: vi.fn().mockImplementation(async (schemaId: string) => {
      if (schemaId === 'schema-2') {
        return SCHEMA_DETAIL_2;
      }
      return SCHEMA_DETAIL;
    }),
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
    listProjectValueTables: vi.fn().mockResolvedValue([
      {
        id: 'vt-1',
        projectId: PROJECT_DETAIL.projectId,
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'a', label: 'A', type: 'string' },
        sideB: { key: 'b', label: 'B', type: 'string' },
        currentRevision: 1,
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]),
    listProjectValueTableUsage: vi.fn().mockResolvedValue([
      {
        valueTableId: 'vt-1',
        tableKey: 'order-status',
        mappingId: MAPPING_META.mappingId,
        mappingName: MAPPING_META.name,
        pinnedRevision: 1,
        direction: 'a_to_b',
        inputSideKey: 'a',
        outputSideKey: 'b',
        newerRevisionAvailable: false,
        latestRevision: 1,
      },
    ]),
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
            <Route path="/projects/:projectId/deployments" element={<div data-testid="project-deployments-page" />} />
            <Route path="/projects/:projectId/mappings/:mappingId" element={<div data-testid="mapping-editor-page" />} />
            <Route path="/projects/:projectId/mappings/:mappingId/deploy" element={<div data-testid="mapping-deployment-page" />} />
            <Route path="/projects/:projectId/value-mappings" element={<div data-testid="project-value-mappings-page" />} />
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

  it('renders header + full-width mappings when loaded', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Project name' })).toBeInTheDocument();
    });

    // Header — project name as inline-editable h1 (role="button", aria-label="Project name")
    expect(screen.getByRole('button', { name: 'Project name' })).toBeInTheDocument();

    // Section — mappings (heading)
    expect(screen.getByRole('heading', { name: 'Mappings' })).toBeInTheDocument();
    expect(screen.queryByTestId('project-value-mappings-summary')).not.toBeInTheDocument();

    // No right rail / deployment activity / schema management section in FS-086 T-01
    expect(screen.queryByTestId('project-overview-right-rail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('deployment-activity-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schemas-right-rail-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('project-schema-management-section')).not.toBeInTheDocument();

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


  it('clicking Create Mapping navigates to create mapping route', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Project name' })).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /create mapping/i });
    expect(createButton).toHaveClass('border-slate-700');
    expect(createButton).toHaveClass('bg-slate-800');
    expect(createButton).toHaveClass('hover:bg-slate-700');

    await user.click(createButton);

    expect(screen.getByTestId('create-mapping-page')).toBeInTheDocument();
  });

  it('renders mappings as the only overview content column', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-overview-main-column')).toBeInTheDocument();
    });

    expect(screen.getByTestId('project-overview-main-column')).toBeInTheDocument();
    expect(screen.queryByTestId('project-value-mappings-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('project-overview-right-rail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('deployment-activity-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schemas-right-rail-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('project-schema-management-section')).not.toBeInTheDocument();
  });

  it('does not render deployment activity card in overview', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-overview-main-column')).toBeInTheDocument();
    });

    expect(screen.queryByRole('heading', { name: 'Deployment Activity' })).not.toBeInTheDocument();
  });

  it('opens linked schemas dialog from summary trigger with compact metadata', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('linked-schemas-trigger')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('linked-schemas-trigger'));

    const dialog = screen.getByTestId('linked-schemas-dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Linked Schemas' })).toBeInTheDocument();
    expect(within(dialog).getByText('1 schema linked to this project')).toBeInTheDocument();
    expect(within(dialog).getByText(/Schema One/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Uploaded · JSON · 5 fields · Used by 1 mapping/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/JSON Schema/)).not.toBeInTheDocument();
  });

  it('linked schemas dialog closes on Escape and returns focus to trigger', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('linked-schemas-trigger')).toBeInTheDocument();
    });

    const trigger = screen.getByTestId('linked-schemas-trigger');
    await user.click(trigger);
    expect(screen.getByTestId('linked-schemas-dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByTestId('linked-schemas-dialog')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it('linked schemas dialog empty state remains informational and read-only', async () => {
    const user = userEvent.setup();
    const noSchemasAdapter = createMockAdapter({
      getProject: vi.fn().mockResolvedValue({
        ...PROJECT_DETAIL,
        linkedSchemaIds: [],
        schemaRefs: [],
      }),
    });

    renderPage(noSchemasAdapter);

    await waitFor(() => {
      expect(screen.getByTestId('linked-schemas-trigger')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('linked-schemas-trigger'));
    expect(screen.getByTestId('linked-schemas-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('linked-schemas-add-schema')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schema-upload-dialog')).not.toBeInTheDocument();
  });

  it('does not render default schema management section in overview', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-overview-main-column')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('project-schema-management-section')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Schemas' })).not.toBeInTheDocument();
  });

  it('AE-05: overview rows enforce status-based actions and Deploy navigates (no inline deploy)', async () => {
    const user = userEvent.setup();

    const readyMapping: MappingMetadata = {
      ...MAPPING_META,
      mappingId: 'mapping-ready',
      name: 'Ready Mapping',
      status: 'ready',
    };

    const draftMapping: MappingMetadata = {
      ...MAPPING_META,
      mappingId: 'mapping-draft',
      name: 'Draft Mapping',
      status: 'draft',
    };

    const hasErrorsMapping: MappingMetadata = {
      ...MAPPING_META,
      mappingId: 'mapping-errors',
      name: 'Error Mapping',
      status: 'has-errors',
    };

    const statusAdapter = createMockAdapter({
      getProject: vi.fn().mockResolvedValue({
        ...PROJECT_DETAIL,
        mappings: [readyMapping, draftMapping, hasErrorsMapping],
      }),
    });

    renderPage(statusAdapter);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Mappings' })).toBeInTheDocument();
    });

    // Ready: row is open target + Deploy icon visible
    const readyDeploy = screen.getByRole('button', { name: /deploy mapping ready mapping/i });
    expect(readyDeploy).toBeInTheDocument();

    // Draft: Deploy icon present but disabled
    expect(screen.getByRole('button', { name: /deploy mapping draft mapping \(disabled\)/i })).toBeDisabled();

    // Has errors: Deploy icon present but disabled
    expect(screen.getByRole('button', { name: /deploy mapping error mapping \(disabled\)/i })).toBeDisabled();

    await user.click(readyDeploy);
    expect(screen.getByTestId('mapping-deployment-page')).toBeInTheDocument();
  });

  it('renders enrichment-aware row summary and details while keeping linked schemas header metric', async () => {
    const user = userEvent.setup();

    const enrichedAdapter = createMockAdapter({
      getProject: vi.fn().mockResolvedValue({
        ...PROJECT_DETAIL,
        linkedSchemaIds: ['schema-1', 'schema-2'],
        schemaRefs: [
          { schemaId: 'schema-1', type: 'published' },
          { schemaId: 'schema-2', type: 'published' },
        ],
        mappings: [ENRICHED_MAPPING_META],
      }),
    });

    renderPage(enrichedAdapter);

    await waitFor(() => {
      expect(screen.getByText('Enriched Mapping')).toBeInTheDocument();
    });

    expect(screen.getByText('Schema One')).toBeInTheDocument();
    expect(screen.getByText('2 enrichments')).toBeInTheDocument();

    const detailToggle = screen.getByRole('button', {
      name: /view mapping inputs for enriched mapping/i,
    });
    await user.click(detailToggle);

    const details = screen.getByRole('dialog', {
      name: /input details for enriched mapping/i,
    });
    expect(within(details).getByText('customerProfile')).toBeInTheDocument();
    expect(within(details).getByText('Primary source')).toBeInTheDocument();
    expect(within(details).getAllByText('Schema One').length).toBeGreaterThan(0);
    expect(within(details).getByText('accountSettings')).toBeInTheDocument();
    expect(within(details).getByText('Schema Two')).toBeInTheDocument();

    expect(screen.getByTestId('project-header-summary-line')).toHaveTextContent(
      '1 mapping · 2 linked schemas · 1 value table · 0 errors',
    );
  });

  it('omits value-table summary metric when there are zero active tables', async () => {
    const zeroTablesAdapter = createMockAdapter({
      listProjectValueTables: vi.fn().mockResolvedValue([]),
    });

    renderPage(zeroTablesAdapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-header-summary-line')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('value-tables-summary-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('project-header-summary-line')).not.toHaveTextContent('0 value tables');
  });

  it('omits value-table summary metric when value-table summary fetch fails', async () => {
    const failingTablesAdapter = createMockAdapter({
      listProjectValueTables: vi.fn().mockRejectedValue(new Error('value table API unavailable')),
    });

    renderPage(failingTablesAdapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-header-summary-line')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('value-tables-summary-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('project-value-mappings-summary-error')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mappings' })).toBeInTheDocument();
  });

  it('shows value-table summary metric with pluralized count and navigates on click', async () => {
    const user = userEvent.setup();
    const multiTablesAdapter = createMockAdapter({
      listProjectValueTables: vi.fn().mockResolvedValue([
        {
          id: 'vt-1',
          projectId: PROJECT_DETAIL.projectId,
          key: 'order-status',
          name: 'Order Status',
          sideA: { key: 'a', label: 'A', type: 'string' },
          sideB: { key: 'b', label: 'B', type: 'string' },
          currentRevision: 1,
          status: 'active',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'vt-2',
          projectId: PROJECT_DETAIL.projectId,
          key: 'payment-status',
          name: 'Payment Status',
          sideA: { key: 'a', label: 'A', type: 'string' },
          sideB: { key: 'b', label: 'B', type: 'string' },
          currentRevision: 1,
          status: 'active',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ]),
    });

    renderPage(multiTablesAdapter);

    const metric = await screen.findByTestId('value-tables-summary-link');
    expect(metric).toHaveTextContent('2 value tables');

    await user.click(metric);
    expect(screen.getByTestId('project-value-mappings-page')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Layout acceptance checks (FS-085)
// ---------------------------------------------------------------------------

describe('ProjectOverviewPage — layout checks', () => {
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

  it('AE-04 / AE-16: only Create Mapping button is visible in header primary actions', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('header-create-mapping-btn')).toBeInTheDocument();
    });

    expect(screen.getByTestId('header-create-mapping-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('header-add-schema-btn')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add schema/i })).not.toBeInTheDocument();
  });

  it('linked schemas dialog enables unlink for unused schemas and disables it for used schemas', async () => {
    const user = userEvent.setup();
    const adapterWithUnusedSchema = createMockAdapter({
      getProject: vi.fn().mockResolvedValue({
        ...PROJECT_DETAIL,
        linkedSchemaIds: ['schema-1', 'schema-2'],
        schemaRefs: [
          { schemaId: 'schema-1', type: 'published' },
          { schemaId: 'schema-2', type: 'published' },
        ],
        mappings: [MAPPING_META],
      }),
    });
    renderPage(adapterWithUnusedSchema);

    await waitFor(() => {
      expect(screen.getByTestId('linked-schemas-trigger')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('linked-schemas-trigger'));

    expect(screen.getByTestId('linked-schema-unlink-schema-1')).toBeDisabled();
    expect(screen.getByTestId('linked-schema-unlink-schema-2')).toBeEnabled();
    expect(screen.queryByTestId('linked-schemas-add-schema')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schema-upload-dialog')).not.toBeInTheDocument();
  });

  it('unlinks an unused linked schema from the project', async () => {
    const user = userEvent.setup();
    const unlinkAdapter = createMockAdapter({
      getProject: vi.fn().mockResolvedValue({
        ...PROJECT_DETAIL,
        linkedSchemaIds: ['schema-1', 'schema-2'],
        schemaRefs: [
          { schemaId: 'schema-1', type: 'published' },
          { schemaId: 'schema-2', type: 'published' },
        ],
        mappings: [MAPPING_META],
      }),
      updateProject: vi.fn().mockResolvedValue(PROJECT_DETAIL),
    });

    renderPage(unlinkAdapter);

    await waitFor(() => {
      expect(screen.getByTestId('linked-schemas-trigger')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('linked-schemas-trigger'));
    await user.click(screen.getByTestId('linked-schema-unlink-schema-2'));

    await waitFor(() => {
      expect(unlinkAdapter.updateProject).toHaveBeenCalledWith('proj-1', { linkedSchemaIds: ['schema-1'] });
    });
    expect(screen.queryByTestId('linked-schema-row-schema-2')).not.toBeInTheDocument();
  });

  it('AE-02: header shows compact summary line and hides tag UI', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-header-summary-line')).toBeInTheDocument();
    });

    expect(screen.getByTestId('project-header-summary-line')).toHaveTextContent(
      '1 mapping · 1 linked schema · 1 value table · 0 errors',
    );
    expect(screen.queryByText('Add tag…')).not.toBeInTheDocument();
  });

  it('AE-03: legacy overview sections are not rendered in default layout', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-overview-main-column')).toBeInTheDocument();
    });

    // Summary strip was removed from the default overview composition.
    expect(screen.queryByTestId('project-summary-row')).not.toBeInTheDocument();
    // Legacy "continue" panel is removed from the mappings-first redesign.
    expect(screen.queryByText(/continue where you left off/i)).not.toBeInTheDocument();
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
    expect(within(menu).getByText('Manage value tables')).toBeInTheDocument();
    expect(within(menu).getByText('Project Settings')).toBeInTheDocument();
    expect(within(menu).getByText('Duplicate Project')).toBeInTheDocument();
    expect(within(menu).getByText('Export Project')).toBeInTheDocument();
    expect(within(menu).getByText('Delete Project')).toBeInTheDocument();
  });

  it('overflow menu Manage value tables action navigates to value-mappings route', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-overflow-menu-trigger')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('project-overflow-menu-trigger'));
    await user.click(screen.getByRole('menuitem', { name: 'Manage value tables' }));

    expect(screen.getByTestId('project-value-mappings-page')).toBeInTheDocument();
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

  it('AE-06: mappings section is rendered and schema management section is absent by default', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Mappings' })).toBeInTheDocument();
    });

    expect(screen.queryByTestId('project-schema-management-section')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Schemas' })).not.toBeInTheDocument();
  });

  it('AE-10: overview no longer renders right rail or two-column content grid', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-overview-main-column')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('project-overview-content-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('project-overview-right-rail')).not.toBeInTheDocument();
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
  it('AE-07: breadcrumb follows Home / Projects / {projectName} with non-clickable Projects segment', async () => {
    const adapter = createMockAdapter({
      getProject: vi.fn().mockResolvedValue({
        ...PROJECT_DETAIL,
        name: 'Order Processing',
      }),
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings: vi.fn().mockResolvedValue([]),
    });

    renderPage(adapter, 'proj-1', '/projects/proj-1', { withBreadcrumbs: true });

    const breadcrumbNav = screen.getByRole('navigation', { name: 'Breadcrumb' });

    // Structural hierarchy always starts with Home / Projects / ...
    expect(within(breadcrumbNav).getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(within(breadcrumbNav).getByText('Projects')).toBeInTheDocument();
    expect(within(breadcrumbNav).queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(within(breadcrumbNav).getByText('Order Processing')).toBeInTheDocument();
    });

    // Current page segment must not be clickable
    expect(within(breadcrumbNav).queryByRole('link', { name: 'Order Processing' })).not.toBeInTheDocument();
  });

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
