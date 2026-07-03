import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useSchemaDetail } from '../use-schema-detail';

import { AdapterProvider, createQueryClient } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { SchemaDetail } from '@/lib/types/domain';

const SCHEMA_DETAIL: SchemaDetail = {
  metadata: {
    schemaId: 'schema-1',
    name: 'Schema One',
    format: 'json-schema',
    fieldCount: 3,
    origin: 'local',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    description: 'Initial description',
  },
  content: {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
  },
};

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listProjects: vi.fn(),
    listSchemas: vi.fn(),
    listMappings: vi.fn(),
    getSchema: vi.fn().mockResolvedValue(SCHEMA_DETAIL),
    createSchema: vi.fn(),
    updateSchema: vi.fn().mockResolvedValue({ ...SCHEMA_DETAIL.metadata }),
    markSchemaReviewed: vi.fn().mockResolvedValue({ ...SCHEMA_DETAIL.metadata, status: 'ready' }),
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

describe('useSchemaDetail metadata mutation cache behavior', () => {
  it('invalidates/refetches detail after metadata update success', async () => {
    const adapter = createMockAdapter({
      updateSchema: vi.fn().mockResolvedValue({ ...SCHEMA_DETAIL.metadata, name: 'Schema Updated' }),
    });

    const { result } = renderHook(() => useSchemaDetail('schema-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.schema?.metadata.name).toBe('Schema One');

    await act(async () => {
      await result.current.updateMetadata({ name: 'Schema Updated' });
    });

    expect(adapter.updateSchema).toHaveBeenCalledWith('schema-1', { name: 'Schema Updated' });

    // metadata-only response path invalidates canonical detail instead of speculative merge
    expect(result.current.schema?.metadata.name).toBe('Schema One');
    expect(result.current.mutationError).toBeNull();
  });

  it('runs CDM status-only refresh on load and uses refreshed metadata sync status', async () => {
    const cdmInitial: SchemaDetail = {
      ...SCHEMA_DETAIL,
      metadata: {
        ...SCHEMA_DETAIL.metadata,
        schemaId: 'schema-cdm-1',
        origin: 'cdm',
        source: {
          type: 'github',
          repo: 'KBXT/KBX-Canonicals',
          branch: 'main',
          path: 'JSONSchemas/CommonDataModels/Encounter.json',
          commitSha: 'sha-old',
        },
        syncStatus: 'synced',
      },
    };
    const cdmRefreshed: SchemaDetail = {
      ...cdmInitial,
      metadata: {
        ...cdmInitial.metadata,
        syncStatus: 'update-available',
      },
    };

    const getSchema = vi
      .fn()
      .mockResolvedValueOnce(cdmInitial)
      .mockResolvedValueOnce(cdmRefreshed);
    const syncCdmSchema = vi.fn().mockResolvedValue({
      schemaId: 'schema-cdm-1',
      synced: false,
      commitSha: 'sha-old',
      message: 'Update available from CDM source.',
    });

    const adapter = createMockAdapter({ getSchema, syncCdmSchema });

    const { result } = renderHook(() => useSchemaDetail('schema-cdm-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(syncCdmSchema).toHaveBeenCalledWith('schema-cdm-1', { statusOnly: true });
    expect(result.current.schema?.metadata.syncStatus).toBe('update-available');
  });

  it('rolls back metadata and surfaces mutationError on failure', async () => {
    const adapter = createMockAdapter({
      updateSchema: vi.fn().mockRejectedValue(new Error('schema update failed')),
    });

    const { result } = renderHook(() => useSchemaDetail('schema-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.schema?.metadata.name).toBe('Schema One');

    await act(async () => {
      await expect(result.current.updateMetadata({ name: 'Broken Name' })).rejects.toMatchObject({
        message: 'schema update failed',
      });
    });

    expect(result.current.schema?.metadata.name).toBe('Schema One');
    expect(result.current.mutationError?.message).toBe('schema update failed');

    act(() => {
      result.current.clearMutationError();
    });
    expect(result.current.mutationError).toBeNull();
  });
});
