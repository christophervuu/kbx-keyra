import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { GlobalValueMappingsLibraryPage } from '../GlobalValueMappingsLibraryPage';

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

const MAPS: ProjectValueTable[] = [
  {
    id: 'vm-1',
    projectId: 'global',
    key: 'order-status',
    name: 'Order Status',
    description: 'Global order status mapping',
    sideA: { key: 'oms', label: 'OMS', type: 'string' },
    sideB: { key: 'cdm', label: 'CDM', type: 'string' },
    currentRevision: 3,
    currentRowCount: 3,
    defaultMatchMode: 'exact',
    status: 'active',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
  },
  {
    id: 'vm-2',
    projectId: 'global',
    key: 'payment-type',
    name: 'Payment Type',
    sideA: { key: 'src', label: 'Source', type: 'string' },
    sideB: { key: 'dst', label: 'Target', type: 'string' },
    currentRevision: 1,
    currentRowCount: 1,
    defaultMatchMode: 'ignore-case',
    status: 'archived',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
];

const EMPTY_USAGE: ValueMapUsageSummary = {
  mappings: [],
  linkedProjects: [],
  counts: { mappings: 0, linkedProjects: 0 },
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
    getProjectValueTable: vi.fn(async (): Promise<ProjectValueTable> => MAPS[0]),
    getProjectValueTableRevision: vi.fn(async (): Promise<ProjectValueTableRevision> => ({
      valueTableId: 'vm-1',
      revision: 3,
      sideA: { key: 'oms', label: 'OMS', type: 'string' },
      sideB: { key: 'cdm', label: 'CDM', type: 'string' },
      rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
      rowCount: 1,
      directionSupport: { aToB: true, bToA: true },
      createdAt: '2026-07-01T00:00:00.000Z',
    })),
    createProjectValueTable: vi.fn(async (): Promise<ProjectValueTable> => MAPS[0]),
    createProjectValueTableRevision: vi.fn(async (): Promise<ProjectValueTableRevision> => ({
      valueTableId: 'vm-1',
      revision: 4,
      sideA: { key: 'oms', label: 'OMS', type: 'string' },
      sideB: { key: 'cdm', label: 'CDM', type: 'string' },
      rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
      rowCount: 1,
      directionSupport: { aToB: true, bToA: true },
      createdAt: '2026-07-01T00:00:00.000Z',
    })),
    duplicateProjectValueTable: vi.fn(async (): Promise<ProjectValueTable> => MAPS[0]),
    archiveProjectValueTable: vi.fn(async (): Promise<ProjectValueTable> => ({ ...MAPS[0], status: 'archived' })),
    deleteProjectValueTable: vi.fn(async (): Promise<void> => undefined),
    listProjectValueTableUsage: vi.fn(async (): Promise<ValueTableUsageEntry[]> => []),
    getProjectValueTableRevisionDiff: vi.fn(async (): Promise<ValueTableDiffPage> => ({
      summary: {
        valueTableId: 'vm-1',
        tableKey: 'order-status',
        fromRevision: 2,
        toRevision: 3,
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
    importProjectValueTableCsv: vi.fn(async (): Promise<ProjectValueTableRevision> => ({
      valueTableId: 'vm-1',
      revision: 1,
      sideA: { key: 'oms', label: 'OMS', type: 'string' },
      sideB: { key: 'cdm', label: 'CDM', type: 'string' },
      rows: [],
      rowCount: 0,
      directionSupport: { aToB: true, bToA: true },
      createdAt: '2026-07-01T00:00:00.000Z',
    })),
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

    listGlobalValueMaps: vi.fn(async (): Promise<ProjectValueTable[]> => MAPS),
    createGlobalValueMap: vi.fn(async (): Promise<ProjectValueTable> => MAPS[0]),
    getGlobalValueMap: vi.fn(async (): Promise<ProjectValueTable> => MAPS[0]),
    listGlobalValueMapRevisions: vi.fn(async (): Promise<ProjectValueTableRevision[]> => []),
    createGlobalValueMapRevision: vi.fn(async (): Promise<ProjectValueTableRevision> => ({
      valueTableId: 'vm-1',
      revision: 4,
      sideA: { key: 'oms', label: 'OMS', type: 'string' },
      sideB: { key: 'cdm', label: 'CDM', type: 'string' },
      rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
      rowCount: 1,
      directionSupport: { aToB: true, bToA: true },
      createdAt: '2026-07-01T00:00:00.000Z',
    })),
    getGlobalValueMapRevision: vi.fn(async (): Promise<ProjectValueTableRevision> => ({
      valueTableId: 'vm-1',
      revision: 3,
      sideA: { key: 'oms', label: 'OMS', type: 'string' },
      sideB: { key: 'cdm', label: 'CDM', type: 'string' },
      rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
      rowCount: 1,
      directionSupport: { aToB: true, bToA: true },
      createdAt: '2026-07-01T00:00:00.000Z',
    })),
    archiveGlobalValueMap: vi.fn(async (): Promise<ProjectValueTable> => ({ ...MAPS[0], status: 'archived' })),
    getGlobalValueMapUsage: vi.fn(async (): Promise<ValueMapUsageSummary> => EMPTY_USAGE),
    ...overrides,
  } as unknown as ApiAdapter;
}

function renderPage(adapter: ApiAdapter) {
  return render(
    <AdapterProvider adapter={adapter}>
      <MemoryRouter initialEntries={['/value-mappings']}>
        <Routes>
          <Route path="/value-mappings" element={<GlobalValueMappingsLibraryPage />} />
          <Route path="/value-mappings/:valueMapId" element={<div data-testid="global-map-detail-stub" />} />
        </Routes>
      </MemoryRouter>
    </AdapterProvider>,
  );
}

describe('GlobalValueMappingsLibraryPage', () => {
  it('renders list with required metadata columns', async () => {
    const adapter = createMockAdapter();
    renderPage(adapter);

    expect(screen.getByTestId('page-global-value-mappings-library')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('global-value-maps-table')).toBeInTheDocument();
    });

    const table = screen.getByTestId('global-value-maps-table');
    expect(within(table).getByText('Name')).toBeInTheDocument();
    expect(within(table).getByText('Revision')).toBeInTheDocument();
    expect(within(table).getByText('Rows')).toBeInTheDocument();
    expect(within(table).getByText('Match mode')).toBeInTheDocument();
    expect(within(table).getByText('Project usage')).toBeInTheDocument();
    expect(within(table).getByText('Mapping usage')).toBeInTheDocument();
    expect(within(table).getByText('Updated')).toBeInTheDocument();
    expect(within(table).getByText('Status')).toBeInTheDocument();
  });

  it('supports filter and sort controls and calls list API', async () => {
    const listGlobalValueMaps = vi.fn(async (): Promise<ProjectValueTable[]> => MAPS);
    const adapter = createMockAdapter({ listGlobalValueMaps });
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('global-value-maps-table')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Search global value mappings'), 'order');
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'active');
    await user.selectOptions(screen.getByLabelText('Sort global value mappings'), 'name:asc');

    await waitFor(() => {
      expect(listGlobalValueMaps).toHaveBeenCalled();
    });
  });

  it('supports create flow from modal', async () => {
    const createGlobalValueMap = vi.fn(async (): Promise<ProjectValueTable> => MAPS[0]);
    const adapter = createMockAdapter({
      listGlobalValueMaps: vi.fn(async (): Promise<ProjectValueTable[]> => []),
      createGlobalValueMap,
    });
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Value Mapping' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Create Value Mapping' }));
    expect(screen.getByTestId('global-value-map-editor-dialog')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Value mapping name'), 'Shipping Status');
    await user.type(screen.getByLabelText('Global side A name'), 'Source');
    await user.type(screen.getByLabelText('Global side B name'), 'Target');
    await user.click(screen.getByRole('button', { name: 'Add row' }));

    const rowsSection = screen.getByTestId('global-value-map-editor-rows');
    const sideAInput = within(rowsSection).getAllByLabelText(/side A/i)[0];
    const sideBInput = within(rowsSection).getAllByLabelText(/side B/i)[0];
    await user.type(sideAInput, 'PENDING');
    await user.type(sideBInput, 'OPEN');

    await user.click(screen.getByTestId('global-value-map-editor-save'));

    await waitFor(() => {
      expect(createGlobalValueMap).toHaveBeenCalled();
    });
  });

  it('supports archive and duplicate actions', async () => {
    const archiveGlobalValueMap = vi.fn(async (): Promise<ProjectValueTable> => ({ ...MAPS[0], status: 'archived' }));
    const createGlobalValueMap = vi.fn(async (): Promise<ProjectValueTable> => ({ ...MAPS[0], id: 'vm-copy' }));
    const getGlobalValueMapRevision = vi.fn(async (): Promise<ProjectValueTableRevision> => ({
      valueTableId: 'vm-1',
      revision: 3,
      sideA: { key: 'oms', label: 'OMS', type: 'string' },
      sideB: { key: 'cdm', label: 'CDM', type: 'string' },
      rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
      rowCount: 1,
      directionSupport: { aToB: true, bToA: true },
      createdAt: '2026-07-01T00:00:00.000Z',
    }));
    const adapter = createMockAdapter({ archiveGlobalValueMap, createGlobalValueMap, getGlobalValueMapRevision });
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('global-value-maps-table')).toBeInTheDocument();
    });

    const duplicateButtons = screen.getAllByRole('button', { name: 'Duplicate' });
    await user.click(duplicateButtons[0]);
    await waitFor(() => {
      expect(createGlobalValueMap).toHaveBeenCalled();
    });

    const archiveButtons = screen.getAllByRole('button', { name: 'Archive' });
    await user.click(archiveButtons[0]);
    await waitFor(() => {
      expect(archiveGlobalValueMap).toHaveBeenCalled();
    });
  });
});
