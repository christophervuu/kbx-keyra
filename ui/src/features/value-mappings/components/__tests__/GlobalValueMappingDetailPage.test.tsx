import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { GlobalValueMappingDetailPage } from '../GlobalValueMappingDetailPage';

import { AdapterProvider } from '@/lib/api';
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
  ProjectValueTable,
  ProjectValueTableRevision,
  ResolveProjectValueTableReferenceResult,
  SchemaDetail,
  SchemaMetadata,
  ValueMapUsageSummary,
  ValueTableDiffPage,
  ValueTableUsageEntry,
} from '@/lib/types';

const MAP: ProjectValueTable = {
  id: 'vm-1',
  projectId: 'global',
  key: 'order-status',
  name: 'Order Status',
  description: 'Global order status mapping',
  sideA: { key: 'oms', label: 'OMS', type: 'string' },
  sideB: { key: 'cdm', label: 'CDM', type: 'string' },
  currentRevision: 2,
  currentRowCount: 2,
  defaultMatchMode: 'exact',
  status: 'active',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
};

const REVISIONS: ProjectValueTableRevision[] = [
  {
    valueTableId: 'vm-1',
    revision: 2,
    sideA: { key: 'oms', label: 'OMS', type: 'string' },
    sideB: { key: 'cdm', label: 'CDM', type: 'string' },
    rows: [
      { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
      { id: 'r2', sideAValue: 'completed', sideBValue: 'DONE' },
    ],
    rowCount: 2,
    directionSupport: { aToB: true, bToA: true },
    createdAt: '2026-07-02T00:00:00.000Z',
  },
  {
    valueTableId: 'vm-1',
    revision: 1,
    sideA: { key: 'oms', label: 'OMS', type: 'string' },
    sideB: { key: 'cdm', label: 'CDM', type: 'string' },
    rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
    rowCount: 1,
    directionSupport: { aToB: true, bToA: true },
    createdAt: '2026-07-01T00:00:00.000Z',
  },
];

const USAGE: ValueMapUsageSummary = {
  mappings: [
    {
      valueTableId: 'vm-1',
      tableKey: 'order-status',
      mappingId: 'm-1',
      mappingName: 'Order Sync Mapping',
      pinnedRevision: 2,
      direction: 'a_to_b',
      inputSideKey: 'oms',
      outputSideKey: 'cdm',
      newerRevisionAvailable: false,
      latestRevision: 2,
    },
  ],
  linkedProjects: [{ projectId: 'p-1', projectName: 'Order Project' }],
  counts: { mappings: 1, linkedProjects: 1 },
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

    listProjectValueTables: vi.fn(async (): Promise<ProjectValueTable[]> => []),
    getProjectValueTable: vi.fn(async (): Promise<ProjectValueTable> => MAP),
    getProjectValueTableRevision: vi.fn(async (): Promise<ProjectValueTableRevision> => REVISIONS[0]),
    createProjectValueTable: vi.fn(async (): Promise<ProjectValueTable> => MAP),
    createProjectValueTableRevision: vi.fn(async (): Promise<ProjectValueTableRevision> => REVISIONS[0]),
    duplicateProjectValueTable: vi.fn(async (): Promise<ProjectValueTable> => MAP),
    archiveProjectValueTable: vi.fn(async (): Promise<ProjectValueTable> => MAP),
    deleteProjectValueTable: vi.fn(async (): Promise<void> => undefined),
    listProjectValueTableUsage: vi.fn(async (): Promise<ValueTableUsageEntry[]> => []),
    getProjectValueTableRevisionDiff: vi.fn(async (): Promise<ValueTableDiffPage> => ({
      summary: {
        valueTableId: 'vm-1',
        tableKey: 'order-status',
        fromRevision: 1,
        toRevision: 2,
        counts: { added: 1, removed: 0, changed: 1, unchanged: 0 },
        directionImpact: {
          previous: { aToB: true, bToA: true },
          next: { aToB: true, bToA: true },
        },
      },
      changes: [],
      pageSize: 100,
    })),
    exportProjectValueTableCsv: vi.fn(async (): Promise<string> => ''),
    importProjectValueTableCsv: vi.fn(async (): Promise<ProjectValueTableRevision> => REVISIONS[0]),
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

    listGlobalValueMaps: vi.fn(async (): Promise<ProjectValueTable[]> => [MAP]),
    createGlobalValueMap: vi.fn(async (): Promise<ProjectValueTable> => MAP),
    getGlobalValueMap: vi.fn(async (): Promise<ProjectValueTable> => MAP),
    listGlobalValueMapRevisions: vi.fn(async (): Promise<ProjectValueTableRevision[]> => REVISIONS),
    createGlobalValueMapRevision: vi.fn(async (): Promise<ProjectValueTableRevision> => ({ ...REVISIONS[0], revision: 3 })),
    getGlobalValueMapRevision: vi.fn(async (): Promise<ProjectValueTableRevision> => REVISIONS[0]),
    archiveGlobalValueMap: vi.fn(async (): Promise<ProjectValueTable> => ({ ...MAP, status: 'archived' })),
    getGlobalValueMapUsage: vi.fn(async (): Promise<ValueMapUsageSummary> => USAGE),
    ...overrides,
  } as unknown as ApiAdapter;
}

