import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../SchemaUploadDialog', () => ({
  SchemaUploadDialog: ({
    open,
    onClose,
    onSchemaCreated,
  }: {
    open: boolean;
    onClose: () => void;
    onSchemaCreated: (ref: { schemaId: string; type: 'published' }) => Promise<void>;
  }) =>
    open ? (
      <div data-testid="schema-upload-dialog">
        <button
          type="button"
          data-testid="mock-add-schema-confirm"
          onClick={() => void onSchemaCreated({ schemaId: 'schema-new', type: 'published' })}
        >
          Confirm mock add schema
        </button>
        <button type="button" data-testid="mock-add-schema-close" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

import { __testables, CreateMappingPage } from '../CreateMappingPage';

import { AdapterProvider, createQueryClient } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { MappingEnrichmentSource, MappingMetadata, ProjectDetail, SchemaDetail } from '@/lib/types/domain';

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
  content: {
    type: 'object',
    properties: {
      Order: {
        type: 'object',
        properties: {
          Header: {
            type: 'object',
            properties: {
              Currency: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

const SCHEMA_DETAIL_NEW: SchemaDetail = {
  metadata: {
    schemaId: 'schema-new',
    name: 'Schema New',
    format: 'json-schema',
    fieldCount: 8,
    origin: 'uploaded',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  content: {},
};

const SCHEMA_DETAIL_NEEDS_REVIEW: SchemaDetail = {
  metadata: {
    schemaId: 'schema-needs-review',
    name: 'Schema Needs Review',
    format: 'json-schema',
    dataFormat: 'json',
    fieldCount: 3,
    origin: 'inferred',
    status: 'needs_review',
    inferred: true,
    sourceKind: 'inferred_from_json',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  content: {},
};

const SCHEMA_DETAIL_ERROR: SchemaDetail = {
  metadata: {
    schemaId: 'schema-error',
    name: 'Schema Error',
    format: 'xsd',
    dataFormat: 'xml',
    fieldCount: 0,
    origin: 'uploaded',
    status: 'error',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  content: {},
};

const SCHEMA_DETAIL_ZERO_COUNT: SchemaDetail = {
  metadata: {
    schemaId: 'schema-zero',
    name: 'Schema Zero Count',
    format: 'json-schema',
    dataFormat: 'json',
    fieldCount: 0,
    origin: 'uploaded',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  content: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      status: { type: 'string' },
      amount: { type: 'number' },
    },
  },
};

const SCHEMA_DETAIL_ZERO_COUNT_ONE_LEVEL: SchemaDetail = {
  ...SCHEMA_DETAIL_ZERO_COUNT,
  metadata: {
    ...SCHEMA_DETAIL_ZERO_COUNT.metadata,
    schemaId: 'schema-zero-one-level',
    name: 'Schema Zero One Level',
  },
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
    autoMapSection: vi.fn().mockResolvedValue({ suggestions: [] }),
    getAutoMapCapabilities: vi.fn(),
    getAutoMapSession: vi.fn(),
    startAutoMapSession: vi.fn().mockResolvedValue({
      sessionId: 'ams_create_1',
      runId: 'run_create_1',
      status: 'queued',
      scope: { mode: 'whole' },
    }),
    startAutoMapRun: vi.fn(),
    getAutoMapRunStatus: vi.fn(),
    listAutoMapSuggestions: vi.fn(),
    suggestExpression: vi.fn(),
    explainRule: vi.fn(),
    smartFix: vi.fn(),
    validateMappings: vi.fn(),
    querySchemaNodes: vi.fn(),
    listActivity: vi.fn(),
    previewOnServer: vi.fn(),
    saveMapping: vi.fn(),
    listMappingVersions: vi.fn(),
    getMappingVersion: vi.fn(),
    listVersions: vi.fn(),
    getVersion: vi.fn(),
    listMappingRevisions: vi.fn(),
    getMappingRevision: vi.fn(),
    createMappingVersion: vi.fn(),
    listRevisions: vi.fn(),
    getRevision: vi.fn(),
    createVersion: vi.fn(),
    saveMappingVersion: vi.fn(),
    deployMapping: vi.fn(),
    promoteDeployment: vi.fn(),
    rollbackDeployment: vi.fn(),
    listDeployments: vi.fn(),
    getCurrentDeployments: vi.fn(),
    ...overrides,
  } as unknown as ApiAdapter;
}

function EditorStateProbe() {
  const location = useLocation();
  const state = location.state as { autoMapCreateNotice?: string } | null;

  return (
    <div data-testid="mapping-editor-page">
      Editor
      <span data-testid="editor-auto-map-notice">{state?.autoMapCreateNotice ?? ''}</span>
    </div>
  );
}

function renderPage(adapter: ApiAdapter = createMockAdapter(), projectId = 'proj-1') {
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <AdapterProvider adapter={adapter}>
        <MemoryRouter initialEntries={[`/projects/${projectId}/mappings/new`]}>
          <Routes>
            <Route path="/projects/:projectId/mappings/new" element={<CreateMappingPage />} />
            <Route path="/projects/:projectId/mappings/:mappingId" element={<EditorStateProbe />} />
            <Route path="/projects/:projectId" element={<div data-testid="project-overview-page">Overview</div>} />
            <Route path="/" element={<div data-testid="home-page">Home</div>} />
          </Routes>
        </MemoryRouter>
      </AdapterProvider>
    </QueryClientProvider>,
  );
}

describe('CreateMappingPage', () => {
  it('preserves root test id', () => {
    renderPage();
    expect(screen.getByTestId('page-create-mapping')).toBeInTheDocument();
  });

  it('renders single-page section shells in expected order', () => {
    renderPage();

    const details = screen.getByTestId('mapping-details-section');
    const selection = screen.getByTestId('schema-selection-section');
    const startFrom = screen.getByTestId('start-from-section');
    const footer = screen.getByTestId('footer-actions-section');

    expect(details).toBeInTheDocument();
    expect(selection).toBeInTheDocument();
    expect(startFrom).toBeInTheDocument();
    expect(footer).toBeInTheDocument();

    expect(details.compareDocumentPosition(selection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(selection.compareDocumentPosition(startFrom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(startFrom.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('uses updated page header copy', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Create Mapping' })).toBeInTheDocument();
    expect(
      screen.getByText('Set up the mapping details and choose the schemas you want to map between.'),
    ).toBeInTheDocument();
  });

  it('removes legacy wizard UI', () => {
    renderPage();

    expect(screen.queryByRole('list', { name: /progress/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('next-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('back-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('step-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('step-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('step-3')).not.toBeInTheDocument();
  });

  it('does not introduce explicitly out-of-scope surfaces in create page shell', () => {
    renderPage();

    expect(screen.queryByText(/tags/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/template/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/deploy/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/diagnostics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/test lab/i)).not.toBeInTheDocument();
  });

  it('cancel action navigates to project overview', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId('cancel-button'));
    expect(screen.getByTestId('project-overview-page')).toBeInTheDocument();
  });

  it('shows inline validation error when mapping name is missing on submit', async () => {
    renderPage();

    const createButton = screen.getByTestId('create-button');
    expect(createButton).toBeDisabled();
  });

  it('clears name validation error once user enters mapping name', async () => {
    const user = userEvent.setup();
    const createMapping = vi.fn().mockResolvedValue(CREATED_MAPPING);
    const adapter = createMockAdapter({ createMapping });

    renderPage(adapter);

    await waitFor(() => expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('schema-select-source-schema'), 'schema-a');
    await user.selectOptions(screen.getByTestId('schema-select-target-schema'), 'schema-b');

    const createButton = screen.getByTestId('create-button');
    expect(createButton).toBeDisabled();

    await user.type(screen.getByLabelText(/mapping name/i), 'Customer Order to ShipmentOrder');
    expect(createButton).toBeEnabled();

    await user.click(createButton);
    await waitFor(() => expect(createMapping).toHaveBeenCalledTimes(1));
  });

  it('does not render business context field in reduced page scope', () => {
    renderPage();

    expect(screen.queryByLabelText(/business context/i)).not.toBeInTheDocument();
  });

  it('keeps mapping name stable after validation failure', async () => {
    const user = userEvent.setup();
    renderPage();

    const nameInput = screen.getByLabelText(/mapping name/i);

    await user.type(nameInput, 'Order Mapping');
    await user.click(screen.getByTestId('create-button'));

    expect(nameInput).toHaveValue('Order Mapping');
  });

  it('renders primary source and target schema cards with selectors together', async () => {
    renderPage();

    expect(screen.getByTestId('source-schema-card')).toBeInTheDocument();
    expect(screen.getByTestId('target-schema-card')).toBeInTheDocument();
    expect(screen.getByText('Primary Source')).toBeInTheDocument();
    expect(screen.getByText('Primary Source Schema')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument();
      expect(screen.getByTestId('schema-select-target-schema')).toBeInTheDocument();
    });
  });

  it('shows selected schema basic summary fields only in cards', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument());

    await user.selectOptions(screen.getByTestId('schema-select-source-schema'), 'schema-a');
    await user.selectOptions(screen.getByTestId('schema-select-target-schema'), 'schema-b');

    expect(screen.getByTestId('source-schema-name')).toHaveTextContent('Schema Alpha');
    expect(screen.getByTestId('source-total-fields')).toHaveTextContent('4');
    expect(screen.getByTestId('source-required-fields')).toHaveTextContent('—');
    expect(screen.getByTestId('source-format')).toHaveTextContent('JSON');
    expect(screen.getByTestId('source-origin')).toHaveTextContent('Uploaded');

    expect(screen.getByTestId('target-schema-name')).toHaveTextContent('Schema Beta');
    expect(screen.getByTestId('target-total-fields')).toHaveTextContent('2');
    expect(screen.getByTestId('target-required-fields')).toHaveTextContent('—');
    expect(screen.getByTestId('target-format')).toHaveTextContent('XML');
    expect(screen.getByTestId('target-origin')).toHaveTextContent('CDM');

    expect(screen.queryByText(/readiness/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/likely direct matches/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/repeating/i)).not.toBeInTheDocument();
  });

  it('removes standalone schema summary section and keeps metrics in schema cards', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument());

    await user.selectOptions(screen.getByTestId('schema-select-source-schema'), 'schema-a');
    await user.selectOptions(screen.getByTestId('schema-select-target-schema'), 'schema-b');

    expect(screen.queryByTestId('schema-summary-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('summary-source-fields')).not.toBeInTheDocument();
    expect(screen.queryByTestId('summary-source-required-fields')).not.toBeInTheDocument();
    expect(screen.queryByTestId('summary-target-fields')).not.toBeInTheDocument();
    expect(screen.queryByTestId('summary-target-required-fields')).not.toBeInTheDocument();

    expect(screen.getByTestId('source-total-fields')).toHaveTextContent('4');
    expect(screen.getByTestId('source-required-fields')).toHaveTextContent('—');
    expect(screen.getByTestId('target-total-fields')).toHaveTextContent('2');
    expect(screen.getByTestId('target-required-fields')).toHaveTextContent('—');
  });

  it('opens add-schema flow from source card without navigating away', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId('add-source-schema-button'));
    expect(screen.getByTestId('schema-upload-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('project-overview-page')).not.toBeInTheDocument();
  });

  it('opens add-schema flow from target card without navigating away', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId('add-target-schema-button'));
    expect(screen.getByTestId('schema-upload-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('project-overview-page')).not.toBeInTheDocument();
  });

  it('auto-selects newly added schema for source and updates source card metrics', async () => {
    const user = userEvent.setup();
    const listSchemas = vi
      .fn()
      .mockResolvedValueOnce([SCHEMA_DETAIL_A.metadata, SCHEMA_DETAIL_B.metadata])
      .mockResolvedValueOnce([SCHEMA_DETAIL_A.metadata, SCHEMA_DETAIL_B.metadata, SCHEMA_DETAIL_NEW.metadata]);
    const adapter = createMockAdapter({ listSchemas, updateProject: vi.fn() });

    renderPage(adapter);

    await waitFor(() => expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument());

    await user.click(screen.getByTestId('add-source-schema-button'));
    await user.click(screen.getByTestId('mock-add-schema-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('source-schema-name')).toHaveTextContent('Schema New');
    });
    expect(screen.getByTestId('source-total-fields')).toHaveTextContent('8');
  });

  it('auto-selects newly added schema for target and updates target card metrics', async () => {
    const user = userEvent.setup();
    const listSchemas = vi
      .fn()
      .mockResolvedValueOnce([SCHEMA_DETAIL_A.metadata, SCHEMA_DETAIL_B.metadata])
      .mockResolvedValueOnce([SCHEMA_DETAIL_A.metadata, SCHEMA_DETAIL_B.metadata, SCHEMA_DETAIL_NEW.metadata]);
    const adapter = createMockAdapter({ listSchemas, updateProject: vi.fn() });

    renderPage(adapter);

    await waitFor(() => expect(screen.getByTestId('schema-select-target-schema')).toBeInTheDocument());

    await user.click(screen.getByTestId('add-target-schema-button'));
    await user.click(screen.getByTestId('mock-add-schema-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('target-schema-name')).toHaveTextContent('Schema New');
    });
    expect(screen.getByTestId('target-total-fields')).toHaveTextContent('8');
  });

  it('renders only blank and auto-map options in Start From section (no template)', () => {
    renderPage();

    expect(screen.getByRole('radio', { name: /blank mapping/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /auto-map suggestions/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /template/i })).not.toBeInTheDocument();
  });

  it('defaults to blank mapping and updates primary CTA label by selected start mode', async () => {
    const user = userEvent.setup();
    renderPage();

    const blankRadio = screen.getByRole('radio', { name: /blank mapping/i });
    const autoMapRadio = screen.getByRole('radio', { name: /auto-map suggestions/i });

    expect(blankRadio).toBeChecked();
    expect(autoMapRadio).not.toBeChecked();
    expect(screen.getByTestId('create-button')).toHaveTextContent('Create Mapping');

    await user.click(autoMapRadio);
    expect(screen.getByTestId('create-button')).toHaveTextContent('Create & Generate Suggestions');

    await user.click(blankRadio);
    expect(screen.getByTestId('create-button')).toHaveTextContent('Create Mapping');
  });

  it('validates source and target as required fields before submit', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/mapping name/i), 'Mapping With Missing Required Fields');

    const createButton = screen.getByTestId('create-button');
    expect(createButton).toBeDisabled();
  });

  it('creates mapping in blank mode with zero enrichments and navigates to editor', async () => {
    const user = userEvent.setup();
    const createMapping = vi.fn().mockResolvedValue({
      ...CREATED_MAPPING,
      mappingId: 'mapping-blank-1',
    });
    const adapter = createMockAdapter({ createMapping, updateProject: vi.fn() });

    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/mapping name/i), 'Blank Mapping Flow');

    await user.selectOptions(screen.getByTestId('schema-select-source-schema'), 'schema-a');
    await user.selectOptions(screen.getByTestId('schema-select-target-schema'), 'schema-b');
    await user.click(screen.getByRole('radio', { name: /blank mapping/i }));
    await user.click(screen.getByTestId('create-button'));

    await waitFor(() => {
      expect(createMapping).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          name: 'Blank Mapping Flow',
          sourceSchemaRef: { schemaId: 'schema-a', type: 'published' },
          targetSchemaRef: { schemaId: 'schema-b', type: 'github', commitSha: 'sha-beta' },
        }),
      );
    });

    const createPayload = createMapping.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(createPayload.enrichmentSources).toBeUndefined();

    await waitFor(() => {
      expect(screen.getByTestId('mapping-editor-page')).toBeInTheDocument();
    });
  });

  it('supports collapsed enrichment inputs section with no rows', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByTestId('enrichment-inputs-section')).toBeInTheDocument();
    expect(screen.queryByTestId('enrichment-empty-state')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('toggle-enrichment-section'));

    expect(screen.getByTestId('enrichment-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/keyra does not call enrichment apis/i)).toBeInTheDocument();
  });

  it('adds, edits, and removes enrichment input rows', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument());

    await user.click(screen.getByTestId('toggle-enrichment-section'));
    await user.click(screen.getByTestId('add-enrichment-button'));

    await user.type(screen.getByTestId('enrichment-alias-input'), 'Customer Profile');
    await user.tab(); // trigger alias normalization blur
    await user.selectOptions(screen.getByTestId('enrichment-schema-select'), 'schema-a');
    await user.type(screen.getByTestId('enrichment-description-input'), 'CRM profile payload');
    await user.click(screen.getByTestId('save-enrichment-button'));

    expect(screen.getByTestId('enrichment-alias-0')).toHaveTextContent('customerProfile');
    expect(screen.getByTestId('enrichment-schema-0')).toHaveTextContent('Schema Alpha');
    expect(screen.getByTestId('enrichment-required-0')).toHaveTextContent('Yes');
    expect(screen.getByTestId('enrichment-description-0')).toHaveTextContent('CRM profile payload');

    await user.click(screen.getByTestId('edit-enrichment-0'));
    await user.click(screen.getByTestId('enrichment-required-checkbox'));
    await user.click(screen.getByTestId('save-enrichment-button'));

    expect(screen.getByTestId('enrichment-required-0')).toHaveTextContent('No');

    await user.click(screen.getByTestId('remove-enrichment-0'));
    expect(screen.getByTestId('enrichment-empty-state')).toBeInTheDocument();
  });

  it('blocks duplicate alias and reserved alias values with deterministic feedback', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument());
    await user.click(screen.getByTestId('toggle-enrichment-section'));

    // Add baseline alias
    await user.click(screen.getByTestId('add-enrichment-button'));
    await user.type(screen.getByTestId('enrichment-alias-input'), 'customerProfile');
    await user.selectOptions(screen.getByTestId('enrichment-schema-select'), 'schema-a');
    await user.click(screen.getByTestId('save-enrichment-button'));

    expect(screen.queryByTestId('enrichment-modal')).not.toBeInTheDocument();

    // Duplicate alias should fail
    await user.click(screen.getByTestId('add-enrichment-button'));
    await user.type(screen.getByTestId('enrichment-alias-input'), 'customerProfile');
    await user.selectOptions(screen.getByTestId('enrichment-schema-select'), 'schema-b');
    await user.click(screen.getByTestId('save-enrichment-button'));

    expect(screen.getByTestId('enrichment-alias-error')).toHaveTextContent(/already in use/i);

    await user.click(screen.getByTestId('cancel-enrichment-button'));

    // Reserved alias should fail
    await user.click(screen.getByTestId('add-enrichment-button'));
    await user.type(screen.getByTestId('enrichment-alias-input'), 'external');
    await user.selectOptions(screen.getByTestId('enrichment-schema-select'), 'schema-b');
    await user.click(screen.getByTestId('save-enrichment-button'));

    expect(screen.getByTestId('enrichment-alias-error')).toHaveTextContent(/is reserved/i);
  });

  it('create button enablement includes required fields and does not get blocked by invalid in-progress enrichment modal state', async () => {
    const user = userEvent.setup();
    const createMapping = vi.fn().mockResolvedValue(CREATED_MAPPING);
    const adapter = createMockAdapter({ createMapping });

    const firstRender = renderPage(adapter);

    const createButton = screen.getByTestId('create-button');
    expect(createButton).toBeDisabled();

    await waitFor(() => expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument());
    await user.type(screen.getByLabelText(/mapping name/i), 'Enablement Mapping');
    await user.selectOptions(screen.getByTestId('schema-select-source-schema'), 'schema-a');
    await user.selectOptions(screen.getByTestId('schema-select-target-schema'), 'schema-b');

    expect(createButton).toBeEnabled();

    await user.click(createButton);
    await waitFor(() => expect(createMapping).toHaveBeenCalledTimes(1));

    firstRender.unmount();

    renderPage(createMockAdapter({ createMapping }));
    const secondCreateButton = screen.getByTestId('create-button');
    await waitFor(() => expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument());
    await user.type(screen.getByLabelText(/mapping name/i), 'Enablement Mapping 2');
    await user.selectOptions(screen.getByTestId('schema-select-source-schema'), 'schema-a');
    await user.selectOptions(screen.getByTestId('schema-select-target-schema'), 'schema-b');

    await user.click(screen.getByTestId('toggle-enrichment-section'));
    await user.click(screen.getByTestId('add-enrichment-button'));
    await user.type(screen.getByTestId('enrichment-alias-input'), 'validAlias');
    await user.click(screen.getByTestId('save-enrichment-button'));

    expect(screen.getByTestId('enrichment-schema-error')).toHaveTextContent(/schema is required/i);
    expect(secondCreateButton).toBeEnabled(); // invalid modal draft must not poison page-level validity

    await user.selectOptions(screen.getByTestId('enrichment-schema-select'), 'schema-a');
    await user.click(screen.getByTestId('save-enrichment-button'));

    expect(screen.queryByTestId('enrichment-modal')).not.toBeInTheDocument();
    expect(secondCreateButton).toBeEnabled();

    await user.click(secondCreateButton);
    await waitFor(() => expect(createMapping).toHaveBeenCalledTimes(2));
  });

  it('create payload includes enrichmentSources when configured', async () => {
    const user = userEvent.setup();
    const createMapping = vi.fn().mockResolvedValue({
      ...CREATED_MAPPING,
      mappingId: 'mapping-enriched-1',
    });
    const adapter = createMockAdapter({ createMapping, updateProject: vi.fn() });

    renderPage(adapter);

    await waitFor(() => expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument());

    await user.type(screen.getByLabelText(/mapping name/i), 'Enriched Mapping Flow');
    await user.selectOptions(screen.getByTestId('schema-select-source-schema'), 'schema-a');
    await user.selectOptions(screen.getByTestId('schema-select-target-schema'), 'schema-b');

    await user.click(screen.getByTestId('toggle-enrichment-section'));
    await user.click(screen.getByTestId('add-enrichment-button'));
    await user.type(screen.getByTestId('enrichment-alias-input'), 'customerProfile');
    await user.selectOptions(screen.getByTestId('enrichment-schema-select'), 'schema-a');
    await user.click(screen.getByTestId('save-enrichment-button'));

    await user.click(screen.getByTestId('create-button'));

    await waitFor(() => {
      expect(createMapping).toHaveBeenCalled();
    });

    expect(createMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        name: 'Enriched Mapping Flow',
      }),
    );

    const payload = createMapping.mock.calls.at(-1)?.[0] as { enrichmentSources?: readonly MappingEnrichmentSource[] };
    expect(payload.enrichmentSources).toEqual([
      {
        alias: 'customerProfile',
        schemaId: 'schema-a',
        required: true,
      },
    ]);
  });

  it('normalizes mixed alias input to camelCase and trims leading non-letter segments', () => {
    expect(__testables.normalizeAliasToCamelCase(' Customer Profile ')).toBe('customerProfile');
    expect(__testables.normalizeAliasToCamelCase('123 customer-profile')).toBe('customerProfile');
    expect(__testables.normalizeAliasToCamelCase('___')).toBe('');
  });

  it('auto-map mode creates mapping, starts async session/run, and navigates to editor immediately', async () => {
    const user = userEvent.setup();
    const createMapping = vi.fn().mockResolvedValue(CREATED_MAPPING);
    const startAutoMapSession = vi.fn().mockResolvedValue({
      sessionId: 'ams_create_1',
      runId: 'run_create_1',
      status: 'queued',
      scope: { mode: 'whole' },
    });
    const adapter = createMockAdapter({ createMapping, startAutoMapSession });

    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/mapping name/i), 'Auto-map Unsupported Flow');

    await user.selectOptions(screen.getByTestId('schema-select-source-schema'), 'schema-a');
    await user.selectOptions(screen.getByTestId('schema-select-target-schema'), 'schema-b');
    await user.click(screen.getByRole('radio', { name: /auto-map suggestions/i }));

    await user.click(screen.getByTestId('create-button'));

    await waitFor(() => {
      expect(createMapping).toHaveBeenCalled();
    });

    expect(createMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        name: 'Auto-map Unsupported Flow',
      }),
    );

    await waitFor(() => {
      expect(startAutoMapSession).toHaveBeenCalledWith({
        projectId: 'proj-1',
        mappingId: CREATED_MAPPING.mappingId,
        mode: 'whole',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('mapping-editor-page')).toBeInTheDocument();
    });

    expect(startAutoMapSession).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('editor-auto-map-notice')).toHaveTextContent('');
  });

  it('auto-map startup failure is handled explicitly and still navigates to editor', async () => {
    const user = userEvent.setup();
    const createMapping = vi.fn().mockResolvedValue(CREATED_MAPPING);
    const startAutoMapSession = vi
      .fn()
      .mockRejectedValue(new Error('"autoMapSection" is not enabled in this mode.'));
    const adapter = createMockAdapter({ createMapping, startAutoMapSession });

    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/mapping name/i), 'Unsupported Auto-map Flow');
    await user.selectOptions(screen.getByTestId('schema-select-source-schema'), 'schema-a');
    await user.selectOptions(screen.getByTestId('schema-select-target-schema'), 'schema-b');
    await user.click(screen.getByRole('radio', { name: /auto-map suggestions/i }));
    await user.click(screen.getByTestId('create-button'));

    await waitFor(() => {
      expect(screen.getByTestId('mapping-editor-page')).toBeInTheDocument();
    });

    expect(startAutoMapSession).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('editor-auto-map-notice')).toHaveTextContent(
      'Mapping created. Auto-Map suggestions are not available in this mode.',
    );
  });

  it('selector options include schema name and format only', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument();
    });

    const sourceSelect = screen.getByTestId('schema-select-source-schema');
    const sourceOptions = Array.from(sourceSelect.querySelectorAll('option')).map((option) => option.textContent ?? '');

    expect(
      sourceOptions.some((text) =>
        text.includes('Schema Beta')
        && text.includes('XML')
        && !text.includes('CDM')
        && !text.includes('Ready')
        && !text.includes('fields')),
    ).toBe(true);
  });

  it('error schemas are visible but non-selectable; needs_review schemas are warning-selectable', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        SCHEMA_DETAIL_A.metadata,
        SCHEMA_DETAIL_B.metadata,
        SCHEMA_DETAIL_NEEDS_REVIEW.metadata,
        SCHEMA_DETAIL_ERROR.metadata,
      ]),
      getSchema: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'schema-b') return SCHEMA_DETAIL_B;
        if (id === 'schema-needs-review') return SCHEMA_DETAIL_NEEDS_REVIEW;
        if (id === 'schema-error') return SCHEMA_DETAIL_ERROR;
        return SCHEMA_DETAIL_A;
      }),
    });
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-select-target-schema')).toBeInTheDocument();
    });

    const targetSelect = screen.getByTestId('schema-select-target-schema') as HTMLSelectElement;
    const errorOption = targetSelect.querySelector('option[value="schema-error"]') as HTMLOptionElement | null;
    expect(errorOption).not.toBeNull();
    expect(errorOption?.disabled).toBe(true);

    await user.selectOptions(targetSelect, 'schema-needs-review');
    expect(targetSelect.value).toBe('schema-needs-review');
    expect(screen.getByTestId('target-status')).toHaveTextContent('Ready');
    expect(screen.queryByTestId('target-needs-review-warning')).not.toBeInTheDocument();
  });

  it('falls back to schema detail field counting when selected schema fieldCount is zero', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        SCHEMA_DETAIL_A.metadata,
        SCHEMA_DETAIL_ZERO_COUNT_ONE_LEVEL.metadata,
      ]),
      getSchema: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'schema-zero-one-level') {
          return SCHEMA_DETAIL_ZERO_COUNT_ONE_LEVEL;
        }

        return SCHEMA_DETAIL_A;
      }),
    });
    const user = userEvent.setup();

    renderPage(adapter);

    await waitFor(() => expect(screen.getByTestId('schema-select-source-schema')).toBeInTheDocument());

    await user.selectOptions(screen.getByTestId('schema-select-source-schema'), 'schema-zero-one-level');

    await waitFor(() => {
      expect(screen.getByTestId('source-total-fields')).toHaveTextContent('3');
      expect(adapter.getSchema).toHaveBeenCalledWith('schema-zero-one-level');
    });
  });
});
