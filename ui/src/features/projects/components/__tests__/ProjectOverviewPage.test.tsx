import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { MappingMetadata, ProjectDetail, SchemaDetail } from '@/lib/types/domain';

import { ProjectOverviewPage } from '../ProjectOverviewPage';

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
) {
  return render(
    <AdapterProvider adapter={adapter}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectOverviewPage />} />
          <Route path="/" element={<div data-testid="home-page">Home</div>} />
          <Route path="/projects/:projectId/mappings/new" element={<div data-testid="create-mapping-page" />} />
        </Routes>
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
      expect(screen.getByRole('heading', { level: 1, name: 'My Project' })).toBeInTheDocument();
    });

    // Section A — metadata (shows project name in PageHeader h1)
    expect(screen.getByRole('heading', { level: 1, name: 'My Project' })).toBeInTheDocument();

    // Section B — schemas (heading)
    expect(screen.getByRole('heading', { name: /schemas/i })).toBeInTheDocument();

    // Section C — mappings (heading)
    expect(screen.getByRole('heading', { name: /mappings/i })).toBeInTheDocument();

    // Section D — actions (Delete Project button in danger zone)
    expect(screen.getByRole('button', { name: /delete project/i })).toBeInTheDocument();
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
      expect(screen.getByRole('heading', { level: 1, name: 'My Project' })).toBeInTheDocument();
    });

    expect(getProject).toHaveBeenCalledTimes(2);
  });

  it('clicking Upload Schema opens upload dialog and does not navigate to create mapping', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'My Project' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /upload schema/i }));

    expect(screen.getByTestId('schema-upload-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('create-mapping-page')).not.toBeInTheDocument();
  });

  it('clicking Add Schema opens upload dialog', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'My Project' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /add schema/i }));

    expect(screen.getByTestId('schema-upload-dialog')).toBeInTheDocument();
  });

  it('clicking Create Mapping navigates to create mapping route', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'My Project' })).toBeInTheDocument();
    });

    const createButtons = screen.getAllByRole('button', { name: /create mapping/i });
    await user.click(createButtons[0]);

    expect(screen.getByTestId('create-mapping-page')).toBeInTheDocument();
  });
});