function renderPage(adapter: ApiAdapter) {
  return render(
    <AdapterProvider adapter={adapter}>
      <MemoryRouter initialEntries={['/value-mappings/vm-1']}>
        <Routes>
          <Route path="/value-mappings" element={<div data-testid="global-library-stub" />} />
          <Route path="/value-mappings/:valueMapId" element={<GlobalValueMappingDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AdapterProvider>,
  );
}

describe('GlobalValueMappingDetailPage', () => {
  it('renders detail with rows, revision history, and usage', async () => {
    const adapter = createMockAdapter();
    renderPage(adapter);

    expect(screen.getByTestId('page-global-value-mapping-detail')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('global-value-map-detail-layout')).toBeInTheDocument();
    });

    expect(screen.getByTestId('global-value-map-rows-grid')).toBeInTheDocument();
    expect(screen.getByTestId('global-value-map-revision-history')).toBeInTheDocument();
    expect(screen.getByTestId('global-value-map-usage')).toBeInTheDocument();
  });

  it('allows selecting historical immutable revision from history list', async () => {
    const adapter = createMockAdapter();
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('global-value-map-revision-history')).toBeInTheDocument();
    });

    const history = screen.getByTestId('global-value-map-revision-history');
    await user.click(within(history).getByRole('button', { name: /Revision r1/i }));

    expect(within(history).getByRole('button', { name: /Revision r1/i })).toBeInTheDocument();
  });

  it('supports create new revision flow', async () => {
    const createGlobalValueMapRevision = vi.fn(async (): Promise<ProjectValueTableRevision> => ({
      ...REVISIONS[0],
      revision: 3,
    }));
    const adapter = createMockAdapter({ createGlobalValueMapRevision });
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create New Revision' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Create New Revision' }));
    expect(screen.getByTestId('global-value-map-revision-editor-dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add row' }));
    const rowsSection = screen.getByTestId('global-value-map-revision-editor-rows');
    const sideAInputs = within(rowsSection).getAllByLabelText(/side A/i);
    const sideBInputs = within(rowsSection).getAllByLabelText(/side B/i);
    await user.type(sideAInputs[sideAInputs.length - 1], 'cancelled');
    await user.type(sideBInputs[sideBInputs.length - 1], 'VOID');

    await user.click(screen.getByTestId('global-value-map-revision-editor-save'));

    await waitFor(() => {
      expect(createGlobalValueMapRevision).toHaveBeenCalled();
    });
  });

  it('supports archive action', async () => {
    const archiveGlobalValueMap = vi.fn(async (): Promise<ProjectValueTable> => ({ ...MAP, status: 'archived' }));
    const adapter = createMockAdapter({ archiveGlobalValueMap });
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => {
      expect(archiveGlobalValueMap).toHaveBeenCalled();
    });
  });
});
