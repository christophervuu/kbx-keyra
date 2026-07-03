import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ProjectValueMappingsPage } from '../ProjectValueMappingsPage';

import { AdapterProvider, createQueryClient } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type {
  MappingConfig,
  MappingMetadata,
  MappingRevision,
  MappingRevisionDetail,
  MappingSaveResult,
  MappingVersion,
  MappingVersionEntry,
  ProjectDetail,
  ProjectMetadata,
  ProjectValueMapDetail,
  ProjectValueMapLinkSummary,
  ProjectValueTable,
  ProjectValueTableRevision,
  ReviewProjectValueMapUpdateResult,
  ResolveProjectValueTableReferenceResult,
  SchemaDetail,
  SchemaMetadata,
  ValueMapUsageSummary,
  ValueTableDiffPage,
  ValueTableUsageEntry,
} from '@/lib/types';

const TABLE: ProjectValueTable = {
  id: 'vt-1',
  projectId: 'p-1',
  key: 'order-status',
  name: 'Order Status Codes',
  description: 'Order status mappings',
  sideA: { key: 'oms-status', label: 'OMS Status', type: 'string' },
  sideB: { key: 'cdm-status', label: 'CDM Status', type: 'string' },
  currentRevision: 1,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const REVISION: ProjectValueTableRevision = {
  valueTableId: 'vt-1',
  revision: 1,
  sideA: { key: 'oms-status', label: 'OMS Status', type: 'string' },
  sideB: { key: 'cdm-status', label: 'CDM Status', type: 'string' },
  rows: [
    { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
    { id: 'r2', sideAValue: 'confirmed', sideBValue: 'REOPENED' },
  ],
  rowCount: 2,
  directionSupport: { aToB: false, bToA: true },
  createdAt: '2026-01-01T00:00:00.000Z',
};

const USAGE: ValueTableUsageEntry[] = [
  {
    valueTableId: 'vt-1',
    tableKey: 'order-status',
    mappingId: 'm-1',
    mappingName: 'Order Sync Mapping',
    mappingVersion: 3,
    pinnedRevision: 1,
    direction: 'a_to_b',
    inputSideKey: 'oms-status',
    outputSideKey: 'cdm-status',
    newerRevisionAvailable: false,
    latestRevision: 1,
    latestDirectionSupported: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const LINK_SUMMARY: ProjectValueMapLinkSummary = {
  projectId: 'p-1',
  valueMapId: 'gvm-1',
  key: 'global-order-status',
  name: 'Global Order Status',
  pinnedRevision: 1,
  latestRevision: 2,
  overlayRevision: 0,
  updateAvailable: true,
  dependencyState: 'needs-review',
  status: 'active',
};

const LINK_DETAIL: ProjectValueMapDetail = {
  projectId: 'p-1',
  valueMapId: 'gvm-1',
  key: 'global-order-status',
  name: 'Global Order Status',
  pinnedRevision: 1,
  latestRevision: 2,
  overlayRevision: 1,
  updateAvailable: true,
  dependencyState: 'needs-review',
  effectiveRows: [
    { rowId: 'g-row-1', sideAValue: 'confirmed', sideBValue: 'OPEN', provenance: 'inherited' },
    { rowId: 'g-row-2', sideAValue: 'cancelled', sideBValue: 'CLOSED', provenance: 'override' },
    { rowId: 'add-1', sideAValue: 'on-hold', sideBValue: 'PAUSED', provenance: 'add' },
  ],
};

const REVIEW_BLOCKED: ReviewProjectValueMapUpdateResult = {
  projectId: 'p-1',
  valueMapId: 'gvm-1',
  currentPinnedRevision: 1,
  candidateRevision: 2,
  updateAvailable: true,
  conflicts: [{ type: 'orphan', rowId: 'g-row-9', message: 'Overlay target row no longer exists in candidate revision: g-row-9' }],
  orphanedRowIds: ['g-row-9'],
  canAccept: false,
};

const VALUE_MAP_USAGE: ValueMapUsageSummary = {
  mappings: [USAGE[0]],
  linkedProjects: [],
  counts: {
    mappings: 1,
    linkedProjects: 0,
  },
};

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listSchemas: vi.fn(async (): Promise<SchemaMetadata[]> => []),
    getSchema: vi.fn(async (): Promise<SchemaDetail> => ({
      metadata: {
        schemaId: 's-1',
        name: 'Schema',
        format: 'json-schema',
        fieldCount: 0,
        origin: 'uploaded',
        status: 'ready',
        syncStatus: 'sync-failed',
        source: { type: 'upload' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      content: {},
    })),
    createSchema: vi.fn(),
    updateSchema: vi.fn(),
    markSchemaReviewed: vi.fn(),
    addSchemaSample: vi.fn(),
    deleteSchemaSample: vi.fn(),
    getSchemaSamplePayload: vi.fn(),
    deleteSchema: vi.fn(),

    listMappings: vi.fn(async (): Promise<MappingMetadata[]> => []),
    getMapping: vi.fn(async (): Promise<MappingConfig> => ({
      name: 'Map',
      version: 1,
      engineVersion: '2.0.0',
      config: {},
      rules: [],
    })),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    saveMapping: vi.fn(async (): Promise<MappingSaveResult> => ({ revision: 1, noChange: false })),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),

    listMappingVersions: vi.fn(async (): Promise<MappingVersionEntry[]> => []),
    getMappingVersion: vi.fn(),
    listVersions: vi.fn(async (): Promise<MappingVersion[]> => []),
    getVersion: vi.fn(),
    listMappingRevisions: vi.fn(async (): Promise<MappingRevision[]> => []),
    getMappingRevision: vi.fn(async (): Promise<MappingRevisionDetail> => ({
      mappingId: 'm-1',
      revision: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      savedBy: 'tester',
      ruleCount: 0,
      config: {
        name: 'Map',
        version: 1,
        engineVersion: '2.0.0',
        config: {},
        rules: [],
      },
    })),
    createMappingVersion: vi.fn(),
    listRevisions: vi.fn(async (): Promise<MappingRevision[]> => []),
    getRevision: vi.fn(),
    createVersion: vi.fn(),
    saveMappingVersion: vi.fn(),

    listProjects: vi.fn(async (): Promise<ProjectMetadata[]> => []),
    getProject: vi.fn(async (): Promise<ProjectDetail> => ({
      projectId: 'p-1',
      name: 'Project',
      description: '',
      slug: 'project',
      schemaRefs: [],
      linkedSchemaIds: [],
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      mappings: [],
    })),
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
    deployMapping: vi.fn(),
    promoteDeployment: vi.fn(),
    rollbackDeployment: vi.fn(),
    listDeployments: vi.fn(),
    getCurrentDeployments: vi.fn(),

    listCdmSchemas: vi.fn(),
    linkCdmSchema: vi.fn(),
    syncAllCdmSchemas: vi.fn(),
    syncCdmSchema: vi.fn(),
    listPublishedSchemas: vi.fn(),
    publishSchemaToGitHub: vi.fn(),
    linkPublishedSchema: vi.fn(),

    autoMap: vi.fn(),
    autoMapSection: vi.fn(),
    suggestExpression: vi.fn(),
    explainRule: vi.fn(),
    smartFix: vi.fn(),
    validateMappings: vi.fn(),

    querySchemaNodes: vi.fn(),
    listActivity: vi.fn(),
    previewOnServer: vi.fn(),

    listProjectValueTables: vi.fn(async (): Promise<ProjectValueTable[]> => [TABLE]),
    getProjectValueTable: vi.fn(async (): Promise<ProjectValueTable> => TABLE),
    getProjectValueTableRevision: vi.fn(async (): Promise<ProjectValueTableRevision> => REVISION),
    createProjectValueTable: vi.fn(async (): Promise<ProjectValueTable> => TABLE),
    createProjectValueTableRevision: vi.fn(async (): Promise<ProjectValueTableRevision> => REVISION),
    duplicateProjectValueTable: vi.fn(async (): Promise<ProjectValueTable> => ({ ...TABLE, id: 'vt-copy', key: 'order-status-copy', name: 'Order Status Codes (Copy)' })),
    archiveProjectValueTable: vi.fn(async (): Promise<ProjectValueTable> => ({ ...TABLE, status: 'archived' })),
    deleteProjectValueTable: vi.fn(async (): Promise<void> => undefined),
    listProjectValueTableUsage: vi.fn(async (): Promise<ValueTableUsageEntry[]> => USAGE),
    getProjectValueTableRevisionDiff: vi.fn(async (): Promise<ValueTableDiffPage> => ({
      summary: {
        valueTableId: 'vt-1',
        tableKey: 'order-status',
        fromRevision: 1,
        toRevision: 2,
        counts: { added: 0, removed: 0, changed: 1, unchanged: 1 },
        directionImpact: {
          previous: { aToB: false, bToA: true },
          next: { aToB: true, bToA: true },
        },
      },
      changes: [],
      pageSize: 100,
    })),
    exportProjectValueTableCsv: vi.fn(async (): Promise<string> => '"A","B"\n"x","y"'),
    importProjectValueTableCsv: vi.fn(async (): Promise<ProjectValueTableRevision> => REVISION),
    resolveProjectValueTableReference: vi.fn(async (): Promise<ResolveProjectValueTableReferenceResult> => ({
      ref: {
        scope: 'project',
        valueTableId: 'vt-1',
        tableKey: 'order-status',
        revision: 1,
        inputSideKey: 'oms-status',
        outputSideKey: 'cdm-status',
        inputType: 'string',
        outputType: 'string',
        resolvedEntries: [{ in: 'confirmed', out: 'OPEN', rowId: 'r1' }],
      },
    })),
    listGlobalValueMaps: vi.fn(async (): Promise<ProjectValueTable[]> => [{
      ...TABLE,
      id: 'gvm-1',
      projectId: 'global',
      key: 'global-order-status',
      name: 'Global Order Status',
      currentRevision: 2,
    }]),
    createGlobalValueMap: vi.fn(async (): Promise<ProjectValueTable> => ({
      ...TABLE,
      id: 'gvm-1',
      projectId: 'global',
      key: 'global-order-status',
      name: 'Global Order Status',
      currentRevision: 2,
    })),
    getGlobalValueMap: vi.fn(async (): Promise<ProjectValueTable> => ({
      ...TABLE,
      id: 'gvm-1',
      projectId: 'global',
      key: 'global-order-status',
      name: 'Global Order Status',
      currentRevision: 2,
    })),
    listGlobalValueMapRevisions: vi.fn(async (): Promise<ProjectValueTableRevision[]> => [
      { ...REVISION, valueTableId: 'gvm-1', revision: 2 },
      { ...REVISION, valueTableId: 'gvm-1', revision: 1 },
    ]),
    createGlobalValueMapRevision: vi.fn(async (): Promise<ProjectValueTableRevision> => ({ ...REVISION, valueTableId: 'gvm-1', revision: 3 })),
    getGlobalValueMapRevision: vi.fn(async (): Promise<ProjectValueTableRevision> => ({ ...REVISION, valueTableId: 'gvm-1' })),
    archiveGlobalValueMap: vi.fn(async (): Promise<ProjectValueTable> => ({ ...TABLE, id: 'gvm-1', status: 'archived' })),
    getGlobalValueMapUsage: vi.fn(async (): Promise<ValueMapUsageSummary> => VALUE_MAP_USAGE),

    listProjectValueMaps: vi.fn(async (): Promise<ProjectValueMapLinkSummary[]> => [LINK_SUMMARY]),
    linkProjectValueMap: vi.fn(async (): Promise<ProjectValueMapDetail> => LINK_DETAIL),
    getProjectValueMapDetail: vi.fn(async (): Promise<ProjectValueMapDetail> => LINK_DETAIL),
    updateProjectValueMapOverlay: vi.fn(async (): Promise<ProjectValueMapDetail> => ({
      ...LINK_DETAIL,
      overlayRevision: LINK_DETAIL.overlayRevision + 1,
    })),
    reviewProjectValueMapUpdate: vi.fn(async (): Promise<ReviewProjectValueMapUpdateResult> => REVIEW_BLOCKED),
    acceptProjectValueMapUpdate: vi.fn(async (): Promise<ProjectValueMapDetail> => ({
      ...LINK_DETAIL,
      pinnedRevision: 2,
      latestRevision: 2,
      updateAvailable: false,
      dependencyState: 'current',
    })),
    unlinkProjectValueMap: vi.fn(async (): Promise<void> => undefined),
    ...overrides,
  } as unknown as ApiAdapter;
}

function renderPage(adapter: ApiAdapter) {
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <AdapterProvider adapter={adapter}>
        <MemoryRouter initialEntries={['/projects/p-1/value-mappings']}>
          <Routes>
            <Route path="/projects/:projectId/value-mappings" element={<ProjectValueMappingsPage />} />
            <Route path="/projects/:projectId" element={<div data-testid="project-overview-page">Project overview</div>} />
          </Routes>
        </MemoryRouter>
      </AdapterProvider>
    </QueryClientProvider>,
  );
}

describe('ProjectValueMappingsPage', () => {
  it('renders route shell and list/detail content', async () => {
    const adapter = createMockAdapter();
    renderPage(adapter);

    expect(screen.getByTestId('page-project-value-mappings')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Value Mappings' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('value-table-list')).toBeInTheDocument();
    });

    expect(screen.getByTestId('value-table-details')).toBeInTheDocument();
    expect(screen.getByTestId('value-table-direction-summary')).toBeInTheDocument();
    expect(screen.getByTestId('value-table-rows-grid')).toBeInTheDocument();
    expect(screen.getByTestId('value-table-usage')).toBeInTheDocument();
  });

  it('shows delete guard when table is referenced', async () => {
    const adapter = createMockAdapter();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('value-table-delete-guard')).toBeInTheDocument();
    });

    expect(screen.getByTestId('value-table-delete-action')).toBeDisabled();
  });

  it('opens editor and supports save flow for create table', async () => {
    const createProjectValueTable = vi.fn(async (): Promise<ProjectValueTable> => TABLE);
    const adapter = createMockAdapter({
      listProjectValueTables: vi.fn(async (): Promise<ProjectValueTable[]> => []),
      listProjectValueTableUsage: vi.fn(async (): Promise<ValueTableUsageEntry[]> => []),
      createProjectValueTable,
    });

    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Project-only Map' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Create Project-only Map' }));

    expect(screen.getByTestId('value-table-editor-dialog')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Table name'));
    await user.type(screen.getByLabelText('Table name'), 'New Table');
    await user.clear(screen.getByLabelText('Side A name'));
    await user.type(screen.getByLabelText('Side A name'), 'OMS Status');
    await user.clear(screen.getByLabelText('Side B name'));
    await user.type(screen.getByLabelText('Side B name'), 'CDM Status');
    await user.click(screen.getByRole('button', { name: 'Add row' }));

    const rowsRegion = screen.getByTestId('value-table-editor-rows');
    const firstSideAInput = within(rowsRegion).getAllByLabelText(/side A value/i)[0];
    const firstSideBInput = within(rowsRegion).getAllByLabelText(/side B value/i)[0];
    await user.clear(firstSideAInput);
    await user.type(firstSideAInput, 'confirmed');
    await user.clear(firstSideBInput);
    await user.type(firstSideBInput, 'OPEN');

    await user.click(screen.getByTestId('value-table-editor-save'));

    await waitFor(() => {
      expect(createProjectValueTable).toHaveBeenCalled();
    });

    expect(createProjectValueTable).toHaveBeenCalledWith(expect.objectContaining({
      key: 'new-table',
      name: 'New Table',
      sideA: expect.objectContaining({ key: 'oms-status', label: 'OMS Status' }),
      sideB: expect.objectContaining({ key: 'cdm-status', label: 'CDM Status' }),
    }));
  });

  it('opens editor from selected table for revision save flow', async () => {
    const createRevision = vi.fn(async (): Promise<ProjectValueTableRevision> => REVISION);
    const adapter = createMockAdapter({
      createProjectValueTableRevision: createRevision,
    });

    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('value-table-edit-action')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('value-table-edit-action'));
    expect(screen.getByTestId('value-table-editor-dialog')).toBeInTheDocument();

    const initialCreateCalls = createRevision.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'Add row' }));
    await user.click(screen.getByTestId('value-table-editor-save'));

    await waitFor(() => {
      expect(createRevision.mock.calls.length).toBeGreaterThan(initialCreateCalls);
    });

    await waitFor(() => {
      expect(createRevision).toHaveBeenCalled();
    });
  });

  it('renders action controls for duplicate/archive/export and usage section', async () => {
    const adapter = createMockAdapter();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('value-table-duplicate-action')).toBeInTheDocument();
    });

    expect(screen.getByTestId('value-table-export-action')).toBeInTheDocument();
    expect(screen.getByTestId('value-table-archive-action')).toBeInTheDocument();
    expect(screen.getByTestId('value-table-usage')).toBeInTheDocument();
  });

  it('navigates back to project overview', async () => {
    const adapter = createMockAdapter();
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back to Project' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Back to Project' }));

    expect(screen.getByTestId('project-overview-page')).toBeInTheDocument();
  });

  it('supports link global map modal flow', async () => {
    const linkProjectValueMap = vi.fn(async (): Promise<ProjectValueMapDetail> => LINK_DETAIL);
    const adapter = createMockAdapter({ linkProjectValueMap });
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Link Global Map' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Link Global Map' }));

    expect(screen.getByTestId('project-value-map-link-modal')).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText('Global value map selection'),
      'gvm-1',
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Global value map revision selection')).not.toBeDisabled();
    });

    await user.selectOptions(screen.getByLabelText('Global value map revision selection'), '2');
    await user.click(screen.getByTestId('project-value-map-link-modal-confirm'));

    await waitFor(() => {
      expect(linkProjectValueMap).toHaveBeenCalledWith('p-1', {
        valueMapId: 'gvm-1',
        revision: 2,
      });
    });
  });

  it('shows provenance filter and collision warning for add overlay', async () => {
    const adapter = createMockAdapter();
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-value-map-link-detail')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Overlay action'), 'add');
    await user.type(screen.getByLabelText('Overlay side A value'), 'confirmed');
    await user.type(screen.getByLabelText('Overlay side B value'), 'OPEN');

    expect(screen.getByTestId('project-value-map-overlay-collision-warning')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Provenance filter'), 'override');

    await waitFor(() => {
      const effectiveRows = screen.getByTestId('project-value-map-effective-rows');
      expect(within(effectiveRows).getByText('cancelled')).toBeInTheDocument();
      expect(within(effectiveRows).queryByText('confirmed')).not.toBeInTheDocument();
    });
  });

  it('blocks update acceptance when review has orphan conflicts', async () => {
    const acceptProjectValueMapUpdate = vi.fn(async (): Promise<ProjectValueMapDetail> => LINK_DETAIL);
    const adapter = createMockAdapter({ acceptProjectValueMapUpdate });
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-value-map-review-summary')).toBeInTheDocument();
    });

    expect(screen.getByTestId('project-value-map-accept-update')).toBeDisabled();
    expect(screen.getByTestId('project-value-map-review-conflicts')).toBeInTheDocument();
    expect(acceptProjectValueMapUpdate).not.toHaveBeenCalled();
  });

  it('shows unlink usage guard and disables unlink action when referenced', async () => {
    const adapter = createMockAdapter();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-value-map-unlink-usage-guard')).toBeInTheDocument();
    });

    expect(screen.getByTestId('project-value-map-unlink')).toBeDisabled();
  });
});
