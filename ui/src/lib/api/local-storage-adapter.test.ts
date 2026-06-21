import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalStorageAdapter } from '@/lib/api';
import { executeMapping } from '@/lib/engine';
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
    expect(detail.linkedSchemaIds).toEqual([]);

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
    expect(schemas.length).toBeGreaterThan(1);
    expect(schemas.some((schema) => schema.schemaId === metadata.schemaId)).toBe(true);
    const seededCdm = schemas.filter((schema) => schema.origin === 'cdm');
    expect(seededCdm.length).toBeGreaterThan(0);
    expect(seededCdm.every((schema) => schema.ownership === 'cdm' && schema.readonly === true)).toBe(true);

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
    expect(nameUpdated.scope).toBeUndefined();

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

  it("updateSchema content changes move synced schema to 'sync-failed'", async () => {
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

    expect(updated.syncStatus).toBe('sync-failed');
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
      businessContext: 'Transform source invoice model to target shipment contract.',
      sourceSchemaRef: SOURCE_SCHEMA_REF,
      targetSchemaRef: TARGET_SCHEMA_REF,
      enrichmentSources: [{ alias: 'customerProfile', schemaId: 'schema-customer', required: true }],
      config: { externalSources: ['legacyAlias'] },
      rules: [{ target: 'A', type: 'string', expression: 'static("x")' }],
    });

    const listed = await adapter.listMappings(project.projectId);
    expect(listed).toHaveLength(1);

    const config = await adapter.getMapping(created.mappingId);
    expect(config.name).toBe('Mapping A');
    expect(config.businessContext).toBe('Transform source invoice model to target shipment contract.');
    expect(config.enrichmentSources).toEqual([{ alias: 'customerProfile', schemaId: 'schema-customer', required: true }]);
    expect(config.config.externalSources).toEqual(['customerProfile', 'legacyAlias']);
    expect(created.enrichmentSources).toEqual([{ alias: 'customerProfile', schemaId: 'schema-customer', required: true }]);
    expect(created.businessContext).toBe('Transform source invoice model to target shipment contract.');

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
    expect(duplicate.businessContext).toBe('Transform source invoice model to target shipment contract.');

    await adapter.deleteMapping(created.mappingId);
    await expect(adapter.getMapping(created.mappingId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('createMapping omits businessContext when not provided', async () => {
    const adapter = new LocalStorageAdapter();
    const project = await adapter.createProject({
      name: 'Project',
      description: 'desc',
      slug: 'project',
    });

    const created = await adapter.createMapping({
      projectId: project.projectId,
      name: 'No Context Mapping',
      sourceSchemaRef: SOURCE_SCHEMA_REF,
      targetSchemaRef: TARGET_SCHEMA_REF,
    });

    const config = await adapter.getMapping(created.mappingId);
    expect(created.businessContext).toBeUndefined();
    expect(config.businessContext).toBeUndefined();
  });

  it('normalizes legacy-only config.externalSources to schema-less enrichment aliases', async () => {
    const adapter = new LocalStorageAdapter();
    const project = await adapter.createProject({
      name: 'Project',
      description: 'desc',
      slug: 'project',
    });

    const created = await adapter.createMapping({
      projectId: project.projectId,
      name: 'Legacy Externals Mapping',
      sourceSchemaRef: SOURCE_SCHEMA_REF,
      targetSchemaRef: TARGET_SCHEMA_REF,
      config: { externalSources: ['legacyAlias'] },
    });

    const config = await adapter.getMapping(created.mappingId);
    expect(config.enrichmentSources).toEqual([{ alias: 'legacyAlias', required: false }]);
    expect(config.config.externalSources).toEqual(['legacyAlias']);
    expect(created.enrichmentSources).toEqual([{ alias: 'legacyAlias', required: false }]);
  });

  it('creates project value table and resolves pinned reference entries', async () => {
    const adapter = new LocalStorageAdapter();
    const project = await adapter.createProject({
      name: 'Project',
      description: 'desc',
      slug: 'project',
    });

    const table = await adapter.createProjectValueTable({
      projectId: project.projectId,
      key: 'order-status',
      name: 'Order Status Codes',
      sideA: { key: 'oms-status', label: 'OMS Status', type: 'string' },
      sideB: { key: 'cdm-status', label: 'CDM Status', type: 'string' },
      rows: [
        { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
        { id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETED' },
      ],
    });

    const listed = await adapter.listProjectValueTables(project.projectId);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(table.id);

    const resolved = await adapter.resolveProjectValueTableReference({
      projectId: project.projectId,
      valueTableId: table.id,
      tableKey: 'order-status',
      revision: 1,
      inputSideKey: 'oms-status',
      outputSideKey: 'cdm-status',
    });

    expect(resolved.ref.valueTableId).toBe(table.id);
    expect(resolved.ref.revision).toBe(1);
    expect(resolved.ref.resolvedEntries).toEqual([
      { in: 'confirmed', out: 'OPEN', rowId: 'r1' },
      { in: 'shipped', out: 'COMPLETED', rowId: 'r2' },
    ]);
  });

  it('returns paginated value-table revision diff with full summary', async () => {
    const adapter = new LocalStorageAdapter();
    const project = await adapter.createProject({
      name: 'Project',
      description: 'desc',
      slug: 'project',
    });

    const table = await adapter.createProjectValueTable({
      projectId: project.projectId,
      key: 'order-status',
      name: 'Order Status Codes',
      sideA: { key: 'oms-status', label: 'OMS Status', type: 'string' },
      sideB: { key: 'cdm-status', label: 'CDM Status', type: 'string' },
      rows: [
        { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
        { id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETED' },
      ],
    });

    await adapter.createProjectValueTableRevision(table.id, {
      valueTableId: table.id,
      sideA: { key: 'oms-status', label: 'OMS Status', type: 'string' },
      sideB: { key: 'cdm-status', label: 'CDM Status', type: 'string' },
      rows: [
        { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
        { id: 'r2', sideAValue: 'shipped', sideBValue: 'DONE' },
        { id: 'r3', sideAValue: 'cancelled', sideBValue: 'CANCELLED' },
      ],
    });

    const page1 = await adapter.getProjectValueTableRevisionDiff(table.id, 1, 2, { pageSize: 1 });
    expect(page1.summary.counts).toEqual({ added: 1, removed: 0, changed: 1, unchanged: 1 });
    expect(page1.changes).toHaveLength(1);
    expect(page1.nextCursor).toBe('1');

    const page2 = await adapter.getProjectValueTableRevisionDiff(table.id, 1, 2, {
      pageSize: 1,
      cursor: page1.nextCursor,
    });
    expect(page2.summary.counts).toEqual({ added: 1, removed: 0, changed: 1, unchanged: 1 });
    expect(page2.changes).toHaveLength(1);
  });

  it('enforces value-table key uniqueness within a project', async () => {
    const adapter = new LocalStorageAdapter();
    const project = await adapter.createProject({
      name: 'Project',
      description: 'desc',
      slug: 'project',
    });

    await adapter.createProjectValueTable({
      projectId: project.projectId,
      key: 'order-status',
      name: 'Order Status Codes',
      sideA: { key: 'oms-status', label: 'OMS Status', type: 'string' },
      sideB: { key: 'cdm-status', label: 'CDM Status', type: 'string' },
      rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
    });

    await expect(
      adapter.createProjectValueTable({
        projectId: project.projectId,
        key: 'order-status',
        name: 'Duplicate Key Table',
        sideA: { key: 'a', label: 'A', type: 'string' },
        sideB: { key: 'b', label: 'B', type: 'string' },
        rows: [{ id: 'r2', sideAValue: 'x', sideBValue: 'y' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('requires explicit adoption and does not silently repin pinned revisions', async () => {
    const adapter = new LocalStorageAdapter();
    const project = await adapter.createProject({
      name: 'Project',
      description: 'desc',
      slug: 'project',
    });

    const table = await adapter.createProjectValueTable({
      projectId: project.projectId,
      key: 'order-status',
      name: 'Order Status Codes',
      sideA: { key: 'oms-status', label: 'OMS Status', type: 'string' },
      sideB: { key: 'cdm-status', label: 'CDM Status', type: 'string' },
      rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
    });

    const resolvedRevision1 = await adapter.resolveProjectValueTableReference({
      projectId: project.projectId,
      valueTableId: table.id,
      tableKey: table.key,
      revision: 1,
      inputSideKey: 'oms-status',
      outputSideKey: 'cdm-status',
    });

    const mapping = await adapter.createMapping({
      projectId: project.projectId,
      name: 'Mapping A',
      sourceSchemaRef: SOURCE_SCHEMA_REF,
      targetSchemaRef: TARGET_SCHEMA_REF,
      rules: [
        {
          target: 'Order.status',
          type: 'string',
          expression: 'valueMap(source("status"), valueTable("order-status", "oms-status", "cdm-status"), "UNKNOWN")',
          valueTableRef: resolvedRevision1.ref,
          noMatchBehavior: {
            mode: 'fallback_value',
            fallbackValue: 'UNKNOWN',
          },
        },
      ],
    });

    await adapter.createProjectValueTableRevision(table.id, {
      valueTableId: table.id,
      sideA: { key: 'oms-status', label: 'OMS Status', type: 'string' },
      sideB: { key: 'cdm-status', label: 'CDM Status', type: 'string' },
      rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'COMPLETED' }],
    });

    const usage = await adapter.listProjectValueTableUsage(table.id);
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      mappingId: mapping.mappingId,
      pinnedRevision: 1,
      latestRevision: 2,
      newerRevisionAvailable: true,
    });

    const loaded = await adapter.getMapping(mapping.mappingId);
    const ref = loaded.rules[0]?.valueTableRef;
    expect(ref?.scope).toBe('project');
    if (ref?.scope === 'project') {
      expect(ref.revision).toBe(1);
      expect(ref.resolvedEntries).toEqual([{ in: 'confirmed', out: 'OPEN', rowId: 'r1' }]);
    }

    const execution = executeMapping(
      loaded,
      { status: 'confirmed' },
      { type: 'object' },
      { type: 'object' },
    );
    expect(execution.output).toEqual({ Order: { status: 'OPEN' } });
  });

  it('blocks creating revisions and resolving references for archived tables', async () => {
    const adapter = new LocalStorageAdapter();
    const project = await adapter.createProject({
      name: 'Project',
      description: 'desc',
      slug: 'project',
    });

    const table = await adapter.createProjectValueTable({
      projectId: project.projectId,
      key: 'order-status',
      name: 'Order Status Codes',
      sideA: { key: 'oms-status', label: 'OMS Status', type: 'string' },
      sideB: { key: 'cdm-status', label: 'CDM Status', type: 'string' },
      rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
    });

    await adapter.archiveProjectValueTable(table.id);

    await expect(
      adapter.createProjectValueTableRevision(table.id, {
        valueTableId: table.id,
        sideA: { key: 'oms-status', label: 'OMS Status', type: 'string' },
        sideB: { key: 'cdm-status', label: 'CDM Status', type: 'string' },
        rows: [{ id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETED' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    await expect(
      adapter.resolveProjectValueTableReference({
        projectId: project.projectId,
        valueTableId: table.id,
        tableKey: table.key,
        revision: 1,
        inputSideKey: 'oms-status',
        outputSideKey: 'cdm-status',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('adopting newer revision updates execution behavior after explicit repin', async () => {
    const adapter = new LocalStorageAdapter();
    const project = await adapter.createProject({
      name: 'Project',
      description: 'desc',
      slug: 'project',
    });

    const table = await adapter.createProjectValueTable({
      projectId: project.projectId,
      key: 'order-status',
      name: 'Order Status Codes',
      sideA: { key: 'oms-status', label: 'OMS Status', type: 'string' },
      sideB: { key: 'cdm-status', label: 'CDM Status', type: 'string' },
      rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
    });

    const refRevision1 = await adapter.resolveProjectValueTableReference({
      projectId: project.projectId,
      valueTableId: table.id,
      tableKey: table.key,
      revision: 1,
      inputSideKey: 'oms-status',
      outputSideKey: 'cdm-status',
    });

    const mapping = await adapter.createMapping({
      projectId: project.projectId,
      name: 'Mapping A',
      sourceSchemaRef: SOURCE_SCHEMA_REF,
      targetSchemaRef: TARGET_SCHEMA_REF,
      rules: [
        {
          target: 'Order.status',
          type: 'string',
          expression: 'valueMap(source("status"), valueTable("order-status", "oms-status", "cdm-status"), "UNKNOWN")',
          valueTableRef: refRevision1.ref,
          noMatchBehavior: {
            mode: 'fallback_value',
            fallbackValue: 'UNKNOWN',
          },
        },
      ],
    });

    await adapter.createProjectValueTableRevision(table.id, {
      valueTableId: table.id,
      sideA: { key: 'oms-status', label: 'OMS Status', type: 'string' },
      sideB: { key: 'cdm-status', label: 'CDM Status', type: 'string' },
      rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'COMPLETED' }],
    });

    const pinnedBeforeAdoption = await adapter.getMapping(mapping.mappingId);
    const executionBefore = executeMapping(
      pinnedBeforeAdoption,
      { status: 'confirmed' },
      { type: 'object' },
      { type: 'object' },
    );
    expect(executionBefore.output).toEqual({ Order: { status: 'OPEN' } });

    const refRevision2 = await adapter.resolveProjectValueTableReference({
      projectId: project.projectId,
      valueTableId: table.id,
      tableKey: table.key,
      revision: 2,
      inputSideKey: 'oms-status',
      outputSideKey: 'cdm-status',
    });

    const loaded = await adapter.getMapping(mapping.mappingId);
    const [firstRule] = loaded.rules;
    if (!firstRule) {
      throw new Error('Expected mapping rule for adoption test.');
    }

    const saveResult = await adapter.saveMapping(mapping.mappingId, {
      ...loaded,
      rules: [
        {
          ...firstRule,
          valueTableRef: refRevision2.ref,
        },
      ],
    });

    expect(saveResult.noChange).toBe(false);

    const pinnedAfterAdoption = await adapter.getMapping(mapping.mappingId);
    const adoptedRef = pinnedAfterAdoption.rules[0]?.valueTableRef;
    expect(adoptedRef?.scope).toBe('project');
    if (adoptedRef?.scope === 'project') {
      expect(adoptedRef.revision).toBe(2);
    }

    const executionAfter = executeMapping(
      pinnedAfterAdoption,
      { status: 'confirmed' },
      { type: 'object' },
      { type: 'object' },
    );
    expect(executionAfter.output).toEqual({ Order: { status: 'COMPLETED' } });
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
    ['validateMappings', (adapter: LocalStorageAdapter) => adapter.validateMappings({ mappingId: 'm' })],
    ['listCdmSchemas', (adapter: LocalStorageAdapter) => adapter.listCdmSchemas()],
    ['syncAllCdmSchemas', (adapter: LocalStorageAdapter) => adapter.syncAllCdmSchemas()],
    [
      'previewOnServer',
      (adapter: LocalStorageAdapter) =>
        adapter.previewOnServer('m', { environment: 'DEV', sourceData: {}, externalSources: {} }),
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
    expect(schemas.length).toBeGreaterThan(0);
    expect(schemas.every((schema) => schema.origin === 'cdm')).toBe(true);
  });

  it('normalizes missing schema origin to uploaded when listing schemas', async () => {
    const baseMetadata = {
      schemaId: 'schema-legacy-missing-origin',
      name: 'Legacy Missing Origin',
      format: 'json-schema',
      fieldCount: 1,
      status: 'ready',
      scope: 'global',
      syncStatus: 'sync-failed',
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

    const legacy = schemas.find((schema) => schema.schemaId === 'schema-legacy-missing-origin');
    expect(legacy?.origin).toBe('uploaded');
  });

  it('lists seeded CDM metadata by default with no stored schemas', async () => {
    const adapter = new LocalStorageAdapter();

    const schemas = await adapter.listSchemas();

    expect(schemas.length).toBeGreaterThan(0);
    const cdmSchemas = schemas.filter((schema) => schema.origin === 'cdm');
    expect(cdmSchemas.length).toBeGreaterThan(0);
    expect(cdmSchemas.every((schema) => schema.ownership === 'cdm' && schema.readonly === true)).toBe(true);
  });

  it('getSchema resolves seeded CDM schema without persisted local record', async () => {
    const adapter = new LocalStorageAdapter();

    const schemas = await adapter.listSchemas();
    const cdmSchema = schemas.find((schema) => schema.origin === 'cdm');
    expect(cdmSchema).toBeDefined();

    const detail = await adapter.getSchema(cdmSchema!.schemaId);
    expect(detail.metadata.origin).toBe('cdm');
    expect(detail.metadata.readonly).toBe(true);
    expect(detail.metadata.ownership).toBe('cdm');
  });

  it('normalizes invalid schema origin to uploaded when loading schema detail', async () => {
    const metadataWithInvalidOrigin = {
      schemaId: 'schema-legacy-invalid-origin',
      name: 'Legacy Invalid Origin',
      format: 'json-schema',
      fieldCount: 1,
      origin: 'legacy-origin',
      status: 'ready',
      scope: 'global',
      syncStatus: 'sync-failed',
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

    expect(detail.metadata.origin).toBe('uploaded');
  });

  it('deduplicates and trims linkedSchemaIds from legacy schemaRefs fallback', async () => {
    const adapter = new LocalStorageAdapter();

    const created = await adapter.createProject({
      name: 'Legacy refs project',
      description: 'desc',
      slug: 'legacy-refs',
      schemaRefs: [
        { schemaId: ' schema-a ', type: 'local' },
        { schemaId: 'schema-a', type: 'github' },
        { schemaId: 'schema-b', type: 'published' },
        { schemaId: '   ', type: 'local' },
      ],
    });

    const detail = await adapter.getProject(created.projectId);
    expect(detail.linkedSchemaIds).toEqual(['schema-a', 'schema-b']);
  });

  it('prefers linkedSchemaIds and normalizes duplicates/whitespace', async () => {
    const adapter = new LocalStorageAdapter();

    const created = await adapter.createProject({
      name: 'Canonical links project',
      description: 'desc',
      slug: 'canonical-links',
      linkedSchemaIds: [' schema-x ', 'schema-x', 'schema-y', '   '],
      schemaRefs: [{ schemaId: 'schema-z', type: 'local' }],
    });

    const detail = await adapter.getProject(created.projectId);
    expect(detail.linkedSchemaIds).toEqual(['schema-x', 'schema-y']);
    expect(detail.schemaRefs).toEqual([{ schemaId: 'schema-z', type: 'local' }]);
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

  it('deleteMapping prunes stale linked schema ids for the project', async () => {
    const adapter = new LocalStorageAdapter();

    const project = await adapter.createProject({
      name: 'Project',
      description: 'desc',
      slug: 'project',
      linkedSchemaIds: ['source-a', 'target-a', 'source-b', 'target-b'],
      schemaRefs: [
        { schemaId: 'source-a', type: 'local' },
        { schemaId: 'target-a', type: 'local' },
        { schemaId: 'source-b', type: 'local' },
        { schemaId: 'target-b', type: 'local' },
      ],
    });

    const mappingA = await adapter.createMapping({
      projectId: project.projectId,
      name: 'Mapping A',
      sourceSchemaRef: { schemaId: 'source-a', type: 'local' },
      targetSchemaRef: { schemaId: 'target-a', type: 'local' },
    });

    await adapter.createMapping({
      projectId: project.projectId,
      name: 'Mapping B',
      sourceSchemaRef: { schemaId: 'source-b', type: 'local' },
      targetSchemaRef: { schemaId: 'target-b', type: 'local' },
    });

    await adapter.deleteMapping(mappingA.mappingId);

    const detail = await adapter.getProject(project.projectId);
    expect(detail.linkedSchemaIds).toEqual(['source-b', 'target-b']);
    expect(detail.schemaRefs).toEqual([
      { schemaId: 'source-b', type: 'local' },
      { schemaId: 'target-b', type: 'local' },
    ]);
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
    vi.useFakeTimers();
    try {
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

      vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
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
      ).rejects.toMatchObject({
        code: 'PROMOTION_REQUIRES_VERSION',
        message: 'Promotion requires a version-backed source deployment',
        statusCode: 400,
        retryable: false,
      });

      vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));
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
    } finally {
      vi.useRealTimers();
    }
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

    const preprodV1 = await adapter.deployMapping(created.mappingId, {
      environment: 'PREPROD',
      sourceType: 'version',
      sourceNumber: 1,
    });

    await adapter.deployMapping(created.mappingId, {
      environment: 'PREPROD',
      sourceType: 'version',
      sourceNumber: 2,
    });

    const rollback = await adapter.rollbackDeployment(created.mappingId, {
      environment: 'PREPROD',
      deploymentSK: preprodV1.environmentDeployedAt,
    });

    expect(rollback.rollbackOf).toBe(preprodV1.environmentDeployedAt);
    expect(rollback.sourceNumber).toBe(1);

    const current = await adapter.getCurrentDeployments(created.mappingId);
    expect(current.QA.deployment?.sourceNumber).toBe(1);
    expect(current.QA.status).toBe('stale');
    expect(current.DEV.status).toBe('not-deployed');
    expect(current.PROD.status).toBe('not-deployed');
  });
});
