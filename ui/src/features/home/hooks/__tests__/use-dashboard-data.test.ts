import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { MappingMetadata, ProjectMetadata, SchemaMetadata } from '@/lib/types/domain';

import { deriveWorstStatus, useDashboardData } from '../use-dashboard-data';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMappingMeta(overrides: Partial<MappingMetadata> = {}): MappingMetadata {
  return {
    mappingId: 'mapping-1',
    projectId: 'project-1',
    name: 'Mapping One',
    version: 1,
    status: 'ready',
    ruleCount: 2,
    coverage: 1,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeProjectMeta(overrides: Partial<ProjectMetadata> = {}): ProjectMetadata {
  return {
    projectId: 'project-1',
    name: 'Project One',
    description: 'Desc',
    slug: 'project-one',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeSchemaMetadata(id: string): SchemaMetadata {
  return {
    schemaId: id,
    name: `Schema ${id}`,
    format: 'json-schema',
    fieldCount: 10,
    origin: 'local',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listProjects: vi.fn().mockResolvedValue([]),
    listSchemas: vi.fn().mockResolvedValue([]),
    listMappings: vi.fn().mockResolvedValue([]),
    getSchema: vi.fn(),
    createSchema: vi.fn(),
    deleteSchema: vi.fn(),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
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
    getCurrentDeployments: vi.fn().mockResolvedValue(null),
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

function makeWrapper(adapter: ApiAdapter) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(AdapterProvider, { adapter }, children);
  };
}

// ---------------------------------------------------------------------------
// deriveWorstStatus — pure unit tests
// ---------------------------------------------------------------------------

describe('deriveWorstStatus', () => {
  it('returns no-mappings for empty array', () => {
    expect(deriveWorstStatus([])).toBe('no-mappings');
  });

  it('returns ready when all mappings are ready', () => {
    expect(deriveWorstStatus([makeMappingMeta({ status: 'ready' })])).toBe('ready');
  });

  it('returns draft when any mapping is draft (none has-errors)', () => {
    expect(
      deriveWorstStatus([
        makeMappingMeta({ status: 'ready' }),
        makeMappingMeta({ status: 'draft' }),
      ]),
    ).toBe('draft');
  });

  it('returns has-errors when any mapping has errors (highest severity wins)', () => {
    expect(
      deriveWorstStatus([
        makeMappingMeta({ status: 'draft' }),
        makeMappingMeta({ status: 'has-errors' }),
      ]),
    ).toBe('has-errors');
  });

  it('has-errors beats draft', () => {
    expect(
      deriveWorstStatus([
        makeMappingMeta({ status: 'has-errors' }),
        makeMappingMeta({ status: 'draft' }),
        makeMappingMeta({ status: 'ready' }),
      ]),
    ).toBe('has-errors');
  });
});

// ---------------------------------------------------------------------------
// useDashboardData — hook integration tests
// ---------------------------------------------------------------------------

describe('useDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in loading state', () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockReturnValue(new Promise(() => {})),
      listSchemas: vi.fn().mockReturnValue(new Promise(() => {})),
    });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: makeWrapper(adapter),
    });

    expect(result.current.loadState).toBe('loading');
    expect(result.current.metrics).toBeNull();
    expect(result.current.projects).toEqual([]);
  });

  it('loads and aggregates metrics for a single project with mappings', async () => {
    const project = makeProjectMeta();
    const mappings = [
      makeMappingMeta({ mappingId: 'm-1', status: 'ready' }),
      makeMappingMeta({ mappingId: 'm-2', status: 'draft' }),
    ];

    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([project]),
      listSchemas: vi.fn().mockResolvedValue([makeSchemaMetadata('s-1'), makeSchemaMetadata('s-2')]),
      listMappings: vi.fn().mockResolvedValue(mappings),
    });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    expect(result.current.metrics).toEqual({
      totalProjects: 1,
      totalMappings: 2,
      totalSchemas: 2,
      statusBreakdown: { ready: 1, draft: 1, hasErrors: 0 },
    });
    expect(result.current.schemaCount).toBe(2);
    expect(result.current.projects).toHaveLength(1);
    expect(result.current.projects[0].worstStatus).toBe('draft');
    expect(result.current.projects[0].mappingCount).toBe(2);
  });

  it('handles empty projects list — all metrics are zero', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([]),
      listSchemas: vi.fn().mockResolvedValue([]),
    });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    expect(result.current.metrics).toEqual({
      totalProjects: 0,
      totalMappings: 0,
      totalSchemas: 0,
      statusBreakdown: { ready: 0, draft: 0, hasErrors: 0 },
    });
    expect(result.current.projects).toEqual([]);
  });

  it('sets project worstStatus: has-errors when any mapping has errors', async () => {
    const project = makeProjectMeta();
    const mappings = [
      makeMappingMeta({ status: 'ready' }),
      makeMappingMeta({ status: 'has-errors' }),
    ];

    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([project]),
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings: vi.fn().mockResolvedValue(mappings),
    });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    expect(result.current.projects[0].worstStatus).toBe('has-errors');
  });

  it('sets project worstStatus: no-mappings when project has no mappings', async () => {
    const project = makeProjectMeta();

    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([project]),
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings: vi.fn().mockResolvedValue([]),
    });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    expect(result.current.projects[0].worstStatus).toBe('no-mappings');
    expect(result.current.projects[0].mappingCount).toBe(0);
  });

  it('sets SANDBOX/DEV/PREPROD/PROD deploy badges to not-deployed', async () => {
    const project = makeProjectMeta();

    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([project]),
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings: vi.fn().mockResolvedValue([makeMappingMeta()]),
    });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    const p = result.current.projects[0];
    expect(p.sandboxDeploy).toBe('not-deployed');
    expect(p.devDeploy).toBe('not-deployed');
    expect(p.preprodDeploy).toBe('not-deployed');
    expect(p.prodDeploy).toBe('not-deployed');
  });

  it('sets loadState to error when adapter throws', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockRejectedValue(new Error('Network error')),
      listSchemas: vi.fn().mockResolvedValue([]),
    });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('error'));
    expect(result.current.metrics).toBeNull();
    expect(result.current.projects).toEqual([]);
  });

  it('retry re-executes all loads and recovers', async () => {
    const project = makeProjectMeta();

    const listProjects = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue([project]);

    const adapter = createMockAdapter({
      listProjects,
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings: vi.fn().mockResolvedValue([]),
    });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: makeWrapper(adapter),
    });

    // First attempt fails
    await waitFor(() => expect(result.current.loadState).toBe('error'));

    // Retry
    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    expect(result.current.projects).toHaveLength(1);
    expect(listProjects).toHaveBeenCalledTimes(2);
  });

  it('correctly aggregates statusBreakdown across multiple projects', async () => {
    const projects = [
      makeProjectMeta({ projectId: 'p-1' }),
      makeProjectMeta({ projectId: 'p-2' }),
    ];

    const listMappings = vi
      .fn()
      .mockResolvedValueOnce([
        makeMappingMeta({ mappingId: 'm-1', status: 'ready' }),
        makeMappingMeta({ mappingId: 'm-2', status: 'has-errors' }),
      ])
      .mockResolvedValueOnce([
        makeMappingMeta({ mappingId: 'm-3', status: 'draft' }),
        makeMappingMeta({ mappingId: 'm-4', status: 'ready' }),
        makeMappingMeta({ mappingId: 'm-5', status: 'ready' }),
      ]);

    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue(projects),
      listSchemas: vi.fn().mockResolvedValue([makeSchemaMetadata('s-1')]),
      listMappings,
    });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    expect(result.current.metrics).toMatchObject({
      totalProjects: 2,
      totalMappings: 5,
      totalSchemas: 1,
      statusBreakdown: { ready: 3, draft: 1, hasErrors: 1 },
    });
  });

  it('parallel loading calls listMappings for each project', async () => {
    const projects = [
      makeProjectMeta({ projectId: 'p-1' }),
      makeProjectMeta({ projectId: 'p-2' }),
      makeProjectMeta({ projectId: 'p-3' }),
    ];

    const listMappings = vi.fn().mockResolvedValue([]);

    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue(projects),
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings,
    });

    const { result } = renderHook(() => useDashboardData(), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    expect(listMappings).toHaveBeenCalledTimes(3);
    expect(listMappings).toHaveBeenCalledWith('p-1');
    expect(listMappings).toHaveBeenCalledWith('p-2');
    expect(listMappings).toHaveBeenCalledWith('p-3');
  });
});
