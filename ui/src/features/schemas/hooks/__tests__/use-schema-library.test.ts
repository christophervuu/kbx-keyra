import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSchemaLibrary } from '../use-schema-library';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { ProjectDetail, SchemaMetadata } from '@/lib/types/domain';

function createStorageMock(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSchemaMeta(overrides: Partial<SchemaMetadata> = {}): SchemaMetadata {
  return {
    schemaId: 'schema-1',
    name: 'Schema One',
    format: 'json-schema',
    dataFormat: 'json',
    sourceKind: 'json_schema',
    fieldCount: 10,
    origin: 'uploaded',
    ownership: 'user',
    status: 'ready',
    syncStatus: 'sync-failed',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeProjectDetail(
  overrides: Partial<ProjectDetail> & { schemaIds?: string[] } = {},
): ProjectDetail {
  const { schemaIds = [], ...rest } = overrides;
  return {
    projectId: 'project-1',
    name: 'Project One',
    description: 'Desc',
    slug: 'project-one',
    tags: [],
    schemaRefs: schemaIds.map((id) => ({ schemaId: id, type: 'local' as const })),
    linkedSchemaIds: schemaIds,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    mappings: [],
    ...rest,
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
    updateSchema: vi.fn(),
    deleteSchema: vi.fn(),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
    getProject: vi.fn().mockResolvedValue(makeProjectDetail()),
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

function makeWrapper(adapter: ApiAdapter) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(AdapterProvider, { adapter }, children);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSchemaLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', createStorageMock());
  });

  it('starts in loading state', () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockReturnValue(new Promise(() => {})),
      listProjects: vi.fn().mockReturnValue(new Promise(() => {})),
    });

    const { result } = renderHook(() => useSchemaLibrary(), {
      wrapper: makeWrapper(adapter),
    });

    expect(result.current.status).toBe('loading');
    expect(result.current.items).toHaveLength(0);
    expect(result.current.filteredItems).toHaveLength(0);
  });

  it('transitions to success state with enriched items', async () => {
    const schema = makeSchemaMeta({ schemaId: 'schema-1', name: 'Schema One' });
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([schema]),
      listProjects: vi.fn().mockResolvedValue([{ projectId: 'project-1', name: 'Project One', description: '', slug: 'proj', updatedAt: '2026-01-01T00:00:00Z' }]),
      getProject: vi.fn().mockResolvedValue(makeProjectDetail({ projectId: 'project-1', name: 'Project One', schemaIds: ['schema-1'] })),
    });

    const { result } = renderHook(() => useSchemaLibrary(), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.totalCount).toBe(1);
    const item = result.current.items[0];
    expect(item.schemaId).toBe('schema-1');
    expect(item.name).toBe('Schema One');
    expect(item.displayFormat).toBe('JSON');
    expect(item.ownership).toBe('user');
    expect(item.dataFormat).toBe('JSON');
    expect(item.status).toBe('ready');
  });

  it('uses totalFieldCount as fallback when fieldCount is zero', async () => {
    const schemaWithLegacyCount = {
      ...makeSchemaMeta({ schemaId: 'schema-legacy-count', fieldCount: 0 }),
      totalFieldCount: 412,
    } as SchemaMetadata & { totalFieldCount: number };

    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([schemaWithLegacyCount]),
      listProjects: vi.fn().mockResolvedValue([]),
    });

    const { result } = renderHook(() => useSchemaLibrary(), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(result.current.items[0].fieldCount).toBe(412);
  });

  it('backfills fieldCount from schema detail content when list metadata is stale', async () => {
    const schemaWithStaleCount = makeSchemaMeta({ schemaId: 'schema-stale', fieldCount: 0 });
    const getSchema = vi.fn().mockResolvedValue({
      metadata: schemaWithStaleCount,
      content: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          age: { type: 'number' },
        },
      },
    });

    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([schemaWithStaleCount]),
      listProjects: vi.fn().mockResolvedValue([]),
      getSchema,
    });

    const { result } = renderHook(() => useSchemaLibrary(), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(getSchema).toHaveBeenCalledWith('schema-stale');
    expect(result.current.items[0].fieldCount).toBe(3);
  });

  it('does not backfill fieldCount for processing schemas', async () => {
    const processingSchema = makeSchemaMeta({ schemaId: 'schema-processing', fieldCount: 0, status: 'processing' });
    const getSchema = vi.fn();

    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([processingSchema]),
      listProjects: vi.fn().mockResolvedValue([]),
      getSchema,
    });

    const { result } = renderHook(() => useSchemaLibrary(), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(getSchema).not.toHaveBeenCalled();
    expect(result.current.items[0].fieldCount).toBe(0);
  });

  it('transitions to error state when adapter fails', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockRejectedValue(new Error('Network failure')),
      listProjects: vi.fn().mockRejectedValue(new Error('Network failure')),
    });

    const { result } = renderHook(() => useSchemaLibrary(), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Network failure');
  });

  it('retry re-fetches data after error', async () => {
    const failOnce = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValue([]);

    const adapter = createMockAdapter({
      listSchemas: failOnce,
      listProjects: vi.fn().mockResolvedValue([]),
    });

    const { result } = renderHook(() => useSchemaLibrary(), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(failOnce).toHaveBeenCalledTimes(2);
  });

  describe('project usage count derivation', () => {
    it('counts projects referencing a schema', async () => {
      const schema = makeSchemaMeta({ schemaId: 'schema-1' });
      const projects = [
        { projectId: 'p1', name: 'Project 1', description: '', slug: 'p1', updatedAt: '2026-01-01T00:00:00Z' },
        { projectId: 'p2', name: 'Project 2', description: '', slug: 'p2', updatedAt: '2026-01-01T00:00:00Z' },
      ];

      const adapter = createMockAdapter({
        listSchemas: vi.fn().mockResolvedValue([schema]),
        listProjects: vi.fn().mockResolvedValue(projects),
        getProject: vi.fn()
          .mockResolvedValueOnce(makeProjectDetail({ projectId: 'p1', name: 'Project 1', schemaIds: ['schema-1'] }))
          .mockResolvedValueOnce(makeProjectDetail({ projectId: 'p2', name: 'Project 2', schemaIds: ['schema-1'] })),
      });

      const { result } = renderHook(() => useSchemaLibrary(), {
        wrapper: makeWrapper(adapter),
      });

      await waitFor(() => expect(result.current.status).toBe('success'));

      const item = result.current.items[0];
      expect(item.projectCount).toBe(2);
      expect(item.projectNames).toContain('Project 1');
      expect(item.projectNames).toContain('Project 2');
    });

    it('schema not referenced by any project has projectCount 0', async () => {
      const schema = makeSchemaMeta({ schemaId: 'schema-99' });

      const adapter = createMockAdapter({
        listSchemas: vi.fn().mockResolvedValue([schema]),
        listProjects: vi.fn().mockResolvedValue([
          { projectId: 'p1', name: 'Project 1', description: '', slug: 'p1', updatedAt: '2026-01-01T00:00:00Z' },
        ]),
        getProject: vi.fn().mockResolvedValue(
          makeProjectDetail({ projectId: 'p1', name: 'Project 1', schemaIds: ['other-schema'] }),
        ),
      });

      const { result } = renderHook(() => useSchemaLibrary(), {
        wrapper: makeWrapper(adapter),
      });

      await waitFor(() => expect(result.current.status).toBe('success'));
      expect(result.current.items[0].projectCount).toBe(0);
    });
  });

  describe('sync status derivation', () => {
    async function getStatus(schemaMeta: SchemaMetadata) {
      const adapter = createMockAdapter({
        listSchemas: vi.fn().mockResolvedValue([schemaMeta]),
        listProjects: vi.fn().mockResolvedValue([]),
      });
      const { result } = renderHook(() => useSchemaLibrary(), {
        wrapper: makeWrapper(adapter),
      });
      await waitFor(() => expect(result.current.status).toBe('success'));
      return result.current.items[0].syncStatus;
    }

    it('upload source → local', async () => {
      const s = makeSchemaMeta({ source: { type: 'upload' }, inferred: false });
      expect(await getStatus(s)).toBe('local');
    });

    it('github source uses backend sync status (synced)', async () => {
      const s = makeSchemaMeta({
        source: { type: 'github', repo: 'r', branch: 'main', path: '/x.json', commitSha: 'abc123' },
        inferred: false,
        syncStatus: 'synced',
      });
      expect(await getStatus(s)).toBe('synced');
    });

    it('github source without commitSha uses schema sync status from backend contract', async () => {
      const s = makeSchemaMeta({
        source: { type: 'github', repo: 'r', branch: 'main', path: '/x.json' },
        inferred: false,
        syncStatus: 'sync-failed',
      });
      expect(await getStatus(s)).toBe('sync-failed');
    });

    it('inferred schema → inferred (takes priority over source)', async () => {
      const s = makeSchemaMeta({
        inferred: true,
        source: { type: 'upload' },
      });
      expect(await getStatus(s)).toBe('inferred');
    });
  });

  describe('filter/sort state updates', () => {
    async function setupHook() {
      const schemas = [
        makeSchemaMeta({ schemaId: '1', name: 'Alpha', origin: 'uploaded', ownership: 'user', format: 'json-schema', dataFormat: 'json', status: 'ready' }),
        makeSchemaMeta({ schemaId: '2', name: 'Beta', origin: 'uploaded', ownership: 'user', format: 'xsd', dataFormat: 'xml', status: 'processing' }),
        makeSchemaMeta({ schemaId: '3', name: 'Gamma', origin: 'cdm', ownership: 'cdm', format: 'json-schema', dataFormat: 'json', status: 'error' }),
      ];

      const adapter = createMockAdapter({
        listSchemas: vi.fn().mockResolvedValue(schemas),
        listProjects: vi.fn().mockResolvedValue([]),
      });

      const renderResult = renderHook(() => useSchemaLibrary(), {
        wrapper: makeWrapper(adapter),
      });

      await waitFor(() => expect(renderResult.result.current.status).toBe('success'));
      return renderResult;
    }

    it('setSearch filters filteredItems', async () => {
      const { result } = await setupHook();

      act(() => {
        result.current.setSearch('alpha');
      });

      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].name).toBe('Alpha');
    });

    it('toggleOwnershipFilter adds and removes ownership', async () => {
      const { result } = await setupHook();

      act(() => {
        result.current.toggleOwnershipFilter('cdm');
      });
      expect(result.current.filters.ownerships).toContain('cdm');
      expect(result.current.filteredItems).toHaveLength(1);

      act(() => {
        result.current.toggleOwnershipFilter('cdm');
      });
      expect(result.current.filters.ownerships).not.toContain('cdm');
      expect(result.current.filteredItems).toHaveLength(3);
    });

    it('toggleDataFormatFilter filters by data format', async () => {
      const { result } = await setupHook();

      act(() => {
        result.current.toggleDataFormatFilter('XML');
      });

      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].schemaId).toBe('2');
    });

    it('toggleStatusFilter filters by status', async () => {
      const { result } = await setupHook();

      act(() => {
        result.current.toggleStatusFilter('ready');
      });

      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].schemaId).toBe('1');
    });

    it('clearFilters resets all filters', async () => {
      const { result } = await setupHook();

      act(() => {
        result.current.setSearch('alpha');
        result.current.toggleOwnershipFilter('user');
      });

      act(() => {
        result.current.clearFilters();
      });

      expect(result.current.filters.search).toBe('');
      expect(result.current.filters.ownerships).toHaveLength(0);
      expect(result.current.filteredItems).toHaveLength(3);
    });

    it('setSort toggles direction when same field selected again', async () => {
      const { result } = await setupHook();

      expect(result.current.sort).toEqual({ field: 'name', direction: 'asc' });

      act(() => {
        result.current.setSort('name');
      });

      expect(result.current.sort).toEqual({ field: 'name', direction: 'desc' });
    });

    it('setSort resets to asc when switching to a different field', async () => {
      const { result } = await setupHook();

      act(() => {
        result.current.setSort('fieldCount');
      });

      expect(result.current.sort).toEqual({ field: 'fieldCount', direction: 'asc' });
    });

    it('view mode defaults to card and persists to localStorage', async () => {
      const { result } = await setupHook();

      expect(result.current.viewMode).toBe('card');

      act(() => {
        result.current.setViewMode('list');
      });

      expect(result.current.viewMode).toBe('list');
      expect(localStorage.getItem('keyra.schemas.viewMode')).toBe('list');
    });

    it('setSort with explicit direction overrides toggle logic', async () => {
      const { result } = await setupHook();

      act(() => {
        result.current.setSort('name', 'desc');
      });

      expect(result.current.sort).toEqual({ field: 'name', direction: 'desc' });
    });
  });
});
