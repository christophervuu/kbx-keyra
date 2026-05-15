import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useSchemaDetail } from '../use-schema-detail';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { SchemaDetail, SchemaMetadata } from '@/lib/types/domain';

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
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(AdapterProvider, { adapter }, children);
  };
}

describe('useSchemaDetail optimistic metadata updates', () => {
  it('optimistically updates metadata and keeps value on success', async () => {
    let resolveUpdate!: (value: SchemaMetadata) => void;
    const adapter = createMockAdapter({
      updateSchema: vi.fn().mockImplementation(
        () =>
          new Promise<SchemaMetadata>((resolve) => {
            resolveUpdate = resolve;
          }),
      ),
    });

    const { result } = renderHook(() => useSchemaDetail('schema-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.schema?.metadata.name).toBe('Schema One');

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.updateMetadata({ name: 'Schema Updated' });
    });

    // Optimistic render before request resolves
    expect(result.current.schema?.metadata.name).toBe('Schema Updated');

    await act(async () => {
      resolveUpdate({ ...SCHEMA_DETAIL.metadata, name: 'Schema Updated' });
      await pending;
    });

    expect(result.current.schema?.metadata.name).toBe('Schema Updated');
    expect(result.current.mutationError).toBeNull();
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
