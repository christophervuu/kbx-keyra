import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalStorageAdapter } from '@/lib/api';
import type { CreateProjectInput, MappingConfig, MappingVersionEntry, SchemaRef } from '@/lib/types';

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

function makeMappingVersionEntry(mappingId: string, version: number): MappingVersionEntry {
  const config: MappingConfig = {
    id: mappingId,
    projectId: 'project-1',
    name: `Mapping v${version}`,
    version,
    engineVersion: '2.0.0',
    config: {},
    rules: [{ target: `Target.${version}`, type: 'string', expression: `static("${version}")` }],
  };

  return {
    version,
    savedAt: `2026-01-01T00:${String(version).padStart(2, '0')}:00.000Z`,
    savedBy: 'You',
    ruleCount: config.rules.length,
    config,
  };
}

function makeMappingConfig(mappingId: string, projectId: string, version: number, expression: string): MappingConfig {
  return {
    id: mappingId,
    projectId,
    name: 'Mapping A',
    version,
    engineVersion: '2.0.0',
    sourceSchemaRef: SOURCE_SCHEMA_REF,
    targetSchemaRef: TARGET_SCHEMA_REF,
    config: {},
    rules: [{ target: 'A', type: 'string', expression }],
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

  it.each([
    ['autoMap', (adapter: LocalStorageAdapter) => adapter.autoMap({ projectId: 'p', mappingId: 'm' })],
    [
      'autoMapSection',
      (adapter: LocalStorageAdapter) =>
        adapter.autoMapSection({
          projectId: 'p',
          mappingId: 'm',
          sectionPath: 'Order.Header',
        }),
    ],
    [
      'suggestExpression',
      (adapter: LocalStorageAdapter) =>
        adapter.suggestExpression({
          mappingId: 'm',
          instruction: 'copy',
          targetPath: 'Order.Total',
          targetType: 'string',
        }),
    ],
    [
      'explainRule',
      (adapter: LocalStorageAdapter) =>
        adapter.explainRule({
          targetPath: 'Order.Total',
          expression: 'source("Invoice.Total")',
        }),
    ],
    [
      'smartFix',
      (adapter: LocalStorageAdapter) =>
        adapter.smartFix({
          mappingId: 'm',
          ruleIndex: 0,
          targetPath: 'Order.Total',
          failingExpression: 'source("Invoice.Total")',
          diagnostics: [{ code: 'KEYRA-E001', severity: 'error', message: 'Invalid expression' }],
        }),
    ],
    ['validateMappings', (adapter: LocalStorageAdapter) => adapter.validateMappings({ mappingIds: ['m'] })],
    ['listCdmSchemas', (adapter: LocalStorageAdapter) => adapter.listCdmSchemas()],
    [
      'previewOnServer',
      (adapter: LocalStorageAdapter) =>
        adapter.previewOnServer('m', { environment: 'DEV', sourceData: {} }),
    ],
  ])('%s uses canonical offline unsupported behavior', async (_method, invoke) => {
    const adapter = new LocalStorageAdapter();

    await expect(invoke(adapter)).rejects.toThrow('Not available in offline mode');
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

  it('normalizes missing schema origin to local when listing schemas', async () => {
    const baseMetadata = {
      schemaId: 'schema-legacy-missing-origin',
      name: 'Legacy Missing Origin',
      format: 'json-schema',
      fieldCount: 1,
      status: 'ready',
      scope: 'global',
      syncStatus: 'not-synced',
      source: { type: 'upload' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    localStorage.setItem(
      'keyra:schemas',
      JSON.stringify([
        {
          metadata: baseMetadata,
          detail: {
            metadata: baseMetadata,
            content: { type: 'object' },
          },
        },
      ]),
    );

    const adapter = new LocalStorageAdapter();
    const schemas = await adapter.listSchemas();

    expect(schemas).toHaveLength(1);
    expect(schemas[0].origin).toBe('local');
  });

  it('normalizes invalid schema origin to local when loading schema detail', async () => {
    const metadataWithInvalidOrigin = {
      schemaId: 'schema-legacy-invalid-origin',
      name: 'Legacy Invalid Origin',
      format: 'json-schema',
      fieldCount: 1,
      origin: 'legacy-origin',
      status: 'ready',
      scope: 'global',
      syncStatus: 'not-synced',
      source: { type: 'upload' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    localStorage.setItem(
      'keyra:schemas',
      JSON.stringify([
        {
          metadata: metadataWithInvalidOrigin,
          detail: {
            metadata: metadataWithInvalidOrigin,
            content: { type: 'object' },
          },
        },
      ]),
    );

    const adapter = new LocalStorageAdapter();
    const detail = await adapter.getSchema('schema-legacy-invalid-origin');

    expect(detail.metadata.origin).toBe('local');
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

  it('saveMappingVersion stores an entry retrievable by getMappingVersion', async () => {
    const adapter = new LocalStorageAdapter();
    const entry = makeMappingVersionEntry('mapping-1', 1);

    await adapter.saveMappingVersion('mapping-1', entry);

    await expect(adapter.getMappingVersion('mapping-1', 1)).resolves.toEqual(entry);
  });

  it('saveMapping returns noChange=true for unchanged config', async () => {
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

    const config = makeMappingConfig(created.mappingId, project.projectId, 1, 'static("x")');
    const firstSave = await adapter.saveMapping(created.mappingId, config);
    const secondSave = await adapter.saveMapping(created.mappingId, config);

    expect(firstSave).toMatchObject({ revision: 1, noChange: false });
    expect(secondSave).toMatchObject({ revision: 1, noChange: true });
  });

  it('saveMapping increments revision when config changes', async () => {
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

    const save1 = await adapter.saveMapping(created.mappingId, makeMappingConfig(created.mappingId, project.projectId, 1, 'static("x")'));
    const save2 = await adapter.saveMapping(created.mappingId, makeMappingConfig(created.mappingId, project.projectId, 1, 'static("y")'));

    expect(save1.revision).toBe(1);
    expect(save2.revision).toBe(2);
    expect(save2.noChange).toBe(false);
  });

  it('createVersion points to latest revision and list/get revisions descend', async () => {
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

    await adapter.saveMapping(created.mappingId, makeMappingConfig(created.mappingId, project.projectId, 1, 'static("x")'));
    await adapter.saveMapping(created.mappingId, makeMappingConfig(created.mappingId, project.projectId, 1, 'static("y")'));

    const version = await adapter.createVersion(created.mappingId);
    expect(version.revisionNumber).toBe(2);

    const revisions = await adapter.listRevisions(created.mappingId);
    expect(revisions.map((r) => r.revision)).toEqual([2, 1]);

    const revision = await adapter.getRevision(created.mappingId, 2);
    expect(revision.revision).toBe(2);
    expect(revision.config.rules[0]?.expression).toBe('static("y")');
  });

  it('listVersions returns versions descending with revisionNumber', async () => {
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

    await adapter.saveMapping(created.mappingId, makeMappingConfig(created.mappingId, project.projectId, 1, 'static("x")'));
    await adapter.createVersion(created.mappingId);
    await adapter.saveMapping(created.mappingId, makeMappingConfig(created.mappingId, project.projectId, 1, 'static("y")'));
    await adapter.createVersion(created.mappingId);

    const versions = await adapter.listVersions(created.mappingId);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[0]?.revisionNumber).toBe(2);
    expect(versions[1]?.revisionNumber).toBe(1);
  });

  it('saveMappingVersion appends without overwriting previous entries', async () => {
    const adapter = new LocalStorageAdapter();

    await adapter.saveMappingVersion('mapping-1', makeMappingVersionEntry('mapping-1', 1));
    await adapter.saveMappingVersion('mapping-1', makeMappingVersionEntry('mapping-1', 2));

    const versions = await adapter.listMappingVersions('mapping-1');
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
  });

  it('listMappingVersions returns entries sorted by version descending', async () => {
    const adapter = new LocalStorageAdapter();

    await adapter.saveMappingVersion('mapping-1', makeMappingVersionEntry('mapping-1', 3));
    await adapter.saveMappingVersion('mapping-1', makeMappingVersionEntry('mapping-1', 1));
    await adapter.saveMappingVersion('mapping-1', makeMappingVersionEntry('mapping-1', 2));

    const versions = await adapter.listMappingVersions('mapping-1');
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it('prunes oldest entries when more than 50 versions are stored', async () => {
    const adapter = new LocalStorageAdapter();

    for (let version = 1; version <= 51; version += 1) {
      await adapter.saveMappingVersion('mapping-1', makeMappingVersionEntry('mapping-1', version));
    }

    const versions = await adapter.listMappingVersions('mapping-1');
    expect(versions).toHaveLength(50);
    expect(versions[0].version).toBe(51);
    expect(versions[49].version).toBe(2);
    await expect(adapter.getMappingVersion('mapping-1', 1)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('getMappingVersion throws NOT_FOUND for non-existent version', async () => {
    const adapter = new LocalStorageAdapter();

    await adapter.saveMappingVersion('mapping-1', makeMappingVersionEntry('mapping-1', 1));

    await expect(adapter.getMappingVersion('mapping-1', 99)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('listMappingVersions returns empty array when no history exists', async () => {
    const adapter = new LocalStorageAdapter();

    await expect(adapter.listMappingVersions('mapping-unknown')).resolves.toEqual([]);
  });

  it('version entries are isolated per mapping', async () => {
    const adapter = new LocalStorageAdapter();

    await adapter.saveMappingVersion('mapping-A', makeMappingVersionEntry('mapping-A', 1));
    await adapter.saveMappingVersion('mapping-B', makeMappingVersionEntry('mapping-B', 1));
    await adapter.saveMappingVersion('mapping-B', makeMappingVersionEntry('mapping-B', 2));

    const versionsA = await adapter.listMappingVersions('mapping-A');
    const versionsB = await adapter.listMappingVersions('mapping-B');

    expect(versionsA.map((v) => v.version)).toEqual([1]);
    expect(versionsB.map((v) => v.version)).toEqual([2, 1]);
  });

  it('deleteMapping removes associated version history key', async () => {
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
    });

    await adapter.saveMappingVersion(
      created.mappingId,
      makeMappingVersionEntry(created.mappingId, 1),
    );
    await adapter.saveMapping(created.mappingId, makeMappingConfig(created.mappingId, project.projectId, 1, 'static("x")'));

    await adapter.deleteMapping(created.mappingId);
    await expect(adapter.listMappingVersions(created.mappingId)).resolves.toEqual([]);
    await expect(adapter.listRevisions(created.mappingId)).resolves.toEqual([]);
  });

  it('deployMapping enforces revision->DEV rule and writes deployment history', async () => {
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

    await adapter.saveMapping(created.mappingId, makeMappingConfig(created.mappingId, project.projectId, 1, 'static("x")'));
    await adapter.createVersion(created.mappingId);

    await expect(
      adapter.deployMapping(created.mappingId, {
        environment: 'QA',
        sourceType: 'revision',
        sourceNumber: 1,
      }),
    ).rejects.toMatchObject({ code: 'REVISION_NOT_DEPLOYABLE_TO_ENV' });

    const deployed = await adapter.deployMapping(created.mappingId, {
      environment: 'DEV',
      sourceType: 'revision',
      sourceNumber: 1,
    });

    expect(deployed.sourceType).toBe('revision');
    expect(deployed.sourceNumber).toBe(1);

    const history = await adapter.listDeployments(created.mappingId, { environment: 'DEV' });
    expect(history).toHaveLength(1);
    expect(history[0].environment).toBe('DEV');
  });

  it('promoteDeployment requires version-backed source', async () => {
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

    await adapter.saveMapping(created.mappingId, makeMappingConfig(created.mappingId, project.projectId, 1, 'static("x")'));
    await adapter.createVersion(created.mappingId);

    await adapter.deployMapping(created.mappingId, {
      environment: 'DEV',
      sourceType: 'revision',
      sourceNumber: 1,
    });

    await expect(
      adapter.promoteDeployment(created.mappingId, {
        fromEnvironment: 'DEV',
        toEnvironment: 'QA',
      }),
    ).rejects.toThrow('Promotion requires a version-backed source deployment');

    await adapter.deployMapping(created.mappingId, {
      environment: 'DEV',
      sourceType: 'version',
      sourceNumber: 1,
    });

    const promoted = await adapter.promoteDeployment(created.mappingId, {
      fromEnvironment: 'DEV',
      toEnvironment: 'QA',
    });

    expect(promoted.sourceType).toBe('version');
    expect(promoted.promotedFrom).toBe('DEV');
  });

  it('rollbackDeployment creates rollback entry and current staleness summary', async () => {
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

    await adapter.saveMapping(created.mappingId, makeMappingConfig(created.mappingId, project.projectId, 1, 'static("x")'));
    await adapter.createVersion(created.mappingId);
    await adapter.saveMapping(created.mappingId, makeMappingConfig(created.mappingId, project.projectId, 1, 'static("y")'));
    await adapter.createVersion(created.mappingId);

    const qaV1 = await adapter.deployMapping(created.mappingId, {
      environment: 'QA',
      sourceType: 'version',
      sourceNumber: 1,
    });

    await adapter.deployMapping(created.mappingId, {
      environment: 'QA',
      sourceType: 'version',
      sourceNumber: 2,
    });

    const rollback = await adapter.rollbackDeployment(created.mappingId, {
      environment: 'QA',
      deploymentSK: qaV1.environmentDeployedAt,
    });

    expect(rollback.rollbackOf).toBe(qaV1.environmentDeployedAt);
    expect(rollback.sourceNumber).toBe(1);

    const current = await adapter.getCurrentDeployments(created.mappingId);
    expect(current.QA.deployment?.sourceNumber).toBe(1);
    expect(current.QA.status).toBe('stale');
    expect(current.DEV.status).toBe('not-deployed');
    expect(current.PROD.status).toBe('not-deployed');
  });
});
