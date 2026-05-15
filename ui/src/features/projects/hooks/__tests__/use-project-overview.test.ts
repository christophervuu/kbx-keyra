import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useProjectOverview } from '../use-project-overview';

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
  projectId: 'project-1',
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
  projectId: 'project-1',
  name: 'Project One',
  description: 'A test project',
  slug: 'project-one',
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
    createProject: vi.fn(),
    updateProject: vi.fn().mockResolvedValue({ ...PROJECT_DETAIL }),
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
    explainRule: vi.fn(),
    smartFix: vi.fn(),
    validateMappings: vi.fn(),
    querySchemaNodes: vi.fn(),
    listActivity: vi.fn(),
    previewOnServer: vi.fn(),
    ...overrides,
  } as ApiAdapter;
}

function makeWrapper(adapter: ApiAdapter) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(AdapterProvider, { adapter }, children);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useProjectOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transitions to loaded state with project, schemas, and mappings', async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() => useProjectOverview('project-1'), {
      wrapper: makeWrapper(adapter),
    });

    expect(result.current.loadState).toBe('loading');

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    expect(result.current.project).not.toBeNull();
    expect(result.current.project?.name).toBe('Project One');
    expect(result.current.schemas).toHaveLength(1);
    expect(result.current.schemas[0].name).toBe('Schema One');
    expect(result.current.mappings).toHaveLength(1);
    expect(result.current.mappings[0].name).toBe('Mapping One');
    expect(result.current.mappings[0].sourceSchemaName).toBe('Schema One');
    expect(result.current.mappings[0].devDeploy).toBe('not-deployed');
  });

  it('transitions to not-found state when project throws a not found error', async () => {
    const adapter = createMockAdapter({
      getProject: vi.fn().mockRejectedValue(new Error('not found')),
    });

    const { result } = renderHook(() => useProjectOverview('bad-id'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('not-found'));
    expect(result.current.project).toBeNull();
  });

  it('transitions to error state on generic error', async () => {
    const adapter = createMockAdapter({
      getProject: vi.fn().mockRejectedValue(new Error('network timeout')),
    });

    const { result } = renderHook(() => useProjectOverview('project-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('error'));
  });

  it('updateName calls adapter and updates local project name', async () => {
    const adapter = createMockAdapter({
      updateProject: vi.fn().mockResolvedValue({ ...PROJECT_DETAIL, name: 'New Name' }),
    });

    const { result } = renderHook(() => useProjectOverview('project-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    await act(async () => {
      await result.current.updateName('New Name');
    });

    expect(adapter.updateProject).toHaveBeenCalledWith('project-1', { name: 'New Name' });
    expect(result.current.project?.name).toBe('New Name');
  });

  it('optimistically updates name immediately before mutation resolves', async () => {
    let resolveUpdate!: (value: ProjectDetail) => void;
    const adapter = createMockAdapter({
      updateProject: vi.fn().mockImplementation(
        () =>
          new Promise<ProjectDetail>((resolve) => {
            resolveUpdate = resolve;
          }),
      ),
    });

    const { result } = renderHook(() => useProjectOverview('project-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    expect(result.current.project?.name).toBe('Project One');

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.updateName('Optimistic Name');
    });

    // Optimistic value is visible immediately.
    expect(result.current.project?.name).toBe('Optimistic Name');

    await act(async () => {
      resolveUpdate({ ...PROJECT_DETAIL, name: 'Optimistic Name' });
      await pending;
    });

    expect(result.current.project?.name).toBe('Optimistic Name');
  });

  it('rolls back name on failed update and surfaces mutationError', async () => {
    const adapter = createMockAdapter({
      updateProject: vi.fn().mockRejectedValue(new Error('Update failed')),
    });

    const { result } = renderHook(() => useProjectOverview('project-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    expect(result.current.project?.name).toBe('Project One');

    await act(async () => {
      await expect(result.current.updateName('Bad Name')).rejects.toMatchObject({
        message: 'Update failed',
      });
    });

    // Rolled back to snapshot
    expect(result.current.project?.name).toBe('Project One');
    // Error surfaced for UI error banner composition
    expect(result.current.mutationError?.message).toBe('Update failed');

    act(() => {
      result.current.clearMutationError();
    });
    expect(result.current.mutationError).toBeNull();
  });

  it('removeSchema removes from schemaRefs and calls adapter', async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useProjectOverview('project-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    expect(result.current.schemas).toHaveLength(1);

    await act(async () => {
      await result.current.removeSchema('schema-1');
    });

    expect(adapter.updateProject).toHaveBeenCalledWith('project-1', { schemaRefs: [] });
    expect(result.current.schemas).toHaveLength(0);
  });

  it('deleteMappingAction removes mapping from list', async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useProjectOverview('project-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    expect(result.current.mappings).toHaveLength(1);

    await act(async () => {
      await result.current.deleteMappingAction('mapping-1');
    });

    expect(adapter.deleteMapping).toHaveBeenCalledWith('mapping-1');
    expect(result.current.mappings).toHaveLength(0);
  });

  it('duplicateMappingAction adds a copy to the mappings list', async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useProjectOverview('project-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    expect(result.current.mappings).toHaveLength(1);

    await act(async () => {
      await result.current.duplicateMappingAction('mapping-1');
    });

    expect(adapter.duplicateMapping).toHaveBeenCalledWith('mapping-1', 'Mapping One (Copy)');
    expect(result.current.mappings).toHaveLength(2);
    expect(result.current.mappings[1].name).toBe('Mapping One (Copy)');
  });

  it('deleteProjectAction deletes all mappings then the project', async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useProjectOverview('project-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    await act(async () => {
      await result.current.deleteProjectAction();
    });

    expect(adapter.deleteMapping).toHaveBeenCalledWith('mapping-1');
    expect(adapter.deleteProject).toHaveBeenCalledWith('project-1');
  });

  it('retry re-fetches the project', async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useProjectOverview('project-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    expect(adapter.getProject).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    expect(adapter.getProject).toHaveBeenCalledTimes(2);
  });

  it('schemasReferencingMapping returns mapping names using that schema', async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useProjectOverview('project-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.loadState).toBe('loaded'));

    const names = result.current.schemasReferencingMapping('schema-1');
    expect(names).toEqual(['Mapping One']);

    const none = result.current.schemasReferencingMapping('schema-999');
    expect(none).toEqual([]);
  });
});
