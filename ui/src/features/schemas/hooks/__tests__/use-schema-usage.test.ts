import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useSchemaUsage } from '../use-schema-usage';

import { AdapterProvider, createQueryClient } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listProjects: vi.fn().mockResolvedValue([]),
    getProject: vi.fn().mockResolvedValue({
      projectId: 'project-1',
      name: 'Project One',
      description: '',
      slug: 'project-one',
      tags: [],
      schemaRefs: [],
      linkedSchemaIds: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      mappings: [],
    }),
    listMappings: vi.fn().mockResolvedValue([]),
    listSchemas: vi.fn(),
    getSchema: vi.fn(),
    createSchema: vi.fn(),
    updateSchema: vi.fn(),
    deleteSchema: vi.fn(),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
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
  const queryClient = createQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(AdapterProvider, { adapter }, children),
    );
  };
}

describe('useSchemaUsage', () => {
  it('derives project/mapping usage for matching schema id', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([
        { projectId: 'project-1', name: 'Project One', description: '', slug: 'project-one', updatedAt: '2026-01-01T00:00:00Z' },
      ]),
      getProject: vi.fn().mockResolvedValue({
        projectId: 'project-1',
        name: 'Project One',
        description: '',
        slug: 'project-one',
        tags: [],
        schemaRefs: [{ schemaId: 'schema-1', type: 'local' }],
        linkedSchemaIds: ['schema-1'],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        mappings: [],
      }),
      listMappings: vi.fn().mockResolvedValue([
        {
          mappingId: 'mapping-1',
          projectId: 'project-1',
          name: 'Mapping One',
          version: 1,
          status: 'ready',
          sourceSchemaId: 'schema-1',
          targetSchemaId: 'schema-2',
          ruleCount: 1,
          coverage: 1,
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ]),
    });

    const { result } = renderHook(() => useSchemaUsage('schema-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.projects).toEqual([{ projectId: 'project-1', name: 'Project One' }]);
    expect(result.current.mappings).toHaveLength(1);
    expect(result.current.mappings[0]?.role).toBe('source');
  });

  it('fails gracefully with empty usage lists when query errors', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockRejectedValue(new Error('boom')),
    });

    const { result } = renderHook(() => useSchemaUsage('schema-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.projects).toEqual([]);
    expect(result.current.mappings).toEqual([]);
  });
});
