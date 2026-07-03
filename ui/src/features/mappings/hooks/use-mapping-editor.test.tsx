import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { useMappingEditor } from './use-mapping-editor';

import { AdapterProvider, createQueryClient } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import type { MappingConfig, MappingConfigOptions, SchemaDetail } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_CONFIG: MappingConfig = {
  id: 'mapping-1',
  projectId: 'project-1',
  name: 'Test Mapping',
  version: 3,
  engineVersion: '1.0.0',
  sourceSchemaRef: { schemaId: 'source-schema-1', type: 'local' },
  targetSchemaRef: { schemaId: 'target-schema-1', type: 'local' },
  config: { unmappedTargets: 'omit' },
  rules: [
    { target: 'A.B', type: 'string', expression: 'source("x")' },
    { target: 'A.C', type: 'number', expression: 'source("y")' },
  ],
};

const MOCK_SOURCE_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'source-schema-1',
    name: 'Source Schema',
    format: 'json-schema',
    fieldCount: 5,
    origin: 'local',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  content: {
    type: 'object',
    properties: {
      x: { type: 'string' },
      y: { type: 'number' },
    },
  },
};

const MOCK_TARGET_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'target-schema-1',
    name: 'Target Schema',
    format: 'json-schema',
    fieldCount: 3,
    origin: 'local',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  content: {
    type: 'object',
    properties: {
      A: {
        type: 'object',
        properties: {
          B: { type: 'string' },
          C: { type: 'number' },
        },
      },
    },
  },
};

const MOCK_INFERRED_SOURCE_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'source-schema-1',
    name: 'Inferred Source Schema',
    format: 'json-schema',
    fieldCount: 2,
    origin: 'local',
    status: 'ready',
    inferred: true,
    source: { type: 'upload' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  content: JSON.stringify({ x: 'abc', y: 123 }),
};

