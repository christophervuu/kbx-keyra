import { describe, expect, it, vi } from 'vitest';

import { importLocalMappingsToBackend } from './local-mapping-import';
import type { ApiAdapter } from './types';

import type { MappingConfig, MappingMetadata, MappingSaveResult, MappingVersion } from '@/lib/types';

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function makeBackendConfig(mappingId: string, version: number): MappingConfig {
  return {
    id: mappingId,
    projectId: 'proj-1',
    name: 'Invoice Mapping',
    version,
    engineVersion: '2.0.0',
    config: {},
    rules: [],
  };
}

function makeVersion(version: number): MappingVersion {
  return {
    version,
    revisionNumber: version,
    createdAt: '2026-06-25T00:00:00.000Z',
    createdBy: 'system',
  };
}

function notFoundError() {
  return {
    code: 'NOT_FOUND',
    statusCode: 404,
    message: 'Mapping not found',
  };
}

describe('importLocalMappingsToBackend', () => {
  it('imports valid local mapping, preserves rule expressions, and ensures saved version exists', async () => {
    const storage = createStorageMock();
    storage.setItem('keyra:mappings', JSON.stringify([
      {
        metadata: {
          mappingId: 'local-1',
          projectId: 'proj-1',
          name: 'Invoice Mapping',
        },
        config: {
          id: 'local-1',
          projectId: 'proj-1',
          name: 'Invoice Mapping',
          version: 5,
          engineVersion: '2.0.0',
          sourceSchemaRef: { schemaId: 'src-1', type: 'local' },
          targetSchemaRef: { schemaId: 'tgt-1', type: 'local' },
          config: { externalSources: ['legacyAlias'] },
          rules: [
            { target: 'Invoice.Id', type: 'string', expression: 'source("invoice.id")' },
          ],
        },
      },
    ]));

    const createMapping = vi.fn<(...args: unknown[]) => Promise<MappingMetadata>>()
      .mockResolvedValue({
        mappingId: 'remote-1',
        projectId: 'proj-1',
        name: 'Invoice Mapping',
        version: 1,
        status: 'draft',
        ruleCount: 1,
        coverage: 0,
        updatedAt: '2026-06-25T00:00:00.000Z',
      });

    const getMapping = vi.fn<(...args: unknown[]) => Promise<MappingConfig>>()
      .mockRejectedValueOnce(notFoundError())
      .mockRejectedValueOnce(notFoundError())
      .mockResolvedValueOnce(makeBackendConfig('remote-1', 1));

    const saveMapping = vi.fn<(...args: unknown[]) => Promise<MappingSaveResult>>()
      .mockResolvedValue({ revision: 2, noChange: false });

    const listVersions = vi.fn<(...args: unknown[]) => Promise<MappingVersion[]>>()
      .mockResolvedValue([]);

    const createVersion = vi.fn<(...args: unknown[]) => Promise<MappingVersion>>()
      .mockResolvedValue(makeVersion(1));

    const adapter = {
      createMapping,
      getMapping,
      saveMapping,
      listVersions,
      createVersion,
    } as unknown as ApiAdapter;

    const summary = await importLocalMappingsToBackend(adapter, 'proj-1', storage as unknown as Storage);

    expect(summary).toEqual({
      imported: 1,
      skipped: 0,
      failed: 0,
      issues: [],
    });

    expect(saveMapping).toHaveBeenCalledWith('remote-1', expect.objectContaining({
      id: 'remote-1',
      projectId: 'proj-1',
      version: 1,
      rules: [
        expect.objectContaining({ expression: 'source("invoice.id")' }),
      ],
    }));
    expect(createVersion).toHaveBeenCalledWith('remote-1');
  });

  it('is idempotent on rerun via manifest and reports ALREADY_IMPORTED skip', async () => {
    const storage = createStorageMock();
    storage.setItem('keyra:mappings', JSON.stringify([
      {
        metadata: {
          mappingId: 'local-1',
          projectId: 'proj-1',
          name: 'Invoice Mapping',
        },
        config: {
          id: 'local-1',
          projectId: 'proj-1',
          name: 'Invoice Mapping',
          version: 1,
          engineVersion: '2.0.0',
          config: {},
          rules: [],
        },
      },
    ]));
    storage.setItem('keyra:backend-mapping-import-manifest:v1', JSON.stringify({
      'proj-1': {
        'local-1': 'remote-1',
      },
    }));

    const adapter = {
      getMapping: vi.fn<(...args: unknown[]) => Promise<MappingConfig>>().mockResolvedValue(makeBackendConfig('remote-1', 3)),
      saveMapping: vi.fn<(...args: unknown[]) => Promise<MappingSaveResult>>().mockResolvedValue({ revision: 3, noChange: true }),
      listVersions: vi.fn<(...args: unknown[]) => Promise<MappingVersion[]>>().mockResolvedValue([makeVersion(1)]),
      createVersion: vi.fn<(...args: unknown[]) => Promise<MappingVersion>>().mockResolvedValue(makeVersion(2)),
      createMapping: vi.fn(),
    } as unknown as ApiAdapter;

    const summary = await importLocalMappingsToBackend(adapter, 'proj-1', storage as unknown as Storage);

    expect(summary.imported).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.issues[0]?.code).toBe('ALREADY_IMPORTED');
    expect((adapter.createMapping as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((adapter.createVersion as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('reports invalid legacy rules as failed with actionable issue', async () => {
    const storage = createStorageMock();
    storage.setItem('keyra:mappings', JSON.stringify([
      {
        metadata: {
          mappingId: 'bad-1',
          projectId: 'proj-1',
          name: 'Broken Mapping',
        },
        config: {
          id: 'bad-1',
          projectId: 'proj-1',
          name: 'Broken Mapping',
          version: 1,
          engineVersion: '2.0.0',
          config: {},
          rules: [{ target: 'A', type: 'string' }],
        },
      },
    ]));

    const adapter = {} as ApiAdapter;

    const summary = await importLocalMappingsToBackend(adapter, 'proj-1', storage as unknown as Storage);

    expect(summary.imported).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.issues[0]).toMatchObject({
      code: 'INVALID_RULE',
      localMappingId: 'bad-1',
    });
  });

  it('skips local records from other projects with PROJECT_MISMATCH summary', async () => {
    const storage = createStorageMock();
    storage.setItem('keyra:mappings', JSON.stringify([
      {
        metadata: {
          mappingId: 'other-project-1',
          projectId: 'proj-2',
          name: 'Other Project Mapping',
        },
        config: {
          id: 'other-project-1',
          projectId: 'proj-2',
          name: 'Other Project Mapping',
          version: 1,
          engineVersion: '2.0.0',
          config: {},
          rules: [],
        },
      },
    ]));

    const adapter = {} as ApiAdapter;
    const summary = await importLocalMappingsToBackend(adapter, 'proj-1', storage as unknown as Storage);

    expect(summary.imported).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.issues[0]).toMatchObject({
      code: 'PROJECT_MISMATCH',
      localMappingId: 'other-project-1',
    });
  });
});
