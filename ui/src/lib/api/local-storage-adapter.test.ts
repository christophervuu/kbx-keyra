import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalStorageAdapter } from '@/lib/api';
import type { CreateProjectInput, MappingConfig, SchemaRef } from '@/lib/types';

const SOURCE_SCHEMA_REF: SchemaRef = {
  schemaId: 'source-schema',
  type: 'local',
};

const TARGET_SCHEMA_REF: SchemaRef = {
  schemaId: 'target-schema',
  type: 'local',
};

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

function createStorageMock(): StorageLike {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
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

describe('LocalStorageAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
  });

  it('performs project CRUD operations', async () => {
    const adapter = new LocalStorageAdapter();

    const input: CreateProjectInput = {
      name: 'Project One',
      description: 'Desc',
      slug: 'project-one',
    };

    const created = await adapter.createProject(input);
    expect(created.name).toBe('Project One');

    const listed = await adapter.listProjects();
    expect(listed).toHaveLength(1);

    const detail = await adapter.getProject(created.projectId);
    expect(detail.projectId).toBe(created.projectId);

    const updated = await adapter.updateProject(created.projectId, { name: 'Project Two' });
    expect(updated.name).toBe('Project Two');

    await adapter.deleteProject(created.projectId);
    await expect(adapter.getProject(created.projectId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('performs schema CRUD operations', async () => {
    const adapter = new LocalStorageAdapter();

    const metadata = await adapter.createSchema({
      name: 'Invoice Schema',
      format: 'json-schema',
      origin: 'local',
      content: { type: 'object' },
      scope: 'project',
      description: 'Schema for invoice payloads',
      inferred: true,
      syncStatus: 'synced',
    });

    expect(metadata.scope).toBe('project');
    expect(metadata.description).toBe('Schema for invoice payloads');
    expect(metadata.inferred).toBe(true);
    expect(metadata.syncStatus).toBe('synced');

    const schemas = await adapter.listSchemas();
    expect(schemas).toHaveLength(1);

    const detail = await adapter.getSchema(metadata.schemaId);
    expect(detail.metadata.schemaId).toBe(metadata.schemaId);

    await adapter.deleteSchema(metadata.schemaId);
    await expect(adapter.getSchema(metadata.schemaId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('updateSchema merges partial updates for name, content, and scope', async () => {
    const adapter = new LocalStorageAdapter();

    const created = await adapter.createSchema({
      name: 'Original Name',
      format: 'json-schema',
      origin: 'local',
      content: { type: 'object', properties: { firstName: { type: 'string' } } },
    });

    const nameUpdated = await adapter.updateSchema(created.schemaId, {
      name: 'Renamed Schema',
    });

    expect(nameUpdated.name).toBe('Renamed Schema');
    expect(nameUpdated.scope).toBe('global');

    const scopeUpdated = await adapter.updateSchema(created.schemaId, {
      scope: 'project',
      description: 'Project-scoped schema',
    });

    expect(scopeUpdated.scope).toBe('project');
    expect(scopeUpdated.description).toBe('Project-scoped schema');

    const nextContent = {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        age: { type: 'number' },
      },
    };

    const contentUpdated = await adapter.updateSchema(created.schemaId, {
      content: nextContent,
      fieldCount: 2,
    });

    expect(contentUpdated.fieldCount).toBe(2);

    const detail = await adapter.getSchema(created.schemaId);
    expect(detail.content).toEqual(nextContent);
    expect(detail.metadata.name).toBe('Renamed Schema');
    expect(detail.metadata.scope).toBe('project');
  });

  it('updateSchema throws NOT_FOUND for unknown schema id', async () => {
    const adapter = new LocalStorageAdapter();

    await expect(
      adapter.updateSchema('missing-schema', { name: 'Does not exist' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('updateSchema refreshes updatedAt and sets updatedBy', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const adapter = new LocalStorageAdapter();

      const created = await adapter.createSchema({
        name: 'Timestamp Schema',
        format: 'json-schema',
        origin: 'local',
        content: { type: 'object' },
      });

      vi.setSystemTime(new Date('2026-01-01T00:01:00.000Z'));
      const updated = await adapter.updateSchema(created.schemaId, {
        description: 'Updated description',
      });

      expect(updated.updatedBy).toBe('local-user');
      expect(updated.updatedAt).toBe('2026-01-01T00:01:00.000Z');
      expect(updated.updatedAt).not.toBe(created.updatedAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it("updateSchema content changes move synced schema to 'local-changes'", async () => {
    const adapter = new LocalStorageAdapter();

    const created = await adapter.createSchema({
      name: 'Synced Schema',
      format: 'json-schema',
      origin: 'published',
      content: { type: 'object', properties: { id: { type: 'string' } } },
      syncStatus: 'synced',
    });

    const updated = await adapter.updateSchema(created.schemaId, {
      content: { type: 'object', properties: { id: { type: 'number' } } },
    });

    expect(updated.syncStatus).toBe('local-changes');
  });

  it('performs mapping create/list/get/update/delete and duplicate', async () => {
    const adapter = new LocalStorageAdapter();

    const project = await adapter.createProject({
      name: 'Project',
      description: 'desc',
      slug: 'project',
    });

    const created = await adapter.createMapping({
      projectId: project.projectId,
      name: 'Mapping A',
      sourceSchemaRef: SOURCE_SCHEMA_REF,
      targetSchemaRef: TARGET_SCHEMA_REF,
      rules: [{ target: 'A', type: 'string', expression: 'static("x")' }],
    });

    const listed = await adapter.listMappings(project.projectId);
    expect(listed).toHaveLength(1);

    const config = await adapter.getMapping(created.mappingId);
    expect(config.name).toBe('Mapping A');

    const updatedConfig: MappingConfig = {
      ...config,
      name: 'Mapping B',
      version: 2,
      rules: [{ target: 'A', type: 'string', expression: 'static("y")' }],
    };

    const updated = await adapter.updateMapping(created.mappingId, updatedConfig);
    expect(updated.name).toBe('Mapping B');
    expect(updated.version).toBe(2);

    const duplicate = await adapter.duplicateMapping(created.mappingId, 'Mapping C');
    expect(duplicate.mappingId).not.toBe(created.mappingId);
    expect(duplicate.name).toBe('Mapping C');

    await adapter.deleteMapping(created.mappingId);
    await expect(adapter.getMapping(created.mappingId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws offline error for AI and GitHub methods', async () => {
    const adapter = new LocalStorageAdapter();

    await expect(adapter.autoMap({ projectId: 'p', mappingId: 'm' })).rejects.toThrow(
      'Not available in offline mode',
    );
    await expect(adapter.listCdmSchemas()).rejects.toThrow('Not available in offline mode');
    await expect(
      adapter.previewOnServer('m', { environment: 'DEV', sourceData: {} }),
    ).rejects.toThrow('Not available in offline mode');
  });

  it('returns empty arrays for corrupted localStorage payloads', async () => {
    localStorage.setItem('keyra:projects', '{not-json');
    localStorage.setItem('keyra:schemas', '{broken');

    const adapter = new LocalStorageAdapter();

    const projects = await adapter.listProjects();
    const schemas = await adapter.listSchemas();

    expect(projects).toEqual([]);
    expect(schemas).toEqual([]);
  });

  it('querySchemaNodes returns empty array in offline mode', async () => {
    const adapter = new LocalStorageAdapter();
    const result = await adapter.querySchemaNodes('schema', 'field');

    expect(result).toEqual([]);
  });

  it('listActivity reads stored activity and applies project/limit filters', async () => {
    localStorage.setItem(
      'keyra:activity',
      JSON.stringify([
        {
          id: '1',
          type: 'info',
          message: 'a',
          timestamp: '2026-01-01T00:00:00.000Z',
          projectId: 'p1',
        },
        {
          id: '2',
          type: 'info',
          message: 'b',
          timestamp: '2026-01-02T00:00:00.000Z',
          projectId: 'p2',
        },
      ]),
    );

    const adapter = new LocalStorageAdapter();

    const filtered = await adapter.listActivity('p1');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].projectId).toBe('p1');

    const limited = await adapter.listActivity(undefined, 1);
    expect(limited).toHaveLength(1);
    expect(limited[0].id).toBe('2');
  });
});