const MOCK_INFERRED_TARGET_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'target-schema-1',
    name: 'Inferred Target Schema',
    format: 'json-schema',
    fieldCount: 3,
    origin: 'local',
    status: 'ready',
    inferred: true,
    source: { type: 'upload' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  content: JSON.stringify({ A: { B: 'text', C: 123 } }),
};

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides?: Partial<ApiAdapter>): ApiAdapter {
  return {
    listSchemas: vi.fn(),
    getSchema: vi.fn().mockImplementation((id: string) => {
      if (id === 'source-schema-1') return Promise.resolve(MOCK_SOURCE_SCHEMA);
      if (id === 'target-schema-1') return Promise.resolve(MOCK_TARGET_SCHEMA);
      return Promise.reject(new Error(`Schema ${id} not found`));
    }),
    createSchema: vi.fn(),
    deleteSchema: vi.fn(),
    listMappings: vi.fn(),
    getMapping: vi.fn().mockResolvedValue(MOCK_CONFIG),
    createMapping: vi.fn(),
    updateMapping: vi.fn().mockResolvedValue({ mappingId: 'mapping-1', projectId: 'project-1', name: 'Test Mapping', version: 4, status: 'draft', sourceSchemaId: 'source-schema-1', targetSchemaId: 'target-schema-1', ruleCount: 2, coverage: 100, updatedAt: '2024-01-01T00:00:00Z' }),
    saveMapping: vi.fn().mockResolvedValue({ revision: 4, noChange: false }),
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
    deployMapping: vi.fn(),
    promoteDeployment: vi.fn(),
    rollbackDeployment: vi.fn(),
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
    listMappingVersions: vi.fn().mockResolvedValue([]),
    getMappingVersion: vi.fn(),
    saveMappingVersion: vi.fn().mockResolvedValue(undefined),
    listVersions: vi.fn().mockResolvedValue([]),
    getVersion: vi.fn(),
    listRevisions: vi.fn().mockResolvedValue([]),
    getRevision: vi.fn(),
    createVersion: vi.fn().mockResolvedValue({ version: 1, revisionNumber: 4, createdAt: '2024-01-01T00:00:00Z', createdBy: 'You' }),
    createMappingVersion: vi.fn().mockResolvedValue({ version: 1, revisionNumber: 4, createdAt: '2024-01-01T00:00:00Z', createdBy: 'You' }),
    getMappingRevision: vi.fn(),
    listMappingRevisions: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as ApiAdapter;
}

function createWrapper(adapter: ApiAdapter) {
  const queryClient = createQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AdapterProvider adapter={adapter}>{children}</AdapterProvider>
      </QueryClientProvider>
    );
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMappingEditor', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  describe('Loading', () => {
    it('starts in loading state', () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      expect(result.current.loadState).toBe('loading');
    });

    it('loads config on mount and transitions to loaded', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      expect(adapter.getMapping).toHaveBeenCalledWith('mapping-1');
      expect(result.current.mappingName).toBe('Test Mapping');
      expect(result.current.version).toBe(3);
      expect(result.current.rules).toEqual(MOCK_CONFIG.rules);
    });

    it('loads schemas after config loads', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      expect(adapter.getSchema).toHaveBeenCalledWith('source-schema-1');
      expect(adapter.getSchema).toHaveBeenCalledWith('target-schema-1');
      expect(result.current.schemasLoaded).toBe(true);
      expect(result.current.sourceSchemaName).toBe('Source Schema');
      expect(result.current.targetSchemaName).toBe('Target Schema');
    });

    it('parses schemas for UI tree display', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      expect(result.current.parsedSourceSchema).not.toBeNull();
      expect(result.current.parsedSourceSchema?.format).toBe('json-schema');
      expect(result.current.parsedTargetSchema).not.toBeNull();
    });

    it('parses inferred schemas for source/target tree display', async () => {
      const adapter = createMockAdapter({
        getSchema: vi.fn().mockImplementation((id: string) => {
          if (id === 'source-schema-1') return Promise.resolve(MOCK_INFERRED_SOURCE_SCHEMA);
          if (id === 'target-schema-1') return Promise.resolve(MOCK_INFERRED_TARGET_SCHEMA);
          return Promise.reject(new Error(`Schema ${id} not found`));
        }),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      expect(result.current.parsedSourceSchema).not.toBeNull();
      expect(result.current.parsedSourceSchema?.inferred).toBe(true);
      expect(result.current.parsedSourceSchema?.nodes.length ?? 0).toBeGreaterThan(0);
      expect(result.current.parsedTargetSchema).not.toBeNull();
      expect(result.current.parsedTargetSchema?.inferred).toBe(true);
      expect(result.current.parsedTargetSchema?.nodes.length ?? 0).toBeGreaterThan(0);
    });

    it('uses inferred-schema reconstruction for engine validation payloads', async () => {
      const adapter = createMockAdapter({
        getSchema: vi.fn().mockImplementation((id: string) => {
          if (id === 'source-schema-1') return Promise.resolve(MOCK_INFERRED_SOURCE_SCHEMA);
          if (id === 'target-schema-1') return Promise.resolve(MOCK_INFERRED_TARGET_SCHEMA);
          return Promise.reject(new Error(`Schema ${id} not found`));
        }),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      await waitFor(() => {
        expect(result.current.validation.result).not.toBeNull();
      });

      expect(result.current.validation.result?.valid).toBe(true);
      expect(result.current.validation.result?.diagnostics.some((d) => d.severity === 'error')).toBe(false);
    });

    it('transitions to error state on config load failure', async () => {
      const adapter = createMockAdapter({
        getMapping: vi.fn().mockRejectedValue(new Error('Network error')),
      });
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('error');
      });

      expect(result.current.loadError).toBe('Network error');
    });

    it('schema load failure does not crash — validation skipped (AE-10)', async () => {
      const adapter = createMockAdapter({
        getSchema: vi.fn().mockRejectedValue(new Error('Schema not found')),
      });
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      expect(result.current.schemasLoaded).toBe(false);
      expect(result.current.sourceSchemaName).toBeNull();
      expect(result.current.targetSchemaName).toBeNull();
      expect(result.current.schemaLoadWarnings).toEqual([
        expect.objectContaining({
          role: 'source',
          schemaId: 'source-schema-1',
          message: 'Schema not found',
        }),
        expect.objectContaining({
          role: 'target',
          schemaId: 'target-schema-1',
          message: 'Schema not found',
        }),
      ]);
    });

    it('captures RESOURCE_NOT_FOUND schema errors as non-blocking warnings', async () => {
      const notFoundError = Object.assign(new Error("Schema with id 'missing-target' not found"), {
        code: 'RESOURCE_NOT_FOUND',
        statusCode: 404,
      });
      const adapter = createMockAdapter({
        getSchema: vi.fn().mockImplementation((id: string) => {
          if (id === 'source-schema-1') return Promise.resolve(MOCK_SOURCE_SCHEMA);
          if (id === 'target-schema-1') return Promise.reject(notFoundError);
          return Promise.reject(new Error(`Schema ${id} not found`));
        }),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      expect(result.current.schemasLoaded).toBe(false);
      expect(result.current.sourceSchemaName).toBe('Source Schema');
      expect(result.current.targetSchemaName).toBeNull();
      expect(result.current.schemaLoadWarnings).toContainEqual(
        expect.objectContaining({
          role: 'target',
          schemaId: 'target-schema-1',
          code: 'RESOURCE_NOT_FOUND',
          statusCode: 404,
          message: "Schema with id 'missing-target' not found",
        }),
      );
    });

    it('retry re-triggers load after failure', async () => {
      let callCount = 0;
      const adapter = createMockAdapter({
        getMapping: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.reject(new Error('Temporary error'));
          return Promise.resolve(MOCK_CONFIG);
        }),
      });
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('error');
      });

      act(() => {
        result.current.actions.retry();
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      expect(result.current.mappingName).toBe('Test Mapping');
    });

    it('exposes non-blocking refresh metadata when cached mapping data exists', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      expect(result.current.lastUpdatedAt).not.toBeNull();
    });
  });

  describe('Save', () => {
    it('save increments version and calls adapter.saveMapping (AE-01)', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      // Make a change
      act(() => {
        result.current.actions.addRule({ target: 'NewField', expression: 'static("hi")' });
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
      expect(result.current.saveStatus).toBe('unsaved');

      // Save
      await act(async () => {
        result.current.actions.save();
      });

      await waitFor(() => {
        expect(result.current.saveStatus).toBe('saved');
      });

      expect(adapter.saveMapping).toHaveBeenCalledWith(
        'mapping-1',
        expect.objectContaining({
          version: 3,
          rules: expect.arrayContaining([
            expect.objectContaining({ target: 'NewField' }),
          ]),
        }),
      );
      expect(result.current.version).toBe(4);
      expect(result.current.currentRevision).toBe(4);
      expect(result.current.hasUnsavedChanges).toBe(false);
    });

    it('save error preserves local state and shows error status', async () => {
      const adapter = createMockAdapter({
        saveMapping: vi.fn().mockRejectedValue(new Error('Save failed')),
      });
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      // Make a change
      act(() => {
        result.current.actions.addRule({ target: 'X', expression: 'source("z")' });
      });

      // Attempt save
      await act(async () => {
        result.current.actions.save();
      });

      await waitFor(() => {
        expect(result.current.saveStatus).toBe('error');
      });

      expect(result.current.saveError).toBe('Save failed');
      // Local state preserved
      expect(result.current.rules).toHaveLength(3);
    });

    it('failed save rolls back optimistic merged rules and preserves draftRules', async () => {
      let rejectUpdate!: (error: Error) => void;
      const adapter = createMockAdapter({
        saveMapping: vi.fn().mockImplementation(
          () =>
            new Promise((_, reject) => {
              rejectUpdate = reject;
            }),
        ),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      // Draft change exists, but saved rules are not yet mutated.
      act(() => {
        result.current.actions.updateDraft('A.D', 'static("draft")');
      });
      expect(result.current.rules).toHaveLength(2);
      expect(result.current.draftRules.get('A.D')).toBe('static("draft")');

      let pendingSave!: Promise<{ noChange: boolean } | undefined>;
      act(() => {
        pendingSave = result.current.actions.save();
      });

      // Save path awaits query cancellation before optimistic update.
      await waitFor(() => {
        expect(result.current.saveStatus).toBe('saving');
        expect(result.current.rules).toHaveLength(3);
      });

      await act(async () => {
        rejectUpdate(new Error('Save failed'));
        await pendingSave;
      });

      await waitFor(() => {
        expect(result.current.saveStatus).toBe('error');
      });

      // Rollback to pre-save snapshot.
      expect(result.current.rules).toHaveLength(2);
      // Draft work is preserved (not cleared prematurely).
      expect(result.current.draftRules.get('A.D')).toBe('static("draft")');
      expect(result.current.saveError).toBe('Save failed');
    });

    it('does not save when there are no unsaved changes', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      expect(result.current.hasUnsavedChanges).toBe(false);

      await act(async () => {
        result.current.actions.save();
      });

      expect(adapter.saveMapping).not.toHaveBeenCalled();
    });

    it('save updates mapping only and does not trigger deployment orchestration APIs (Save != Deploy)', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.updateRule(0, {
          target: 'A.B',
          expression: 'static("saved-only")',
        });
      });

      await act(async () => {
        await result.current.actions.save();
      });

      expect(adapter.saveMapping).toHaveBeenCalled();
      expect(adapter.deployMapping).not.toHaveBeenCalled();
      expect(adapter.promoteDeployment).not.toHaveBeenCalled();
      expect(adapter.rollbackDeployment).not.toHaveBeenCalled();
    });

    it('metadata-only save response invalidates canonical detail instead of speculative merge', async () => {
      const adapter = createMockAdapter({
        getMapping: vi
          .fn()
          .mockResolvedValueOnce(MOCK_CONFIG)
          .mockResolvedValueOnce({
            ...MOCK_CONFIG,
            version: 4,
            rules: [
              ...MOCK_CONFIG.rules,
              { target: 'A.D', type: 'string', expression: 'source("server")' },
            ],
          }),
        saveMapping: vi.fn().mockResolvedValue({ revision: 4, noChange: false }),
      });

      const queryClient = createQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <AdapterProvider adapter={adapter}>{children}</AdapterProvider>
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useMappingEditor('mapping-1'), { wrapper });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.updateDraft('A.B', 'static("local-draft")');
      });

      await act(async () => {
        await result.current.actions.save();
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.mappings.detail('mapping-1') });

      await waitFor(() => {
        expect(adapter.getMapping).toHaveBeenCalledTimes(2);
      });

      await act(async () => {
        await result.current.actions.refreshToLatestSaved();
      });

      expect(result.current.rules).toEqual([
        ...MOCK_CONFIG.rules,
        { target: 'A.D', type: 'string', expression: 'source("server")' },
      ]);
      expect(result.current.rules.find((rule) => rule.target === 'A.B')?.expression).toBe('source("x")');

      invalidateSpy.mockRestore();
    });

    it('refreshToLatestSaved applies latest canonical server mapping and clears unsaved draft state', async () => {
      const adapter = createMockAdapter({
        getMapping: vi
          .fn()
          .mockResolvedValueOnce(MOCK_CONFIG)
          .mockResolvedValueOnce({
            ...MOCK_CONFIG,
            version: 4,
            rules: [
              ...MOCK_CONFIG.rules,
              { target: 'A.D', type: 'string', expression: 'source("server")' },
            ],
          }),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.updateDraft('A.B', 'static("local-draft")');
      });
      expect(result.current.hasUnsavedChanges).toBe(true);

      await act(async () => {
        await result.current.actions.refreshToLatestSaved();
      });

      await waitFor(() => {
        expect(result.current.currentRevision).toBe(4);
      });

      expect(result.current.rules).toEqual([
        ...MOCK_CONFIG.rules,
        { target: 'A.D', type: 'string', expression: 'source("server")' },
      ]);
      expect(result.current.draftRules.size).toBe(0);
      expect(result.current.hasUnsavedChanges).toBe(false);
    });

    it('marks hasNewerSavedRevision when refresh returns newer server revision while dirty', async () => {
      const adapter = createMockAdapter({
        getMapping: vi
          .fn()
          .mockResolvedValueOnce(MOCK_CONFIG)
          .mockResolvedValueOnce({
            ...MOCK_CONFIG,
            version: 5,
          }),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.updateDraft('A.B', 'static("local-only")');
      });

      await act(async () => {
        result.current.actions.retry();
      });

      await waitFor(() => {
        expect(result.current.latestSavedRevision).toBe(5);
      });

      expect(result.current.currentRevision).toBe(3);
      expect(result.current.hasUnsavedChanges).toBe(true);
      expect(result.current.hasNewerSavedRevision).toBe(true);
      expect(result.current.draftRules.get('A.B')).toBe('static("local-only")');
    });
  });

  describe('Unsaved changes', () => {
    it('detects unsaved changes after rule mutation', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      expect(result.current.hasUnsavedChanges).toBe(false);
      expect(result.current.saveStatus).toBe('saved');

      act(() => {
        result.current.actions.updateRule(0, {
          target: 'A.B',
          expression: 'static("changed")',
        });
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
      expect(result.current.saveStatus).toBe('unsaved');
    });

    it('no unsaved changes after successful save', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.addRule({ target: 'X', expression: 'source("a")' });
      });

      expect(result.current.hasUnsavedChanges).toBe(true);

      await act(async () => {
        result.current.actions.save();
      });

      await waitFor(() => {
        expect(result.current.hasUnsavedChanges).toBe(false);
      });
    });
  });

  describe('Keyboard shortcut', () => {
    it('Ctrl+S triggers save', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.addRule({ target: 'New', expression: 'static("x")' });
      });

      await act(async () => {
        const event = new KeyboardEvent('keydown', {
          key: 's',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        window.dispatchEvent(event);
      });

      await waitFor(() => {
        expect(adapter.saveMapping).toHaveBeenCalled();
      });
    });

    it('Cmd+S triggers save on Mac', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.addRule({ target: 'New', expression: 'static("x")' });
      });

      await act(async () => {
        const event = new KeyboardEvent('keydown', {
          key: 's',
          metaKey: true,
          bubbles: true,
          cancelable: true,
        });
        window.dispatchEvent(event);
      });

      await waitFor(() => {
        expect(adapter.saveMapping).toHaveBeenCalled();
      });
    });
  });

  describe('beforeunload', () => {
    it('registers beforeunload when unsaved changes exist', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.addRule({ target: 'X', expression: 'source("a")' });
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
      expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });

    it('removes beforeunload when changes are saved', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.addRule({ target: 'X', expression: 'source("a")' });
      });

      expect(result.current.hasUnsavedChanges).toBe(true);

      await act(async () => {
        result.current.actions.save();
      });

      await waitFor(() => {
        expect(result.current.hasUnsavedChanges).toBe(false);
      });

      expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });
  });

  describe('Rule actions', () => {
    it('addRule appends a rule with target-schema type when available', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.addRule({
          target: 'A.C',
          expression: 'static("val")',
          description: 'test desc',
        });
      });

      expect(result.current.rules).toHaveLength(3);
      expect(result.current.rules[2]).toEqual({
        target: 'A.C',
        type: 'number',
        expression: 'static("val")',
        description: 'test desc',
      });
    });

    it('updateRuleByTarget appends with target-schema type when patch type is omitted', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.updateRuleByTarget('A.C', {
          expression: 'cast(source("y"), "number")',
        });
      });

      const appended = result.current.rules.find((r) => r.target === 'A.C');
      expect(appended?.type).toBe('number');
    });

    it('updateRule modifies rule at index', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.updateRule(0, {
          target: 'A.B',
          expression: 'static("updated")',
          description: 'new desc',
        });
      });

      expect(result.current.rules[0]).toEqual({
        target: 'A.B',
        type: 'string',
        expression: 'static("updated")',
        description: 'new desc',
      });
    });

    it('deleteRule removes rule at index', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.deleteRule(0);
      });

      expect(result.current.rules).toHaveLength(1);
      expect(result.current.rules[0].target).toBe('A.C');
    });

    it('reorderRules moves a rule from one position to another', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.reorderRules(0, 1);
      });

      expect(result.current.rules[0].target).toBe('A.C');
      expect(result.current.rules[1].target).toBe('A.B');
    });

    it('bulkDelete removes multiple rules', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.bulkDelete([0, 1]);
      });

      expect(result.current.rules).toHaveLength(0);
    });

    it('bulkDuplicate appends copies of selected rules', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.bulkDuplicate([0]);
      });

      expect(result.current.rules).toHaveLength(3);
      expect(result.current.rules[2]).toEqual(result.current.rules[0]);
    });

    it('pasteRules normalizes pasted rule type to target-schema type', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.pasteRules([
          { target: 'A.C', type: 'string', expression: 'cast(source("y"), "number")' },
        ]);
      });

      expect(result.current.rules).toHaveLength(3);
      expect(result.current.rules[2]).toMatchObject({ target: 'A.C', type: 'number' });
    });
  });

  describe('Save status', () => {    it('saveStatus is "saved" after load with no changes', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      expect(result.current.saveStatus).toBe('saved');
    });

    it('saveStatus is "unsaved" after making changes', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.addRule({ target: 'X', expression: 'source("x")' });
      });

      expect(result.current.saveStatus).toBe('unsaved');
    });

    it('saveStatus transitions through "saving" during save', async () => {
      let resolveUpdate!: (val: unknown) => void;
      const adapter = createMockAdapter({
        saveMapping: vi.fn().mockImplementation(
          () => new Promise((resolve) => { resolveUpdate = resolve; }),
        ),
      });
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.addRule({ target: 'X', expression: 'source("x")' });
      });

      act(() => {
        void result.current.actions.save();
      });

      // Should be saving
      expect(result.current.saveStatus).toBe('saving');

      await waitFor(() => {
        expect(typeof resolveUpdate).toBe('function');
      });

      // Resolve
      await act(async () => {
        resolveUpdate({ revision: 4, noChange: false });
      });

      await waitFor(() => {
        expect(result.current.saveStatus).toBe('saved');
      });
     });
  });

  describe('Config mutation (AE-05, AE-08)', () => {
    it('updateConfig updates returned configOptions', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.updateConfig({ unmappedTargets: 'error' });
      });

      expect(result.current.configOptions.unmappedTargets).toBe('error');
    });

    it('hasUnsavedChanges is true after updateConfig when rules are unchanged', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      expect(result.current.hasUnsavedChanges).toBe(false);

      act(() => {
        result.current.actions.updateConfig({ unmappedTargets: 'error' });
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it('hasUnsavedChanges is false after save with config changes', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.updateConfig({ unmappedTargets: 'error' });
      });

      expect(result.current.hasUnsavedChanges).toBe(true);

      await act(async () => {
        result.current.actions.save();
      });

      await waitFor(() => {
        expect(result.current.hasUnsavedChanges).toBe(false);
      });
    });

    it('validationConfig includes updated config options after updateConfig', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.updateConfig({ unmappedTargets: 'null' });
      });

      expect(result.current.config?.config.unmappedTargets).toBe('null');
    });

    it('save persists config options to adapter (AE-05)', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.updateConfig({
          unmappedTargets: 'omit',
          constants: { VERSION: '2.0' },
          externalSources: ['lookup'],
        });
      });

      await act(async () => {
        result.current.actions.save();
      });

      await waitFor(() => {
        expect(result.current.saveStatus).toBe('saved');
      });

      expect(adapter.saveMapping).toHaveBeenCalledWith(
        'mapping-1',
        expect.objectContaining({
          config: expect.objectContaining({
            unmappedTargets: 'omit',
            constants: { VERSION: '2.0' },
            externalSources: ['lookup'],
          }),
        }),
      );
    });

    it('multiple updateConfig calls merge correctly', async () => {

      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.updateConfig({ unmappedTargets: 'error' });
      });

      act(() => {
        result.current.actions.updateConfig({ constants: { KEY: 'val' } });
      });

      const opts: MappingConfigOptions = result.current.configOptions;
      expect(opts.unmappedTargets).toBe('error');
      expect(opts.constants).toEqual({ KEY: 'val' });
    });
  });

  // ---------------------------------------------------------------------------
  // Version persistence (AE-01)
  // ---------------------------------------------------------------------------

  describe('version persistence', () => {
    it('calls saveMappingVersion after successful save with correct entry', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.addRule({ target: 'A.D', expression: 'static("x")', description: undefined });
      });

      await act(async () => {
        result.current.actions.save();
      });

      await waitFor(() => {
        expect(result.current.saveStatus).toBe('saved');
      });

      expect(adapter.saveMappingVersion).toHaveBeenCalledTimes(1);
      const [calledMappingId, entry] = (adapter.saveMappingVersion as ReturnType<typeof vi.fn>).mock.calls[0] as [string, import('@/lib/types/domain').MappingVersionEntry];
      expect(calledMappingId).toBe('mapping-1');
      expect(entry.version).toBe(4); // MOCK_CONFIG.version (3) + 1
      expect(entry.savedBy).toBe('You');
      expect(entry.ruleCount).toBe(3); // 2 original + 1 added
      expect(entry.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(entry.config).toMatchObject({ version: 4 });
    });

    it('save still reports success when saveMappingVersion rejects (fire-and-forget)', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const adapter = createMockAdapter({
        saveMappingVersion: vi.fn().mockRejectedValue(new Error('storage full')),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.addRule({ target: 'A.D', expression: 'static("x")', description: undefined });
      });

      await act(async () => {
        result.current.actions.save();
      });

      await waitFor(() => {
        expect(result.current.saveStatus).toBe('saved');
      });

      // Give the fire-and-forget rejection time to settle
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(result.current.saveStatus).toBe('saved');
      expect(result.current.saveError).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to save version history entry:',
        expect.any(Error),
      );

      consoleWarnSpy.mockRestore();
    });

    it('saveMappingVersion is NOT called when saveMapping fails', async () => {
      const adapter = createMockAdapter({
        saveMapping: vi.fn().mockRejectedValue(new Error('network error')),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.addRule({ target: 'A.D', expression: 'static("x")', description: undefined });
      });

      await act(async () => {
        result.current.actions.save();
      });

      await waitFor(() => {
        expect(result.current.saveStatus).toBe('error');
      });

      expect(adapter.saveMappingVersion).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // applyRule (deprecated wrapper — backward compat)
  // ---------------------------------------------------------------------------

  describe('applyRule', () => {
    it('stores draft for a new target path and reflects in draftRules', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.applyRule('A.D', 'static("hello")');
      });

      // Draft is stored in draftRules, not rules
      expect(result.current.draftRules.get('A.D')).toBe('static("hello")');
      expect(result.current.unsavedRuleCount).toBe(1);
    });

    it('stores draft for an existing target path', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.applyRule('A.B', 'static("updated")');
      });

      expect(result.current.draftRules.get('A.B')).toBe('static("updated")');
      expect(result.current.unsavedRuleCount).toBe(1);
    });

    it('counts distinct changed fields (not calls) in unsavedRuleCount', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.applyRule('A.B', 'static("x")'); });
      act(() => { result.current.actions.applyRule('A.C', 'static("y")'); });

      expect(result.current.unsavedRuleCount).toBe(2);
    });

    it('does not count a field if draft matches saved expression', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      // A.B already has expression 'source("x")' in saved rules
      act(() => {
        result.current.actions.applyRule('A.B', 'source("x")');
      });

      // Draft is not stored because expression matches saved rule
      expect(result.current.unsavedRuleCount).toBe(0);
    });

    it('does not re-store draft for same expression applied twice', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.applyRule('A.B', 'static("new")');
      });

      const firstCount = result.current.unsavedRuleCount;

      act(() => {
        result.current.actions.applyRule('A.B', 'static("new")');
      });

      expect(result.current.unsavedRuleCount).toBe(firstCount);
    });

    it('fires onRuleApplied callback after applyRule', async () => {
      const onRuleApplied = vi.fn();
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1', onRuleApplied), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.applyRule('A.B', 'static("x")');
      });

      expect(onRuleApplied).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // unsavedRuleCount reset on save
  // ---------------------------------------------------------------------------

  describe('unsavedRuleCount reset', () => {
    it('resets unsavedRuleCount to 0 after successful save', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.applyRule('A.B', 'static("x")'); });
      expect(result.current.unsavedRuleCount).toBe(1);

      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      expect(result.current.unsavedRuleCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // canNavigateAway
  // ---------------------------------------------------------------------------

  describe('canNavigateAway', () => {
    it('returns allowed=true when no unsaved changes and no drafts', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      expect(result.current.actions.canNavigateAway()).toEqual({ allowed: true, reason: null });
    });

    it('returns allowed=false with reason "unsaved" when draftRules has changes', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.applyRule('A.B', 'static("x")'); });

      expect(result.current.actions.canNavigateAway()).toEqual({ allowed: false, reason: 'unsaved' });
    });

    it('returns allowed=false with reason "unsaved" when hasUnsavedChanges is true', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      // addRule sets hasUnsavedChanges without going through applyRule
      act(() => { result.current.actions.addRule({ target: 'A.D', expression: 'static("x")', description: undefined }); });

      expect(result.current.actions.canNavigateAway()).toEqual({ allowed: false, reason: 'unsaved' });
    });
  });

  // ---------------------------------------------------------------------------
  // FS-039 draft rules API
  // ---------------------------------------------------------------------------

  describe('updateDraft', () => {
    it('stores draft expression in draftRules', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.updateDraft('A.D', 'static("draft")');
      });

      expect(result.current.draftRules.get('A.D')).toBe('static("draft")');
    });

    it('sets hasUnsavedChanges to true', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));
      expect(result.current.hasUnsavedChanges).toBe(false);

      act(() => {
        result.current.actions.updateDraft('A.D', 'static("draft")');
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it('does not count as changed when draft matches saved expression', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      // A.B has saved expression 'source("x")'
      act(() => {
        result.current.actions.updateDraft('A.B', 'source("x")');
      });

      // Draft is stored but doesn't count as changed
      expect(result.current.draftRules.get('A.B')).toBe('source("x")');
      expect(result.current.unsavedChangeCount).toBe(0);
      expect(result.current.hasUnsavedChanges).toBe(false);
    });

    it('overwrites previous draft for same target', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.updateDraft('A.D', 'static("first")'); });
      act(() => { result.current.actions.updateDraft('A.D', 'static("second")'); });

      expect(result.current.draftRules.get('A.D')).toBe('static("second")');
      expect(result.current.unsavedChangeCount).toBe(1);
    });
  });

  describe('getDraftExpression', () => {
    it('returns null when no draft exists', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      expect(result.current.actions.getDraftExpression('A.D')).toBeNull();
    });

    it('returns draft expression when draft exists', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.updateDraft('A.D', 'static("val")'); });

      expect(result.current.actions.getDraftExpression('A.D')).toBe('static("val")');
    });
  });

  describe('commitDraft', () => {
    it('stores draft expression (semantic alias for updateDraft)', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.commitDraft('A.D', 'static("committed")');
      });

      expect(result.current.draftRules.get('A.D')).toBe('static("committed")');
    });
  });

  describe('revertDraft', () => {
    it('removes draft entry for a target path', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.updateDraft('A.D', 'static("draft")'); });
      expect(result.current.draftRules.has('A.D')).toBe(true);

      act(() => { result.current.actions.revertDraft('A.D'); });
      expect(result.current.draftRules.has('A.D')).toBe(false);
    });

    it('reverts hasUnsavedChanges to false when last draft is removed', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.updateDraft('A.D', 'static("draft")'); });
      expect(result.current.hasUnsavedChanges).toBe(true);

      act(() => { result.current.actions.revertDraft('A.D'); });
      expect(result.current.hasUnsavedChanges).toBe(false);
    });

    it('is a no-op when no draft exists for target', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      // Should not throw
      act(() => { result.current.actions.revertDraft('NonExistent'); });
      expect(result.current.draftRules.size).toBe(0);
    });
  });

  describe('revertAllDrafts', () => {
    it('clears all draft entries', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.updateDraft('A.B', 'static("x")');
        result.current.actions.updateDraft('A.C', 'static("y")');
      });

      expect(result.current.draftRules.size).toBe(2);

      act(() => { result.current.actions.revertAllDrafts(); });

      expect(result.current.draftRules.size).toBe(0);
      expect(result.current.hasUnsavedChanges).toBe(false);
    });
  });

  describe('save() with draftRules', () => {
    it('keeps changes draft-only until save is invoked', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.updateDraft('A.D', 'source("z")');
      });

      expect(result.current.actions.getDraftExpression('A.D')).toBe('source("z")');
      expect(result.current.rules.find((r) => r.target === 'A.D')).toBeUndefined();
      expect(adapter.saveMapping).not.toHaveBeenCalled();

      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      expect(adapter.saveMapping).toHaveBeenCalledTimes(1);
      expect(result.current.rules.find((r) => r.target === 'A.D')?.expression).toBe('source("z")');
    });

    it('merges draft additions into saved rules on save', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.updateDraft('A.D', 'static("new")');
      });

      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      // Draft should be cleared after save
      expect(result.current.draftRules.size).toBe(0);
      // The new rule should be in saved rules
      expect(result.current.rules.find((r) => r.target === 'A.D')?.expression).toBe('static("new")');
      expect(result.current.rules.find((r) => r.target === 'A.D')?.type).toBe('string');
      // adapter should have been called with the merged rules
      expect(adapter.saveMapping).toHaveBeenCalledWith(
        'mapping-1',
        expect.objectContaining({
          rules: expect.arrayContaining([
            expect.objectContaining({ target: 'A.D', expression: 'static("new")' }),
          ]),
        }),
      );
    });

    it('uses parsed target schema type when adding draft-only rules on save', async () => {
      const adapter = createMockAdapter({
        getSchema: vi.fn().mockImplementation((id: string) => {
          if (id === 'source-schema-1') return Promise.resolve(MOCK_SOURCE_SCHEMA);
          if (id === 'target-schema-1') {
            return Promise.resolve({
              ...MOCK_TARGET_SCHEMA,
              content: {
                type: 'object',
                properties: {
                  A: {
                    type: 'object',
                    properties: {
                      B: { type: 'string' },
                      C: { type: 'number' },
                      D: { type: 'number' },
                    },
                  },
                },
              },
            } satisfies SchemaDetail);
          }
          return Promise.reject(new Error(`Schema ${id} not found`));
        }),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.updateRuleByTarget('A.D', {
          type: 'string',
          expression: 'cast(source("y"), "number")',
        });
      });
      act(() => { result.current.actions.setSaveBlocked(false); });

      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      expect(result.current.rules.find((r) => r.target === 'A.D')?.type).toBe('number');
      expect(adapter.saveMapping).toHaveBeenCalledWith(
        'mapping-1',
        expect.objectContaining({
          rules: expect.arrayContaining([
            expect.objectContaining({ target: 'A.D', type: 'number' }),
          ]),
        }),
      );
    });

    it('normalizes save payload type when target path casing differs from schema path', async () => {
      const adapter = createMockAdapter({
        getSchema: vi.fn().mockImplementation((id: string) => {
          if (id === 'source-schema-1') return Promise.resolve(MOCK_SOURCE_SCHEMA);
          if (id === 'target-schema-1') {
            return Promise.resolve({
              ...MOCK_TARGET_SCHEMA,
              content: {
                financial: {
                  totalAmount: 148.47,
                },
              },
            } satisfies SchemaDetail);
          }
          return Promise.reject(new Error(`Schema ${id} not found`));
        }),
        getMapping: vi.fn().mockResolvedValue({
          ...MOCK_CONFIG,
          rules: [
            {
              target: 'financial.totalAmount',
              type: 'string',
              expression: 'source("payment.total")',
            },
          ],
        } satisfies MappingConfig),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      expect(result.current.rules[0]).toMatchObject({
        target: 'financial.totalAmount',
        type: 'number',
      });

      act(() => {
        result.current.actions.updateDraft('financial.totalAmount', 'source("payment.total2")');
      });

      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      expect(adapter.saveMapping).toHaveBeenCalledWith(
        'mapping-1',
        expect.objectContaining({
          rules: expect.arrayContaining([
            expect.objectContaining({
              target: 'financial.totalAmount',
              expression: 'source("payment.total2")',
              type: 'number',
            }),
          ]),
        }),
      );
    });

    it('normalizes save payload type when target schema content is serialized json string', async () => {
      const adapter = createMockAdapter({
        getSchema: vi.fn().mockImplementation((id: string) => {
          if (id === 'source-schema-1') return Promise.resolve(MOCK_SOURCE_SCHEMA);
          if (id === 'target-schema-1') {
            return Promise.resolve({
              ...MOCK_TARGET_SCHEMA,
              metadata: {
                ...MOCK_TARGET_SCHEMA.metadata,
                format: 'json-schema',
              },
              content: JSON.stringify({
                type: 'object',
                properties: {
                  financial: {
                    type: 'object',
                    properties: {
                      totalAmount: { type: 'number' },
                    },
                  },
                },
              }),
            } satisfies SchemaDetail);
          }
          return Promise.reject(new Error(`Schema ${id} not found`));
        }),
        getMapping: vi.fn().mockResolvedValue({
          ...MOCK_CONFIG,
          rules: [
            {
              target: 'financial.totalAmount',
              type: 'string',
              expression: 'source("payment.total")',
            },
          ],
        } satisfies MappingConfig),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      expect(result.current.rules[0]).toMatchObject({
        target: 'financial.totalAmount',
        type: 'number',
      });

      act(() => {
        result.current.actions.updateDraft('financial.totalAmount', 'cast(source("payment.total"), "number")');
      });

      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      expect(adapter.saveMapping).toHaveBeenCalledWith(
        'mapping-1',
        expect.objectContaining({
          rules: expect.arrayContaining([
            expect.objectContaining({
              target: 'financial.totalAmount',
              expression: 'cast(source("payment.total"), "number")',
              type: 'number',
            }),
          ]),
        }),
      );
    });

    it('normalizes save payload type when target schema content is serialized sample payload string', async () => {
      const adapter = createMockAdapter({
        getSchema: vi.fn().mockImplementation((id: string) => {
          if (id === 'source-schema-1') return Promise.resolve(MOCK_SOURCE_SCHEMA);
          if (id === 'target-schema-1') {
            return Promise.resolve({
              ...MOCK_TARGET_SCHEMA,
              metadata: {
                ...MOCK_TARGET_SCHEMA.metadata,
                format: 'json-schema',
              },
              content: JSON.stringify({
                financial: {
                  totalAmount: 148.47,
                },
              }),
            } satisfies SchemaDetail);
          }
          return Promise.reject(new Error(`Schema ${id} not found`));
        }),
        getMapping: vi.fn().mockResolvedValue({
          ...MOCK_CONFIG,
          rules: [
            {
              target: 'financial.totalAmount',
              type: 'string',
              expression: 'source("payment.total")',
            },
          ],
        } satisfies MappingConfig),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      expect(result.current.rules[0]).toMatchObject({
        target: 'financial.totalAmount',
        type: 'number',
      });

      act(() => {
        result.current.actions.updateDraft('financial.totalAmount', 'cast(source("payment.total"), "number")');
      });

      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      expect(adapter.saveMapping).toHaveBeenCalledWith(
        'mapping-1',
        expect.objectContaining({
          rules: expect.arrayContaining([
            expect.objectContaining({
              target: 'financial.totalAmount',
              expression: 'cast(source("payment.total"), "number")',
              type: 'number',
            }),
          ]),
        }),
      );
    });

    it('resolves nested parsed target schema node type for save payload normalization', async () => {
      const adapter = createMockAdapter({
        getSchema: vi.fn().mockImplementation((id: string) => {
          if (id === 'source-schema-1') return Promise.resolve(MOCK_SOURCE_SCHEMA);
          if (id === 'target-schema-1') {
            return Promise.resolve({
              ...MOCK_TARGET_SCHEMA,
              content: {
                type: 'object',
                properties: {
                  financial: {
                    type: 'object',
                    properties: {
                      totalAmount: { type: 'number' },
                    },
                  },
                },
              },
            } satisfies SchemaDetail);
          }
          return Promise.reject(new Error(`Schema ${id} not found`));
        }),
        getMapping: vi.fn().mockResolvedValue({
          ...MOCK_CONFIG,
          rules: [
            {
              target: 'financial.totalAmount',
              type: 'string',
              expression: 'source("payment.total")',
            },
          ],
        } satisfies MappingConfig),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      expect(result.current.rules[0]).toMatchObject({
        target: 'financial.totalAmount',
        type: 'number',
      });

      act(() => {
        result.current.actions.updateDraft('financial.totalAmount', 'cast(source("payment.total"), "number")');
      });

      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      expect(adapter.saveMapping).toHaveBeenCalledWith(
        'mapping-1',
        expect.objectContaining({
          rules: expect.arrayContaining([
            expect.objectContaining({
              target: 'financial.totalAmount',
              type: 'number',
            }),
          ]),
        }),
      );
    });

    it('normalizes stale loaded rule types against target schema before editing', async () => {
      const staleConfig: MappingConfig = {
        ...MOCK_CONFIG,
        rules: [
          ...MOCK_CONFIG.rules,
          {
            target: 'A.D',
            type: 'string',
            expression: 'cast(source("y"), "number")',
          },
        ],
      };
      const adapter = createMockAdapter({
        getMapping: vi.fn().mockResolvedValue(staleConfig),
        getSchema: vi.fn().mockImplementation((id: string) => {
          if (id === 'source-schema-1') return Promise.resolve(MOCK_SOURCE_SCHEMA);
          if (id === 'target-schema-1') {
            return Promise.resolve({
              ...MOCK_TARGET_SCHEMA,
              content: {
                type: 'object',
                properties: {
                  A: {
                    type: 'object',
                    properties: {
                      B: { type: 'string' },
                      C: { type: 'number' },
                      D: { type: 'number' },
                    },
                  },
                },
              },
            } satisfies SchemaDetail);
          }
          return Promise.reject(new Error(`Schema ${id} not found`));
        }),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      expect(result.current.rules.find((r) => r.target === 'A.D')?.type).toBe('number');
    });

    it('merges draft updates into saved rules on save', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.updateDraft('A.B', 'static("updated")');
      });

      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      expect(result.current.rules.find((r) => r.target === 'A.B')?.expression).toBe('static("updated")');
    });

    it('empty expression draft deletes rule on save', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      // A.B exists in saved rules — empty draft = delete on save
      act(() => {
        result.current.actions.updateDraft('A.B', '');
      });

      expect(result.current.hasUnsavedChanges).toBe(true);

      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      expect(result.current.rules.find((r) => r.target === 'A.B')).toBeUndefined();
      expect(result.current.draftRules.size).toBe(0);
    });

    it('clears draftRules after successful save', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.updateDraft('A.D', 'static("x")');
        result.current.actions.updateDraft('A.B', 'static("y")');
      });

      expect(result.current.draftRules.size).toBe(2);

      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      expect(result.current.draftRules.size).toBe(0);
      expect(result.current.unsavedChangeCount).toBe(0);
    });
  });

  describe('getUnsavedChangeSummary', () => {
    it('returns empty array when no drafts', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      expect(result.current.actions.getUnsavedChangeSummary()).toEqual([]);
    });

    it('returns "added" for new target paths', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.updateDraft('A.D', 'static("new")'); });

      const summary = result.current.actions.getUnsavedChangeSummary();
      expect(summary).toHaveLength(1);
      expect(summary[0]).toMatchObject({
        targetPath: 'A.D',
        changeType: 'added',
        savedExpression: null,
        draftExpression: 'static("new")',
      });
    });

    it('returns "modified" for changed existing rules', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.updateDraft('A.B', 'static("changed")'); });

      const summary = result.current.actions.getUnsavedChangeSummary();
      expect(summary).toHaveLength(1);
      expect(summary[0]).toMatchObject({
        targetPath: 'A.B',
        changeType: 'modified',
        savedExpression: 'source("x")',
        draftExpression: 'static("changed")',
      });
    });

    it('returns "removed" for empty expression drafts on existing rules', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.updateDraft('A.B', ''); });

      const summary = result.current.actions.getUnsavedChangeSummary();
      expect(summary).toHaveLength(1);
      expect(summary[0]).toMatchObject({
        targetPath: 'A.B',
        changeType: 'removed',
        savedExpression: 'source("x")',
        draftExpression: '',
      });
    });

    it('excludes drafts that match saved expression', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      // A.B already has 'source("x")' — draft matches saved
      act(() => { result.current.actions.updateDraft('A.B', 'source("x")'); });

      expect(result.current.actions.getUnsavedChangeSummary()).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // FS-063 T-05: draft autosave, restore prompt, canSave, createVersion
  // ---------------------------------------------------------------------------

  // Helper: set up an in-memory localStorage mock for tests that need it.
  function createLocalStorageMock() {
    const store: Map<string, string> = new Map();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      get length() { return store.size; },
      key: (index: number) => [...store.keys()][index] ?? null,
    } satisfies Storage;
  }

  describe('canSave', () => {
    it('is false when no unsaved changes', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));
      expect(result.current.canSave).toBe(false);
    });

    it('is true after making changes', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.addRule({ target: 'X', expression: 'static("x")' }); });

      expect(result.current.canSave).toBe(true);
    });

    it('is false after successful save', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.addRule({ target: 'X', expression: 'static("x")' }); });
      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      expect(result.current.canSave).toBe(false);
    });

    it('is false when save is externally blocked even with unsaved changes', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));
      act(() => { result.current.actions.addRule({ target: 'X', expression: 'static("x")' }); });
      expect(result.current.hasUnsavedChanges).toBe(true);
      expect(result.current.canSave).toBe(true);

      act(() => { result.current.actions.setSaveBlocked(true); });
      expect(result.current.canSave).toBe(false);

      act(() => { result.current.actions.setSaveBlocked(false); });
      expect(result.current.canSave).toBe(true);
    });

    it('save() is a no-op while externally blocked', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));
      act(() => { result.current.actions.addRule({ target: 'X', expression: 'static("x")' }); });
      act(() => { result.current.actions.setSaveBlocked(true); });

      await act(async () => {
        const saveResult = await result.current.actions.save();
        expect(saveResult).toBeUndefined();
      });

      expect(adapter.saveMapping).not.toHaveBeenCalled();
      expect(result.current.hasUnsavedChanges).toBe(true);
    });
  });

  describe('currentRevision', () => {
    it('initialises from loaded config version', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));
      expect(result.current.currentRevision).toBe(3); // MOCK_CONFIG.version
    });

    it('updates to server-returned revision after save', async () => {
      const adapter = createMockAdapter({
        saveMapping: vi.fn().mockResolvedValue({ revision: 7, noChange: false }),
      });
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.addRule({ target: 'X', expression: 'static("x")' }); });
      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      expect(result.current.currentRevision).toBe(7);
    });

    it('does not change revision when noChange=true', async () => {
      const adapter = createMockAdapter({
        saveMapping: vi.fn().mockResolvedValue({ revision: 3, noChange: true }),
      });
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      // Force hasUnsavedChanges=true by mutating rules
      act(() => { result.current.actions.updateRule(0, { target: 'A.B', expression: 'static("x")' }); });
      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      // Revision is what the server returned
      expect(result.current.currentRevision).toBe(3);
    });
  });

  describe('autosave draft to localStorage', () => {
    let mockStorage: Storage;

    beforeEach(() => {
      mockStorage = createLocalStorageMock();
      vi.stubGlobal('localStorage', mockStorage);
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('writes draft to localStorage after 5 s when there are unsaved changes (AE-06)', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      // Load with real timers so waitFor works
      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      // Switch to fake timers before making the rule change (so the debounced setTimeout uses fake clock)
      vi.useFakeTimers();

      act(() => { result.current.actions.addRule({ target: 'X', expression: 'static("x")' }); });

      // Before timer fires — no draft
      expect(localStorage.getItem('keyra:draft:mapping-1')).toBeNull();

      // Advance timer past 5 s
      await act(async () => { vi.advanceTimersByTime(5100); });

      const raw = localStorage.getItem('keyra:draft:mapping-1');
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw!) as { baseRevision: number; savedAt: string; config: unknown };
      expect(stored.baseRevision).toBe(3); // MOCK_CONFIG.version
      expect(stored.savedAt).toBeTruthy();
    });

    it('does not write draft when there are no unsaved changes', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      vi.useFakeTimers();

      await act(async () => { vi.advanceTimersByTime(5100); });

      expect(localStorage.getItem('keyra:draft:mapping-1')).toBeNull();
      expect(result.current.hasDraft).toBe(false);
    });

    it('sets hasDraft=true once draft is written', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      vi.useFakeTimers();

      act(() => { result.current.actions.addRule({ target: 'X', expression: 'static("x")' }); });

      await act(async () => { vi.advanceTimersByTime(5100); });

      expect(result.current.hasDraft).toBe(true);
    });

    it('clears draft from localStorage after successful save', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      // Write a draft with fake timers
      vi.useFakeTimers();
      act(() => { result.current.actions.addRule({ target: 'X', expression: 'static("x")' }); });
      await act(async () => { vi.advanceTimersByTime(5100); });
      expect(localStorage.getItem('keyra:draft:mapping-1')).not.toBeNull();

      // Switch back to real timers for save
      vi.useRealTimers();
      await act(async () => { result.current.actions.save(); });
      await waitFor(() => expect(result.current.saveStatus).toBe('saved'));

      expect(localStorage.getItem('keyra:draft:mapping-1')).toBeNull();
      expect(result.current.hasDraft).toBe(false);
    });
  });

  describe('draft restore prompt', () => {
    let mockStorage: Storage;

    beforeEach(() => {
      mockStorage = createLocalStorageMock();
      vi.stubGlobal('localStorage', mockStorage);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('draftRestoreState is "none" when no draft in localStorage', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));
      expect(result.current.draftRestoreState.status).toBe('none');
      expect(result.current.hasDraft).toBe(false);
    });

    it('draftRestoreState is "same-revision" when draft baseRevision matches server (FS-063 Q4)', async () => {
      const draft = {
        config: { ...MOCK_CONFIG, rules: [{ target: 'X', type: 'string', expression: 'static("draft")' }] },
        baseRevision: 3, // matches MOCK_CONFIG.version
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem('keyra:draft:mapping-1', JSON.stringify(draft));

      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      expect(result.current.draftRestoreState.status).toBe('same-revision');
      expect(result.current.hasDraft).toBe(true);
    });

    it('draftRestoreState is "stale-revision" when server has newer revision (FS-063 Q5)', async () => {
      const draft = {
        config: { ...MOCK_CONFIG, rules: [] },
        baseRevision: 1, // older than MOCK_CONFIG.version (3)
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem('keyra:draft:mapping-1', JSON.stringify(draft));

      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      expect(result.current.draftRestoreState.status).toBe('stale-revision');
      if (result.current.draftRestoreState.status === 'stale-revision') {
        expect(result.current.draftRestoreState.serverRevision).toBe(3);
      }
    });

    it('acceptDraftRestore applies draft rules to editor and clears prompt', async () => {
      const draftRules = [{ target: 'X', type: 'string', expression: 'static("draft")' }];
      const draft = {
        config: { ...MOCK_CONFIG, rules: draftRules },
        baseRevision: 3,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem('keyra:draft:mapping-1', JSON.stringify(draft));

      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));
      expect(result.current.draftRestoreState.status).toBe('same-revision');

      act(() => { result.current.actions.acceptDraftRestore(); });

      expect(result.current.draftRestoreState.status).toBe('none');
      expect(result.current.rules).toEqual(draftRules);
    });

    it('discardDraftRestore clears localStorage draft and prompt', async () => {
      const draft = {
        config: { ...MOCK_CONFIG, rules: [] },
        baseRevision: 3,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem('keyra:draft:mapping-1', JSON.stringify(draft));

      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));
      expect(result.current.draftRestoreState.status).toBe('same-revision');

      act(() => { result.current.actions.discardDraftRestore(); });

      expect(result.current.draftRestoreState.status).toBe('none');
      expect(localStorage.getItem('keyra:draft:mapping-1')).toBeNull();
      expect(result.current.hasDraft).toBe(false);
    });
  });

  describe('createVersion', () => {
    it('calls adapter.createVersion and updates currentVersion (AE-03)', async () => {
      const adapter = createMockAdapter({
        createVersion: vi.fn().mockResolvedValue({ version: 1, revisionNumber: 3, createdAt: '2024-01-01T00:00:00Z', createdBy: 'You' }),
      });
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      // No unsaved changes — createVersion goes straight to adapter
      await act(async () => { await result.current.actions.createVersion(); });

      expect(adapter.createVersion).toHaveBeenCalledWith('mapping-1');
      expect(result.current.currentVersion).toBe(1);
    });

    it('implicitly saves first when there are unsaved changes (AE-04)', async () => {
      const adapter = createMockAdapter({
        saveMapping: vi.fn().mockResolvedValue({ revision: 4, noChange: false }),
        createVersion: vi.fn().mockResolvedValue({ version: 1, revisionNumber: 4, createdAt: '2024-01-01T00:00:00Z', createdBy: 'You' }),
      });
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.addRule({ target: 'X', expression: 'static("x")' }); });
      expect(result.current.hasUnsavedChanges).toBe(true);

      await act(async () => { await result.current.actions.createVersion(); });

      expect(adapter.saveMapping).toHaveBeenCalledWith('mapping-1', expect.any(Object));
      expect(adapter.createVersion).toHaveBeenCalledWith('mapping-1');
      expect(result.current.currentVersion).toBe(1);
      // Draft is cleared after implicit save
      expect(result.current.hasUnsavedChanges).toBe(false);
    });

    it('does not create version if implicit save fails', async () => {
      const adapter = createMockAdapter({
        saveMapping: vi.fn().mockRejectedValue(new Error('save failed')),
        createVersion: vi.fn().mockResolvedValue({ version: 1, revisionNumber: 4, createdAt: '2024-01-01T00:00:00Z', createdBy: 'You' }),
      });
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => { result.current.actions.addRule({ target: 'X', expression: 'static("x")' }); });

      await act(async () => { await result.current.actions.createVersion(); });

      expect(adapter.createVersion).not.toHaveBeenCalled();
      expect(result.current.currentVersion).toBeNull();
    });
  });

  describe('AI validation orchestration', () => {
    it('runs AI validation manually and exposes structured report state', async () => {
      const report = {
        summary: {
          totalIssues: 1,
          bySeverity: { info: 0, warning: 1, error: 0 },
          byCategory: {
            correctness: 0,
            completeness: 1,
            maintainability: 0,
            risk: 0,
          },
        },
        issues: [
          {
            id: 'issue-1',
            category: 'completeness',
            severity: 'warning',
            affectedRules: [{ ruleIndex: 0, targetPath: 'A.B' }],
            description: 'Missing fallback',
            recommendation: 'Use default() fallback',
          },
        ],
      } as const;

      const adapter = createMockAdapter({
        validateMappings: vi.fn().mockResolvedValue(report),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.runAiValidation();
      });

      expect(result.current.aiValidation.status).toBe('loading');

      await waitFor(() => {
        expect(result.current.aiValidation.status).toBe('success');
      });

      expect(result.current.aiValidation.report).toEqual(report);
      expect(adapter.validateMappings).toHaveBeenCalledWith({ mappingId: 'mapping-1' });
    });

    it('passes optional sampleData to validateMappings request', async () => {
      const adapter = createMockAdapter({
        validateMappings: vi.fn().mockResolvedValue({
          summary: {
            totalIssues: 0,
            bySeverity: { info: 0, warning: 0, error: 0 },
            byCategory: {
              correctness: 0,
              completeness: 0,
              maintainability: 0,
              risk: 0,
            },
          },
          issues: [],
        }),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.runAiValidation({
          sampleData: {
            contentType: 'application/json',
            content: '{"invoice":{"id":"123"}}',
          },
        });
      });

      await waitFor(() => {
        expect(result.current.aiValidation.status).toBe('success');
      });

      expect(adapter.validateMappings).toHaveBeenCalledWith({
        mappingId: 'mapping-1',
        sampleData: {
          contentType: 'application/json',
          content: '{"invoice":{"id":"123"}}',
        },
      });
    });

    it('failure is non-destructive to mapping/rule state and supports retry/reset', async () => {
      const validateMappings = vi
        .fn()
        .mockRejectedValueOnce(new Error('Could not reach AI Validation service.'))
        .mockResolvedValueOnce({
          summary: {
            totalIssues: 0,
            bySeverity: { info: 0, warning: 0, error: 0 },
            byCategory: {
              correctness: 0,
              completeness: 0,
              maintainability: 0,
              risk: 0,
            },
          },
          issues: [],
        });

      const adapter = createMockAdapter({ validateMappings });
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      const rulesBefore = result.current.rules;

      act(() => {
        result.current.actions.runAiValidation();
      });

      await waitFor(() => {
        expect(result.current.aiValidation.status).toBe('error');
      });

      expect(result.current.rules).toEqual(rulesBefore);

      act(() => {
        result.current.actions.retryAiValidation();
      });

      await waitFor(() => {
        expect(result.current.aiValidation.status).toBe('success');
      });

      act(() => {
        result.current.actions.resetAiValidation();
      });

      expect(result.current.aiValidation).toEqual({
        status: 'idle',
        report: null,
        error: null,
      });
    });

    it('does not auto-trigger AI validation after mapping edits', async () => {
      const adapter = createMockAdapter({
        validateMappings: vi.fn().mockResolvedValue({
          summary: {
            totalIssues: 0,
            bySeverity: { info: 0, warning: 0, error: 0 },
            byCategory: {
              correctness: 0,
              completeness: 0,
              maintainability: 0,
              risk: 0,
            },
          },
          issues: [],
        }),
      });

      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => expect(result.current.loadState).toBe('loaded'));

      act(() => {
        result.current.actions.updateRule(0, {
          target: 'A.B',
          expression: 'static("changed")',
        });
      });

      expect(adapter.validateMappings).not.toHaveBeenCalled();
      expect(result.current.aiValidation.status).toBe('idle');
    });
  });
});
