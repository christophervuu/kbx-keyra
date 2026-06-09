import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { SchemaDetailPage } from '../SchemaDetailPage';

import { BreadcrumbProvider } from '@/components/layout/BreadcrumbContext';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { SchemaDetail, SchemaSamplePayloadContent } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CDM_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'schema-cdm-1',
    name: 'CDM Customer',
    format: 'json-schema',
    fieldCount: 12,
    origin: 'cdm',
    status: 'ready',
    scope: 'global',
    description: 'CDM customer object',
    updatedBy: 'system',
    inferred: false,
    syncStatus: 'synced',
    source: { type: 'upload' },
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  },
  content: {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
  },
};

const UPLOADED_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'schema-uploaded-1',
    name: 'My Uploaded Schema',
    format: 'json-schema',
    fieldCount: 5,
    origin: 'uploaded',
    status: 'ready',
    scope: 'project',
    description: 'An uploaded schema',
    updatedBy: 'local-user',
    inferred: false,
    syncStatus: 'sync-failed',
    sourceKind: 'json_schema',
    dataFormat: 'json',
    source: { type: 'upload' },
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-10T00:00:00Z',
  },
  content: {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
  },
};

const INFERRED_XML_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'schema-inferred-xml-1',
    name: 'Inferred XML Schema',
    format: 'xsd',
    dataFormat: 'xml',
    sourceKind: 'inferred_from_xml',
    fieldCount: 0,
    origin: 'inferred',
    status: 'needs_review',
    description: 'Generated from sample XML payload',
    updatedBy: 'local-user',
    inferred: true,
    syncStatus: 'sync-failed',
    source: { type: 'upload' },
    samplePayloadCount: 1,
    samplePayloads: [
      {
        sampleId: 'sample-1',
        schemaId: 'schema-inferred-xml-1',
        name: 'Initial upload',
        dataFormat: 'xml',
        contentRef: 'schemas/schema-inferred-xml-1/samples/sample-1/payload.xml',
        usedForInference: true,
        source: 'initial_upload',
        createdAt: '2026-04-01T00:00:00Z',
      },
    ],
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-02T00:00:00Z',
  },
  content: '<person><name>Alice</name></person>',
};

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listSchemas: vi.fn(),
    getSchema: vi.fn().mockResolvedValue(UPLOADED_SCHEMA),
    createSchema: vi.fn(),
    updateSchema: vi.fn().mockImplementation((_id, input) =>
      Promise.resolve({ ...UPLOADED_SCHEMA.metadata, ...input }),
    ),
    markSchemaReviewed: vi.fn().mockResolvedValue({ ...UPLOADED_SCHEMA.metadata, status: 'ready' }),
    addSchemaSample: vi.fn().mockResolvedValue({
      sample: {
        sampleId: 'sample-x',
        schemaId: 'schema-uploaded-1',
        name: 'Sample X',
        dataFormat: 'json',
        contentRef: 'schemas/schema-uploaded-1/samples/sample-x/payload.json',
        usedForInference: false,
        source: 'added_sample',
        createdAt: '2026-06-09T00:00:00Z',
      },
      diff: {
        additions: ['foo'],
        typeConflicts: [],
        requiredOptionalEvidence: [],
      },
      schemaUpdated: false,
      mode: 'save_only',
      metadata: {
        ...UPLOADED_SCHEMA.metadata,
        samplePayloadCount: 1,
        samplePayloads: [
          {
            sampleId: 'sample-x',
            schemaId: 'schema-uploaded-1',
            name: 'Sample X',
            dataFormat: 'json',
            contentRef: 'schemas/schema-uploaded-1/samples/sample-x/payload.json',
            usedForInference: false,
            source: 'added_sample',
            createdAt: '2026-06-09T00:00:00Z',
          },
        ],
      },
    }),
    deleteSchemaSample: vi.fn().mockResolvedValue({
      ...UPLOADED_SCHEMA.metadata,
      samplePayloadCount: 0,
      samplePayloads: [],
    }),
    getSchemaSamplePayload: vi.fn().mockResolvedValue({
      schemaId: 'schema-uploaded-1',
      sampleId: 'sample-x',
      dataFormat: 'json',
      raw: '{"name":"Alice"}',
      parsed: { name: 'Alice' },
    } satisfies SchemaSamplePayloadContent),
    deleteSchema: vi.fn(),
    listMappings: vi.fn(),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
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
    explainRule: vi.fn(),
    smartFix: vi.fn(),
    validateMappings: vi.fn(),
    querySchemaNodes: vi.fn(),
    listActivity: vi.fn(),
    previewOnServer: vi.fn(),
    ...overrides,
  } as unknown as ApiAdapter;
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(adapter: ApiAdapter, schemaId = 'schema-uploaded-1') {
  return render(
    <MemoryRouter initialEntries={[`/schemas/${schemaId}`]}>
      <BreadcrumbProvider>
        <Breadcrumbs />
        <AdapterProvider adapter={adapter}>
          <Routes>
            <Route
              path="/schemas/:schemaId"
              element={<SchemaDetailPage schemaId={schemaId} />}
            />
            <Route path="/schemas" element={<div data-testid="schema-library-page">Library</div>} />
            <Route path="/projects/:projectId" element={<div data-testid="project-overview-page">Project</div>} />
            <Route path="/projects/:projectId/mappings/:mappingId" element={<div data-testid="mapping-editor-page">Mapping</div>} />
          </Routes>
        </AdapterProvider>
      </BreadcrumbProvider>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaDetailPage', () => {
  let adapter: ApiAdapter;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it('has data-testid on root element', async () => {
    renderPage(adapter);
    expect(screen.getByTestId('page-schema-detail')).toBeInTheDocument();
  });

  it('shows skeleton while loading', () => {
    adapter = createMockAdapter({ getSchema: vi.fn(() => new Promise(() => {})) });
    renderPage(adapter);
    expect(screen.getByTestId('schema-detail-skeleton')).toBeInTheDocument();
  });

  it('renders CDM schema metadata in read-only mode', async () => {
    adapter = createMockAdapter({ getSchema: vi.fn().mockResolvedValue(CDM_SCHEMA) });
    renderPage(adapter, 'schema-cdm-1');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'CDM Customer' })).toBeInTheDocument();
    });

    expect(screen.getByTestId('schema-detail-header')).toBeInTheDocument();
    expect(screen.getByText('CDM')).toBeInTheDocument();
    expect(screen.getByTestId('schema-detail-field-count')).toHaveTextContent(/1 field/i);
    expect(screen.getByTestId('schema-detail-data-format')).toHaveTextContent('JSON');
    expect(screen.getByTestId('schema-detail-source-kind')).toHaveTextContent('JSON Schema');
    expect(screen.getByTestId('cdm-read-only-note')).toHaveTextContent('CDM schema is read-only in Schema Detail.');

    const heading = screen.getByRole('heading', { level: 1, name: 'CDM Customer' });
    expect(heading.tagName).toBe('H1');
    expect(heading).not.toHaveAttribute('role', 'button');
  });

  it('renders uploaded schema metadata with editable name and description', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-header')).toBeInTheDocument();
    });

    const nameButton = screen.getByRole('button', { name: /edit schema name/i });
    expect(nameButton).toBeInTheDocument();
    expect(screen.getByTestId('schema-detail-data-format')).toHaveTextContent('JSON');
    expect(screen.getByTestId('schema-detail-source-kind')).toHaveTextContent('JSON Schema');
  });

  it('renders XSD-backed inferred schema metadata with explicit XML and inferred source kind', async () => {
    adapter = createMockAdapter({ getSchema: vi.fn().mockResolvedValue(INFERRED_XML_SCHEMA) });
    renderPage(adapter, 'schema-inferred-xml-1');

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-header')).toBeInTheDocument();
    });

    expect(screen.getByTestId('schema-detail-data-format')).toHaveTextContent('XML');
    expect(screen.getByTestId('schema-detail-source-kind')).toHaveTextContent('XSD');
    expect(screen.getByTestId('schema-status-ready')).toBeInTheDocument();
  });

  it('renders schema header even when origin value is malformed', async () => {
    const legacyOriginSchema: SchemaDetail = {
      ...UPLOADED_SCHEMA,
      metadata: {
        ...UPLOADED_SCHEMA.metadata,
        schemaId: 'schema-legacy-origin',
        origin: 'legacy-origin' as unknown as SchemaDetail['metadata']['origin'],
      },
    };

    adapter = createMockAdapter({
      getSchema: vi.fn().mockResolvedValue(legacyOriginSchema),
    });

    renderPage(adapter, 'schema-legacy-origin');

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-header')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /edit schema name/i })).toHaveTextContent('My Uploaded Schema');
  });

  it('inline name edit calls updateSchema on blur', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit schema name/i })).toBeInTheDocument();
    });

    // Click to enter edit mode
    await user.click(screen.getByRole('button', { name: /edit schema name/i }));

    const input = screen.getByRole('textbox', { name: /edit schema name/i });
    await user.clear(input);
    await user.type(input, 'Updated Name');
    await user.tab(); // trigger blur

    await waitFor(() => {
      expect(adapter.updateSchema).toHaveBeenCalledWith(
        'schema-uploaded-1',
        expect.objectContaining({ name: 'Updated Name' }),
      );
    });
  });

  it('error state shows retry button', async () => {
    adapter = createMockAdapter({
      getSchema: vi.fn().mockRejectedValue(new Error('Network failure')),
    });
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });

    expect(screen.getByText(/failed to load schema/i)).toBeInTheDocument();
  });

  it('retry button re-fetches data', async () => {
    const user = userEvent.setup();
    const getSchema = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(UPLOADED_SCHEMA);
    adapter = createMockAdapter({ getSchema });
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('retry-button'));

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-header')).toBeInTheDocument();
    });

    expect(getSchema).toHaveBeenCalledTimes(2);
  });

  it('not-found state shows message and link back to library', async () => {
    const notFoundErr = Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });
    adapter = createMockAdapter({
      getSchema: vi.fn().mockRejectedValue(notFoundErr),
    });
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-not-found')).toBeInTheDocument();
    });

    expect(screen.getByText(/schema not found/i)).toBeInTheDocument();
    expect(screen.getByTestId('back-to-library-link')).toBeInTheDocument();
  });

  it('renders schema detail layout sections', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-header')).toBeInTheDocument();
    });

    expect(screen.getByTestId('schema-detail-samples-slot')).toBeInTheDocument();
    expect(screen.getByTestId('schema-detail-samples')).toBeInTheDocument();
    expect(screen.getByTestId('schema-detail-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('schema-detail-tree')).toBeInTheDocument();
    expect(screen.getByTestId('schema-field-details')).toBeInTheDocument();
    expect(screen.getByTestId('schema-detail-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('schema-git-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schema-detail-usage')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schema-detail-metadata')).not.toBeInTheDocument();
  });

  it('breadcrumb resolves final segment to schema name (AE-01)', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    });

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const currentCrumb = nav.querySelector('[aria-current="page"]');
    expect(currentCrumb).not.toBeNull();
    expect(currentCrumb).toHaveTextContent('My Uploaded Schema');
    expect(nav).not.toHaveTextContent('schema-uploaded-1');
  });

  it('header summary includes source, field count, and usage link', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-header-summary-line')).toBeInTheDocument();
    });

    expect(screen.getByTestId('schema-detail-source-kind')).toHaveTextContent('JSON Schema');
    expect(screen.getByTestId('schema-detail-field-count')).toHaveTextContent(/field/i);
    expect(screen.getByTestId('schema-detail-usage-link')).toHaveTextContent(/used by/i);
    expect(screen.getByTestId('schema-detail-created-at')).toBeInTheDocument();
    expect(screen.getByTestId('schema-detail-updated-at')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // T-04: Tree section and edit mode
  // -------------------------------------------------------------------------

  it('tree section renders for a local json-schema schema', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-tree')).toBeInTheDocument();
    });

    // Top-level Edit action removed; field-level edit is in Field Details
    expect(screen.queryByTestId('field-details-edit-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-root-field-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('editing-banner')).not.toBeInTheDocument();
  });

  it('field details edit mode shows save and cancel controls for selected field', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-tree')).toBeInTheDocument();
    });

    const [firstTreeItem] = screen.getAllByRole('treeitem');
    expect(firstTreeItem).toBeInTheDocument();
    await user.click(firstTreeItem);

    expect(screen.getByTestId('field-details-edit-button')).toBeInTheDocument();

    await user.click(screen.getByTestId('field-details-edit-button'));

    expect(screen.getByTestId('field-details-edit-form')).toBeInTheDocument();
    expect(screen.getByTestId('field-details-save-button')).toBeInTheDocument();
    expect(screen.getByTestId('field-details-cancel-button')).toBeInTheDocument();
  });

  it('cancel exits field details edit mode and restores read-only details', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-tree')).toBeInTheDocument();
    });

    const [firstTreeItem] = screen.getAllByRole('treeitem');
    expect(firstTreeItem).toBeInTheDocument();
    await user.click(firstTreeItem);
    await user.click(screen.getByTestId('field-details-edit-button'));

    expect(screen.getByTestId('field-details-edit-form')).toBeInTheDocument();

    await user.click(screen.getByTestId('field-details-cancel-button'));

    expect(screen.queryByTestId('field-details-edit-form')).not.toBeInTheDocument();
    expect(screen.getByTestId('field-details-name')).toBeInTheDocument();
  });

  it('CDM schema keeps Field Details read-only with no edit action', async () => {
    adapter = createMockAdapter({ getSchema: vi.fn().mockResolvedValue(CDM_SCHEMA) });
    renderPage(adapter, 'schema-cdm-1');

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-tree')).toBeInTheDocument();
    });

    const [firstTreeItem] = screen.getAllByRole('treeitem');
    expect(firstTreeItem).toBeInTheDocument();
    await userEvent.click(firstTreeItem);
    expect(screen.queryByTestId('field-details-edit-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('field-details-readonly-note')).toBeInTheDocument();
    expect(screen.queryByTestId('add-root-field-button')).not.toBeInTheDocument();
  });

  it('CDM schema actions show header overflow View raw only and hide schema-edit entrypoints', async () => {
    adapter = createMockAdapter({ getSchema: vi.fn().mockResolvedValue(CDM_SCHEMA) });
    renderPage(adapter, 'schema-cdm-1');

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-header-actions')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('field-details-edit-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('action-overflow-trigger')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('action-overflow-trigger'));

    expect(screen.getByTestId('action-view-raw')).toBeInTheDocument();
    expect(screen.queryByTestId('action-replace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-remove')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-sync-github')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-resync')).not.toBeInTheDocument();
  });

  it('XSD format schema does not show field edit controls', async () => {
    const XSD_SCHEMA: SchemaDetail = {
      metadata: {
        ...UPLOADED_SCHEMA.metadata,
        schemaId: 'schema-xsd-1',
        format: 'xsd',
        name: 'XSD Schema',
      },
      content: '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"></xs:schema>',
    };
    adapter = createMockAdapter({ getSchema: vi.fn().mockResolvedValue(XSD_SCHEMA) });
    renderPage(adapter, 'schema-xsd-1');

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-tree')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('field-details-edit-button')).not.toBeInTheDocument();
  });

  it('does not force needs_review badge from review issues when status is ready', async () => {
    adapter = createMockAdapter({ getSchema: vi.fn().mockResolvedValue({
      ...INFERRED_XML_SCHEMA,
      metadata: {
        ...INFERRED_XML_SCHEMA.metadata,
        status: 'ready',
        reviewState: 'unreviewed',
        reviewIssues: [{ code: 'missing_description', count: 1, blocking: false }],
      },
    }) });

    renderPage(adapter, 'schema-inferred-xml-1');

    await waitFor(() => {
      expect(screen.getByTestId('schema-status-ready')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('schema-status-needs_review')).not.toBeInTheDocument();
  });

  it('does not force needs_review badge for non-inferred not_required schemas', async () => {
    adapter = createMockAdapter({
      getSchema: vi.fn().mockResolvedValue({
        ...UPLOADED_SCHEMA,
        metadata: {
          ...UPLOADED_SCHEMA.metadata,
          status: 'ready',
          inferred: false,
          reviewState: 'not_required',
        },
      }),
    });

    renderPage(adapter, 'schema-uploaded-1');

    await waitFor(() => {
      expect(screen.getByTestId('schema-status-ready')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('schema-status-needs_review')).not.toBeInTheDocument();
  });

  it('coerces stale needs_review status to ready when review is not applicable', async () => {
    adapter = createMockAdapter({
      getSchema: vi.fn().mockResolvedValue({
        ...UPLOADED_SCHEMA,
        metadata: {
          ...UPLOADED_SCHEMA.metadata,
          status: 'needs_review',
          inferred: false,
          reviewState: 'not_required',
        },
      }),
    });

    renderPage(adapter, 'schema-uploaded-1');

    await waitFor(() => {
      expect(screen.getByTestId('schema-status-ready')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('schema-status-needs_review')).not.toBeInTheDocument();
  });

  it('field details uses tree-consistent type badge colors and required-yes red badge', async () => {
    const requiredFieldSchema: SchemaDetail = {
      ...UPLOADED_SCHEMA,
      content: {
        type: 'object',
        required: ['amount'],
        properties: {
          amount: { type: 'number' },
        },
      },
    };

    adapter = createMockAdapter({ getSchema: vi.fn().mockResolvedValue(requiredFieldSchema) });

    const user = userEvent.setup();
    renderPage(adapter, 'schema-uploaded-1');

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-tree')).toBeInTheDocument();
    });

    const [firstTreeItem] = screen.getAllByRole('treeitem');
    expect(firstTreeItem).toBeInTheDocument();
    await user.click(firstTreeItem);

    const typeBadge = screen.getByTestId('field-details-type');
    expect(typeBadge).toHaveClass('bg-green-900/60');
    expect(typeBadge).toHaveClass('text-green-300');

    const requiredBadge = screen.getByTestId('field-details-required');
    expect(requiredBadge).toHaveTextContent('Yes');
    expect(requiredBadge).toHaveClass('border-rose-900/70');
    expect(requiredBadge).toHaveClass('bg-rose-950/70');
    expect(requiredBadge).toHaveClass('text-rose-300');

    expect(screen.getByTestId('field-details-name')).toHaveClass('text-sm');
    expect(screen.getByTestId('field-details-path')).not.toHaveClass('font-mono');
  });

  it('field details save updates selected field via schema update', async () => {
    const updateSchema = vi.fn().mockResolvedValue({ ...UPLOADED_SCHEMA.metadata });
    adapter = createMockAdapter({ updateSchema });

    const user = userEvent.setup();
    renderPage(adapter, 'schema-uploaded-1');

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-tree')).toBeInTheDocument();
    });

    const [firstTreeItem] = screen.getAllByRole('treeitem');
    expect(firstTreeItem).toBeInTheDocument();
    await user.click(firstTreeItem);
    await user.click(screen.getByTestId('field-details-edit-button'));
    await user.clear(screen.getByTestId('field-details-description-input'));
    await user.type(screen.getByTestId('field-details-description-input'), 'Updated from field details');
    await user.click(screen.getByTestId('field-details-save-button'));

    await waitFor(() => {
      expect(updateSchema).toHaveBeenCalled();
    });
  });

  it('does not render inferred review banner UI on schema detail page', async () => {
    adapter = createMockAdapter({
      getSchema: vi.fn().mockResolvedValue(INFERRED_XML_SCHEMA),
    });

    renderPage(adapter, 'schema-inferred-xml-1');

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-header')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('schema-detail-review-slot')).not.toBeInTheDocument();
    expect(screen.queryByTestId('inferred-schema-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mark-reviewed-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  it('usage link opens modal and mapping/project links navigate', async () => {
    adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([
        { projectId: 'project-1', name: 'Project One', description: '', slug: 'project-one', updatedAt: '2026-03-10T00:00:00Z' },
      ]),
      getProject: vi.fn().mockResolvedValue({
        projectId: 'project-1',
        name: 'Project One',
        description: '',
        slug: 'project-one',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-03-10T00:00:00Z',
        schemaRefs: [{ schemaId: 'schema-uploaded-1', role: 'source' }],
        mappings: [],
      }),
      listMappings: vi.fn().mockResolvedValue([
        {
          mappingId: 'mapping-1',
          projectId: 'project-1',
          name: 'Order Mapping',
          version: 1,
          status: 'draft',
          sourceSchemaId: 'schema-uploaded-1',
          targetSchemaId: 'schema-target-1',
          ruleCount: 1,
          coverage: 100,
          updatedAt: '2026-03-10T00:00:00Z',
        },
      ]),
    });

    const user = userEvent.setup();
    renderPage(adapter, 'schema-uploaded-1');

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-usage-link')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('schema-detail-usage-link'));

    expect(screen.getByTestId('schema-usage-modal')).toBeInTheDocument();
    expect(screen.getByText('Order Mapping')).toBeInTheDocument();

    await user.click(screen.getByTestId('schema-usage-modal-project-project-1'));
    await waitFor(() => {
      expect(screen.getByTestId('project-overview-page')).toBeInTheDocument();
    });

    renderPage(adapter, 'schema-uploaded-1');
    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-usage-link')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('schema-detail-usage-link'));
    await user.click(screen.getByTestId('schema-usage-modal-mapping-mapping-1'));
    await waitFor(() => {
      expect(screen.getByTestId('mapping-editor-page')).toBeInTheDocument();
    });
  });

  it('shows initial inferred sample with ready label', async () => {
    adapter = createMockAdapter({ getSchema: vi.fn().mockResolvedValue(INFERRED_XML_SCHEMA) });
    renderPage(adapter, 'schema-inferred-xml-1');

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-samples')).toBeInTheDocument();
    });

    expect(screen.getByText('Initial upload')).toBeInTheDocument();
    expect(screen.getByTestId('sample-ready-tag')).toBeInTheDocument();
    expect(screen.getByTestId('sample-ready-tag')).toHaveTextContent('Ready');
  });

  it('selecting sample shows value on tree row and field details', async () => {
    const user = userEvent.setup();
    renderPage(adapter, 'schema-uploaded-1');

    await waitFor(() => {
      expect(screen.getByTestId('add-sample-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('add-sample-button'));
    fireEvent.change(screen.getByTestId('sample-content-input'), { target: { value: '{"name":"Alice"}' } });
    await user.click(screen.getByTestId('add-sample-save'));

    await waitFor(() => {
      expect(screen.getByTestId('schema-node-sample-value-name')).toHaveTextContent('Alice');
    });

    const [firstTreeItem] = screen.getAllByRole('treeitem');
    await user.click(firstTreeItem);

    expect(screen.getByTestId('field-details-sample-value')).toHaveTextContent('Alice');
  });

  it('sample row view button opens raw payload modal', async () => {
    const user = userEvent.setup();
    renderPage(adapter, 'schema-uploaded-1');

    await waitFor(() => {
      expect(screen.getByTestId('add-sample-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('add-sample-button'));
    fireEvent.change(screen.getByTestId('sample-content-input'), { target: { value: '{"name":"Alice"}' } });
    await user.click(screen.getByTestId('add-sample-save'));

    await waitFor(() => {
      expect(screen.getByTestId('sample-list')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('sample-view-sample-x'));

    expect(screen.getByTestId('view-sample-modal')).toBeInTheDocument();
    expect(screen.getByTestId('view-sample-content')).toHaveTextContent('{"name":"Alice"}');
  });

  it('loads raw payload via API when viewing persisted sample without local cache', async () => {
    const existingSampleSchema: SchemaDetail = {
      ...UPLOADED_SCHEMA,
      metadata: {
        ...UPLOADED_SCHEMA.metadata,
        samplePayloadCount: 1,
        samplePayloads: [
          {
            sampleId: 'sample-existing',
            schemaId: 'schema-uploaded-1',
            name: 'Existing sample',
            dataFormat: 'json',
            contentRef: 'schemas/schema-uploaded-1/samples/sample-existing/payload.json',
            usedForInference: false,
            source: 'added_sample',
            createdAt: '2026-06-09T00:00:00Z',
          },
        ],
      },
    };

    adapter = createMockAdapter({
      getSchema: vi.fn().mockResolvedValue(existingSampleSchema),
      getSchemaSamplePayload: vi.fn().mockResolvedValue({
        schemaId: 'schema-uploaded-1',
        sampleId: 'sample-existing',
        dataFormat: 'json',
        raw: '{"customer":{"name":"Ava"}}',
        parsed: { customer: { name: 'Ava' } },
      }),
    });

    const user = userEvent.setup();
    renderPage(adapter, 'schema-uploaded-1');

    await waitFor(() => {
      expect(screen.getByTestId('sample-row-sample-existing')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('sample-view-sample-existing'));

    await waitFor(() => {
      expect(adapter.getSchemaSamplePayload).toHaveBeenCalledWith('schema-uploaded-1', 'sample-existing');
    });

    expect(screen.getByTestId('view-sample-content')).toHaveTextContent('"Ava"');
  });

  it('clicking selected sample again unselects and clears sample-derived values', async () => {
    const user = userEvent.setup();
    renderPage(adapter, 'schema-uploaded-1');

    await waitFor(() => {
      expect(screen.getByTestId('add-sample-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('add-sample-button'));
    fireEvent.change(screen.getByTestId('sample-content-input'), { target: { value: '{"name":"Alice"}' } });
    await user.click(screen.getByTestId('add-sample-save'));

    await waitFor(() => {
      expect(screen.getByTestId('schema-node-sample-value-name')).toHaveTextContent('Alice');
    });

    await user.click(screen.getByTestId('sample-row-sample-x'));

    expect(screen.queryByTestId('schema-node-sample-value-name')).not.toBeInTheDocument();

    const [firstTreeItem] = screen.getAllByRole('treeitem');
    await user.click(firstTreeItem);
    expect(screen.getByTestId('field-details-sample-value')).toHaveTextContent('None');
  });

  it('sample row delete button requires confirmation and persists deletion', async () => {
    const user = userEvent.setup();
    renderPage(adapter, 'schema-uploaded-1');

    await waitFor(() => {
      expect(screen.getByTestId('add-sample-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('add-sample-button'));
    fireEvent.change(screen.getByTestId('sample-content-input'), { target: { value: '{"name":"Alice"}' } });
    await user.click(screen.getByTestId('add-sample-save'));

    await waitFor(() => {
      expect(screen.getByTestId('sample-row-sample-x')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('sample-diff-summary')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('sample-delete-sample-x'));
    expect(screen.getByTestId('delete-sample-modal')).toBeInTheDocument();

    await user.click(screen.getByTestId('delete-sample-confirm'));

    await waitFor(() => {
      expect(adapter.deleteSchemaSample).toHaveBeenCalledWith('schema-uploaded-1', 'sample-x');
    });

    expect(screen.queryByTestId('sample-row-sample-x')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schema-node-sample-value-name')).not.toBeInTheDocument();
  });

  it('add-sample flow provides explicit action choices and does not auto-mutate without apply-all', async () => {
    const addSchemaSample = vi
      .fn()
      .mockResolvedValue({
        sample: {
          sampleId: 'sample-save',
          schemaId: 'schema-uploaded-1',
          name: 'Save only',
          dataFormat: 'json',
          contentRef: 'schemas/schema-uploaded-1/samples/sample-save/payload.json',
          usedForInference: false,
          source: 'added_sample',
          createdAt: '2026-06-09T00:00:00Z',
        },
        diff: { additions: ['a'], typeConflicts: [], requiredOptionalEvidence: [] },
        schemaUpdated: false,
        mode: 'save_only',
        metadata: {
          ...UPLOADED_SCHEMA.metadata,
          samplePayloadCount: 1,
          samplePayloads: [],
        },
      });

    adapter = createMockAdapter({ addSchemaSample });
    const user = userEvent.setup();
    renderPage(adapter, 'schema-uploaded-1');

    await waitFor(() => {
      expect(screen.getByTestId('add-sample-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('add-sample-button'));
    fireEvent.change(screen.getByTestId('sample-content-input'), { target: { value: '{"a":1}' } });

    expect(screen.getByTestId('add-sample-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('add-sample-save')).toBeInTheDocument();
    expect(screen.queryByTestId('add-sample-review-one-by-one')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-sample-save-only')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('add-sample-save'));

    await waitFor(() => {
      expect(addSchemaSample).toHaveBeenCalledWith(
        'schema-uploaded-1',
        expect.objectContaining({ applySuggestedUpdates: false }),
      );
    });
  });

});
