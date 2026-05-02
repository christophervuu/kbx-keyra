import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { useMappingEditor } from './use-mapping-editor';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { MappingConfig, SchemaDetail } from '@/lib/types/domain';

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
  } as ApiAdapter;
}

function createWrapper(adapter: ApiAdapter) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <AdapterProvider adapter={adapter}>{children}</AdapterProvider>;
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
  });

  describe('Save', () => {
    it('save increments version and calls adapter.updateMapping (AE-07)', async () => {
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

      expect(adapter.updateMapping).toHaveBeenCalledWith(
        'mapping-1',
        expect.objectContaining({
          version: 4,
          rules: expect.arrayContaining([
            expect.objectContaining({ target: 'NewField' }),
          ]),
        }),
      );
      expect(result.current.version).toBe(4);
      expect(result.current.hasUnsavedChanges).toBe(false);
    });

    it('save error preserves local state and shows error status', async () => {
      const adapter = createMockAdapter({
        updateMapping: vi.fn().mockRejectedValue(new Error('Save failed')),
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

      expect(adapter.updateMapping).not.toHaveBeenCalled();
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
        expect(adapter.updateMapping).toHaveBeenCalled();
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
        expect(adapter.updateMapping).toHaveBeenCalled();
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
    it('addRule appends a rule with default type', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.addRule({
          target: 'New.Field',
          expression: 'static("val")',
          description: 'test desc',
        });
      });

      expect(result.current.rules).toHaveLength(3);
      expect(result.current.rules[2]).toEqual({
        target: 'New.Field',
        type: 'string',
        expression: 'static("val")',
        description: 'test desc',
      });
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

    it('pasteRules appends pasted rules', async () => {
      const adapter = createMockAdapter();
      const { result } = renderHook(() => useMappingEditor('mapping-1'), {
        wrapper: createWrapper(adapter),
      });

      await waitFor(() => {
        expect(result.current.loadState).toBe('loaded');
      });

      act(() => {
        result.current.actions.pasteRules([
          { target: 'Pasted.Field', type: 'string', expression: 'static("p")' },
        ]);
      });

      expect(result.current.rules).toHaveLength(3);
      expect(result.current.rules[2].target).toBe('Pasted.Field');
    });
  });

  describe('Save status', () => {
    it('saveStatus is "saved" after load with no changes', async () => {
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
        updateMapping: vi.fn().mockImplementation(
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

      // Resolve
      await act(async () => {
        resolveUpdate({ mappingId: 'mapping-1' });
      });

      await waitFor(() => {
        expect(result.current.saveStatus).toBe('saved');
      });
    });
  });
});
