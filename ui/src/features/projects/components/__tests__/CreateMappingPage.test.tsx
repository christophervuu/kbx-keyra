import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { MappingMetadata, ProjectDetail, SchemaDetail } from '@/lib/types/domain';

import { CreateMappingPage } from '../CreateMappingPage';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCHEMA_DETAIL_A: SchemaDetail = {
  metadata: {
    schemaId: 'schema-a',
    name: 'Schema Alpha',
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

const SCHEMA_DETAIL_B: SchemaDetail = {
  metadata: {
    schemaId: 'schema-b',
    name: 'Schema Beta',
    format: 'xsd',
    fieldCount: 2,
    origin: 'cdm',
    status: 'ready',
    source: {
      type: 'github',
      repo: 'KBXT/KBX-Canonicals',
      branch: 'main',
      path: 'JSONSchemas/CommonDataModels/Beta.json',
      commitSha: 'sha-beta',
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  content: {},
};

const CREATED_MAPPING: MappingMetadata = {
  mappingId: 'new-mapping-1',
  projectId: 'proj-1',
  name: 'My Mapping',
  version: 1,
  status: 'draft',
  sourceSchemaId: undefined,
  targetSchemaId: undefined,
  ruleCount: 0,
  coverage: 0,
  updatedAt: '2026-01-01T00:00:00Z',
};

const PROJECT_WITH_SCHEMAS: ProjectDetail = {
  projectId: 'proj-1',
  name: 'My Project',
  description: '',
  slug: 'my-project',
  schemaRefs: [{ schemaId: 'schema-a', type: 'local' }],
  linkedSchemaIds: ['schema-a'],
  tags: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  mappings: [],
};

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listSchemas: vi.fn().mockResolvedValue([SCHEMA_DETAIL_A.metadata, SCHEMA_DETAIL_B.metadata]),
    getSchema: vi.fn().mockImplementation(async (id: string) =>
      id === 'schema-b' ? SCHEMA_DETAIL_B : SCHEMA_DETAIL_A,
    ),
    createSchema: vi.fn(),
    deleteSchema: vi.fn(),
    listMappings: vi.fn(),
    getMapping: vi.fn(),
    createMapping: vi.fn().mockResolvedValue(CREATED_MAPPING),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn().mockResolvedValue(PROJECT_WITH_SCHEMAS),
    createProject: vi.fn(),
    updateProject: vi.fn().mockResolvedValue(PROJECT_WITH_SCHEMAS),
    deleteProject: vi.fn(),
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

function renderPage(adapter: ApiAdapter, projectId = 'proj-1') {
  return render(
    <AdapterProvider adapter={adapter}>
      <MemoryRouter initialEntries={[`/projects/${projectId}/mappings/new`]}>
        <Routes>
          <Route
            path="/projects/:projectId/mappings/new"
            element={<CreateMappingPage />}
          />
          <Route
            path="/projects/:projectId/mappings/:mappingId"
            element={<div data-testid="mapping-editor-page">Editor</div>}
          />
          <Route
            path="/projects/:projectId"
            element={<div data-testid="project-overview-page">Overview</div>}
          />
          <Route path="/" element={<div data-testid="home-page">Home</div>} />
        </Routes>
      </MemoryRouter>
    </AdapterProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateMappingPage', () => {
  it('preserves data-testid on root element', () => {
    renderPage(createMockAdapter());
    expect(screen.getByTestId('page-create-mapping')).toBeInTheDocument();
  });

  it('starts on step 1 and shows name input', () => {
    renderPage(createMockAdapter());
    expect(screen.getByTestId('step-1')).toBeInTheDocument();
    expect(screen.getByLabelText(/mapping name/i)).toBeInTheDocument();
  });

  it('clicking Next with empty name shows validation error', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await user.click(screen.getByTestId('next-button'));

    expect(screen.getByTestId('name-error')).toBeInTheDocument();
    expect(screen.getByText(/mapping name is required/i)).toBeInTheDocument();
    expect(screen.getByTestId('step-1')).toBeInTheDocument(); // did not advance
  });

  it('clicking Next with valid name advances to step 2', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await user.type(screen.getByLabelText(/mapping name/i), 'My Mapping');
    await user.click(screen.getByTestId('next-button'));

    expect(screen.getByTestId('step-2')).toBeInTheDocument();
  });

  it('step 2 shows source schema selector with project schemas', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await user.type(screen.getByLabelText(/mapping name/i), 'My Mapping');
    await user.click(screen.getByTestId('next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument();
    });

    // Should include "Skip" option and linked schema
    const select = screen.getByTestId('schema-select-source-schema') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.text);
    expect(options.some((o) => /skip/i.test(o))).toBe(true);
    expect(options.some((o) => /schema alpha/i.test(o))).toBe(true);
  });

  it('schema selector groups linked schemas ahead of other available schemas', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await user.type(screen.getByLabelText(/mapping name/i), 'My Mapping');
    await user.click(screen.getByTestId('next-button'));

    const select = (await screen.findByTestId('schema-select-source-schema')) as HTMLSelectElement;
    const linkedGroup = Array.from(select.querySelectorAll('optgroup')).find((group) =>
      group.label.toLowerCase().includes('linked schemas'),
    );
    const otherGroup = Array.from(select.querySelectorAll('optgroup')).find((group) =>
      group.label.toLowerCase().includes('other available schemas'),
    );

    expect(linkedGroup).toBeTruthy();
    expect(otherGroup).toBeTruthy();
    expect(linkedGroup?.textContent).toContain('Schema Alpha');
    expect(otherGroup?.textContent).toContain('Schema Beta');
  });

  it('Back button on step 2 returns to step 1', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await user.type(screen.getByLabelText(/mapping name/i), 'My Mapping');
    await user.click(screen.getByTestId('next-button'));
    expect(screen.getByTestId('step-2')).toBeInTheDocument();

    await user.click(screen.getByTestId('back-button'));
    expect(screen.getByTestId('step-1')).toBeInTheDocument();
  });

  it('step 3 shows Create Mapping button instead of Next', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await user.type(screen.getByLabelText(/mapping name/i), 'My Mapping');
    await user.click(screen.getByTestId('next-button'));
    await user.click(screen.getByTestId('next-button'));

    expect(screen.getByTestId('step-3')).toBeInTheDocument();
    expect(screen.getByTestId('create-button')).toBeInTheDocument();
    expect(screen.queryByTestId('next-button')).not.toBeInTheDocument();
  });

  it('skipping both schemas creates mapping with undefined schema refs', async () => {
    const createMapping = vi.fn().mockResolvedValue(CREATED_MAPPING);
    const adapter = createMockAdapter({ createMapping });
    const user = userEvent.setup();
    renderPage(adapter);

    await user.type(screen.getByLabelText(/mapping name/i), 'My Mapping');
    await user.click(screen.getByTestId('next-button'));
    await user.click(screen.getByTestId('next-button'));
    await user.click(screen.getByTestId('create-button'));

    await waitFor(() => {
      expect(createMapping).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Mapping',
          projectId: 'proj-1',
          sourceSchemaRef: undefined,
          targetSchemaRef: undefined,
        }),
      );
    });
  });

  it('selecting schemas passes refs to createMapping', async () => {
    const createMapping = vi.fn().mockResolvedValue(CREATED_MAPPING);
    const adapter = createMockAdapter({ createMapping });
    const user = userEvent.setup();
    renderPage(adapter);

    await user.type(screen.getByLabelText(/mapping name/i), 'My Mapping');
    await user.click(screen.getByTestId('next-button'));

    // Wait for schemas to load, then select
    await waitFor(() => {
      expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByTestId('schema-select-source-schema'), 'schema-a');
    await user.click(screen.getByTestId('next-button'));

    await user.selectOptions(screen.getByTestId('schema-select-target-schema'), 'schema-a');
    await user.click(screen.getByTestId('create-button'));

    await waitFor(() => {
      expect(createMapping).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceSchemaRef: { schemaId: 'schema-a', type: 'published' },
          targetSchemaRef: { schemaId: 'schema-a', type: 'published' },
        }),
      );
    });
  });

  it('selecting non-linked schema auto-links it to project as best effort', async () => {
    const createMapping = vi.fn().mockResolvedValue(CREATED_MAPPING);
    const updateProject = vi.fn().mockResolvedValue(PROJECT_WITH_SCHEMAS);
    const adapter = createMockAdapter({ createMapping, updateProject });
    const user = userEvent.setup();
    renderPage(adapter);

    await user.type(screen.getByLabelText(/mapping name/i), 'My Mapping');
    await user.click(screen.getByTestId('next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByTestId('schema-select-source-schema'), 'schema-b');
    await user.click(screen.getByTestId('next-button'));
    await user.selectOptions(screen.getByTestId('schema-select-target-schema'), 'schema-b');
    await user.click(screen.getByTestId('create-button'));

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith('proj-1', { linkedSchemaIds: ['schema-a', 'schema-b'] });
    });

    expect(createMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSchemaRef: { schemaId: 'schema-b', type: 'github', commitSha: 'sha-beta' },
        targetSchemaRef: { schemaId: 'schema-b', type: 'github', commitSha: 'sha-beta' },
      }),
    );
  });

  it('navigates to mapping editor after successful creation', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await user.type(screen.getByLabelText(/mapping name/i), 'My Mapping');
    await user.click(screen.getByTestId('next-button'));
    await user.click(screen.getByTestId('next-button'));
    await user.click(screen.getByTestId('create-button'));

    await waitFor(() => {
      expect(screen.getByTestId('mapping-editor-page')).toBeInTheDocument();
    });
  });

  it('cancel navigates to project overview', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await user.click(screen.getByTestId('cancel-button'));
    expect(screen.getByTestId('project-overview-page')).toBeInTheDocument();
  });

  it('shows submit error if createMapping fails', async () => {
    const adapter = createMockAdapter({
      createMapping: vi.fn().mockRejectedValue(new Error('Server error')),
    });
    const user = userEvent.setup();
    renderPage(adapter);

    await user.type(screen.getByLabelText(/mapping name/i), 'My Mapping');
    await user.click(screen.getByTestId('next-button'));
    await user.click(screen.getByTestId('next-button'));
    await user.click(screen.getByTestId('create-button'));

    await waitFor(() => {
      expect(screen.getByTestId('submit-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/server error/i)).toBeInTheDocument();
  });
});
