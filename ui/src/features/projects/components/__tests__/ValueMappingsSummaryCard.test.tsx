import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ValueMappingsSummaryCard } from '../ValueMappingsSummaryCard';

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
  ValueTableDiffPage,
  ValueTableUsageEntry,
} from '@/lib/types';

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  const projectTable: ProjectValueTable = {
    id: 'vt-1',
    projectId: 'p-1',
    key: 'order-status',
    name: 'Order Status',
    sideA: { key: 'a', label: 'A', type: 'string' },
    sideB: { key: 'b', label: 'B', type: 'string' },
    currentRevision: 1,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const projectValueTableRevision: ProjectValueTableRevision = {
    valueTableId: 'vt-1',
    revision: 1,
    sideA: { key: 'a', label: 'A', type: 'string' },
    sideB: { key: 'b', label: 'B', type: 'string' },
    rows: [{ id: 'r1', sideAValue: 'x', sideBValue: 'y' }],
    rowCount: 1,
    directionSupport: { aToB: true, bToA: true },
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const valueTableUsageEntry: ValueTableUsageEntry = {
    valueTableId: 'vt-1',
    tableKey: 'order-status',
    mappingId: 'm-1',
    mappingName: 'Mapping 1',
    pinnedRevision: 1,
    direction: 'a_to_b',
    inputSideKey: 'a',
    outputSideKey: 'b',
    newerRevisionAvailable: false,
    latestRevision: 1,
  };

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

    listProjectValueTables: vi.fn(async (): Promise<ProjectValueTable[]> => [projectTable]),
    getProjectValueTable: vi.fn(async (): Promise<ProjectValueTable> => projectTable),
    getProjectValueTableRevision: vi.fn(async (): Promise<ProjectValueTableRevision> => projectValueTableRevision),
    createProjectValueTable: vi.fn(),
    createProjectValueTableRevision: vi.fn(),
    duplicateProjectValueTable: vi.fn(),
    archiveProjectValueTable: vi.fn(),
    deleteProjectValueTable: vi.fn(),
    listProjectValueTableUsage: vi.fn(async (): Promise<ValueTableUsageEntry[]> => [valueTableUsageEntry]),
    getProjectValueTableRevisionDiff: vi.fn(async (): Promise<ValueTableDiffPage> => ({
      summary: {
        valueTableId: 'vt-1',
        tableKey: 'order-status',
        fromRevision: 1,
        toRevision: 2,
        counts: { added: 0, removed: 0, changed: 0, unchanged: 0 },
        directionImpact: {
          previous: { aToB: true, bToA: true },
          next: { aToB: true, bToA: true },
        },
      },
      changes: [],
      pageSize: 100,
    })),
    exportProjectValueTableCsv: vi.fn(async (): Promise<string> => ''),
    importProjectValueTableCsv: vi.fn(async (): Promise<ProjectValueTableRevision> => projectValueTableRevision),
    resolveProjectValueTableReference: vi.fn(async (): Promise<ResolveProjectValueTableReferenceResult> => ({
      ref: {
        scope: 'project',
        valueTableId: 'vt-1',
        tableKey: 'order-status',
        revision: 1,
        inputSideKey: 'a',
        outputSideKey: 'b',
        inputType: 'string',
        outputType: 'string',
        resolvedEntries: [{ in: 'x', out: 'y', rowId: 'r1' }],
      },
    })),
    ...overrides,
  } as unknown as ApiAdapter;
}

function renderCard(adapter: ApiAdapter) {
  return render(
    <AdapterProvider adapter={adapter}>
      <MemoryRouter initialEntries={['/projects/p-1']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ValueMappingsSummaryCard projectId="p-1" />} />
          <Route path="/projects/:projectId/value-mappings" element={<div data-testid="value-mappings-page">Value mappings page</div>} />
        </Routes>
      </MemoryRouter>
    </AdapterProvider>,
  );
}

describe('ValueMappingsSummaryCard', () => {
  it('renders loaded summary counts and manage action', async () => {
    const adapter = createMockAdapter();
    renderCard(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-value-mappings-summary-loaded')).toBeInTheDocument();
    });

    expect(screen.getByTestId('value-mappings-active-count')).toHaveTextContent('1');
    expect(screen.getByTestId('value-mappings-usage-count')).toHaveTextContent('1');
    expect(screen.getByTestId('value-mappings-manage-action')).toBeInTheDocument();
  });

  it('renders empty guidance when there are no active value tables', async () => {
    const adapter = createMockAdapter({
      listProjectValueTables: vi.fn(async (): Promise<ProjectValueTable[]> => []),
      listProjectValueTableUsage: vi.fn(async (): Promise<ValueTableUsageEntry[]> => []),
    });

    renderCard(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-value-mappings-summary-loaded')).toBeInTheDocument();
    });

    expect(screen.getByTestId('value-mappings-active-count')).toHaveTextContent('0');
    expect(screen.getByTestId('value-mappings-empty-guidance')).toBeInTheDocument();
  });

  it('navigates to value-mappings route from manage action', async () => {
    const adapter = createMockAdapter();
    const user = userEvent.setup();

    renderCard(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('value-mappings-manage-action')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('value-mappings-manage-action'));

    expect(screen.getByTestId('value-mappings-page')).toBeInTheDocument();
  });

  it('renders retry state on failure', async () => {
    const adapter = createMockAdapter({
      listProjectValueTables: vi.fn(async () => {
        throw new Error('boom');
      }),
    });

    renderCard(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('project-value-mappings-summary-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Failed to load value mappings summary.')).toBeInTheDocument();
  });
});
