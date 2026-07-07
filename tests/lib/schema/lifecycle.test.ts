import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SchemaDraftItem, SchemaVersionItem } from '../../../src/lib/persistence/types.js';

const {
  createSchemaVersionMock,
  getCurrentSchemaDraftMock,
  getSchemaDraftRevisionContentMock,
  getSchemaVersionMock,
  getLatestSchemaVersionMock,
  saveSchemaDraftMock,
  setSchemaDraftBasedOnVersionMock,
  updateSchemaVersionDerivedStatusesMock,
} = vi.hoisted(() => ({
  createSchemaVersionMock: vi.fn(),
  getCurrentSchemaDraftMock: vi.fn(),
  getSchemaDraftRevisionContentMock: vi.fn(),
  getSchemaVersionMock: vi.fn(),
  getLatestSchemaVersionMock: vi.fn(),
  saveSchemaDraftMock: vi.fn(),
  setSchemaDraftBasedOnVersionMock: vi.fn(),
  updateSchemaVersionDerivedStatusesMock: vi.fn(),
}));

const {
  deriveSchemaNodeIdentitiesForVersionMock,
  extractSchemaIdentityPointersFromJsonSchemaMock,
  loadSchemaNodeIdentitiesForVersionMock,
  saveSchemaNodeIdentitiesForVersionMock,
} = vi.hoisted(() => ({
  deriveSchemaNodeIdentitiesForVersionMock: vi.fn(),
  extractSchemaIdentityPointersFromJsonSchemaMock: vi.fn(),
  loadSchemaNodeIdentitiesForVersionMock: vi.fn(),
  saveSchemaNodeIdentitiesForVersionMock: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/index.js', () => ({
  createSchemaVersion: createSchemaVersionMock,
  getCurrentSchemaDraft: getCurrentSchemaDraftMock,
  getSchemaDraftRevisionContent: getSchemaDraftRevisionContentMock,
  getSchemaVersion: getSchemaVersionMock,
  getLatestSchemaVersion: getLatestSchemaVersionMock,
  saveSchemaDraft: saveSchemaDraftMock,
  setSchemaDraftBasedOnVersion: setSchemaDraftBasedOnVersionMock,
  updateSchemaVersionDerivedStatuses: updateSchemaVersionDerivedStatusesMock,
}));

vi.mock('../../../src/lib/schema/identity.js', () => ({
  deriveSchemaNodeIdentitiesForVersion: deriveSchemaNodeIdentitiesForVersionMock,
  extractSchemaIdentityPointersFromJsonSchema: extractSchemaIdentityPointersFromJsonSchemaMock,
  loadSchemaNodeIdentitiesForVersion: loadSchemaNodeIdentitiesForVersionMock,
  saveSchemaNodeIdentitiesForVersion: saveSchemaNodeIdentitiesForVersionMock,
}));

async function importModule() {
  return import('../../../src/lib/schema/lifecycle.js');
}

function makeDraft(overrides: Partial<SchemaDraftItem> = {}): SchemaDraftItem {
  return {
    schemaId: 'schema-1',
    revision: 3,
    basedOnVersion: 2,
    contentHash: 'a'.repeat(64),
    contentS3Key: 'schemas/schema-1/drafts/r3.json',
    createdAt: '2026-07-06T00:00:00.000Z',
    createdBy: 'user-1',
    updatedAt: '2026-07-06T00:00:00.000Z',
    updatedBy: 'user-1',
    ...overrides,
  };
}

function makeVersion(overrides: Partial<SchemaVersionItem> = {}): SchemaVersionItem {
  return {
    schemaId: 'schema-1',
    version: 4,
    schemaVersionId: 'version-id-4',
    draftRevision: 3,
    basedOnVersion: 2,
    contentHash: 'b'.repeat(64),
    contentS3Key: 'schemas/schema-1/versions/v4.json',
    versionStatus: 'ready',
    indexStatus: 'pending',
    impactStatus: 'pending',
    sampleValidationStatus: 'pending',
    createdAt: '2026-07-06T00:00:00.000Z',
    createdBy: 'user-1',
    ...overrides,
  };
}

function withFieldIdMap(entries: readonly Array<{ jsonPointer: string; fieldId: string }>) {
  return entries.map((entry) => ({
    schemaVersionId: 'version-id-4',
    jsonPointer: entry.jsonPointer,
    fieldId: entry.fieldId,
  }));
}

describe('schema lifecycle service', () => {
  beforeEach(() => {
    vi.resetModules();
    createSchemaVersionMock.mockReset();
    getCurrentSchemaDraftMock.mockReset();
    getSchemaDraftRevisionContentMock.mockReset();
    getSchemaVersionMock.mockReset();
    getLatestSchemaVersionMock.mockReset();
    saveSchemaDraftMock.mockReset();
    setSchemaDraftBasedOnVersionMock.mockReset();
    updateSchemaVersionDerivedStatusesMock.mockReset();
    deriveSchemaNodeIdentitiesForVersionMock.mockReset();
    extractSchemaIdentityPointersFromJsonSchemaMock.mockReset();
    loadSchemaNodeIdentitiesForVersionMock.mockReset();
    saveSchemaNodeIdentitiesForVersionMock.mockReset();

    extractSchemaIdentityPointersFromJsonSchemaMock.mockReturnValue([]);
    deriveSchemaNodeIdentitiesForVersionMock.mockReturnValue([]);
    getSchemaDraftRevisionContentMock.mockResolvedValue({ type: 'object' });
    getSchemaVersionMock.mockResolvedValue(null);
    loadSchemaNodeIdentitiesForVersionMock.mockResolvedValue([]);
    saveSchemaNodeIdentitiesForVersionMock.mockResolvedValue(undefined);
  });

  it('createImmutableSchemaVersion updates draft basedOnVersion after successful create', async () => {
    getCurrentSchemaDraftMock.mockResolvedValueOnce(makeDraft({ revision: 8 }));
    createSchemaVersionMock.mockResolvedValueOnce({ noChange: false, item: makeVersion({ version: 5 }) });
    setSchemaDraftBasedOnVersionMock.mockResolvedValueOnce(makeDraft({ basedOnVersion: 5 }));

    const mod = await importModule();
    const result = await mod.createImmutableSchemaVersion('schema-1', { createdBy: 'user-2' });

    expect(result.noChange).toBe(false);
    expect(result.item?.version).toBe(5);
    expect(setSchemaDraftBasedOnVersionMock).toHaveBeenCalledWith('schema-1', 5, 'user-2');
    expect(saveSchemaNodeIdentitiesForVersionMock).toHaveBeenCalledWith('version-id-4', []);
  });

  it('createImmutableSchemaVersion does not update draft when noChange', async () => {
    getCurrentSchemaDraftMock.mockResolvedValueOnce(makeDraft());
    createSchemaVersionMock.mockResolvedValueOnce({ noChange: true });

    const mod = await importModule();
    const result = await mod.createImmutableSchemaVersion('schema-1', { createdBy: 'user-2' });

    expect(result.noChange).toBe(true);
    expect(setSchemaDraftBasedOnVersionMock).not.toHaveBeenCalled();
    expect(saveSchemaNodeIdentitiesForVersionMock).not.toHaveBeenCalled();
  });

  it('createImmutableSchemaVersion forwards expectedDraftRevision and idempotency input', async () => {
    getCurrentSchemaDraftMock.mockResolvedValueOnce(makeDraft({ revision: 9 }));
    createSchemaVersionMock.mockResolvedValueOnce({ noChange: true, replayed: true });

    const mod = await importModule();
    const result = await mod.createImmutableSchemaVersion('schema-1', {
      createdBy: 'user-2',
      expectedDraftRevision: 9,
      idempotencyKey: 'idem-123',
      changeSummary: 'Added status field',
    });

    expect(result.noChange).toBe(true);
    expect(result.replayed).toBe(true);
    expect(createSchemaVersionMock).toHaveBeenCalledWith(
      'schema-1',
      expect.objectContaining({ revision: 9 }),
      expect.objectContaining({
        expectedDraftRevision: 9,
        idempotencyKey: 'idem-123',
        changeSummary: 'Added status field',
      }),
    );
  });

  it('createImmutableSchemaVersion restores historical ids when draft is based on prior version content', async () => {
    const draftContent = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
      },
    };

    getCurrentSchemaDraftMock.mockResolvedValueOnce(makeDraft({
      revision: 11,
      basedOnVersion: 3,
    }));
    createSchemaVersionMock.mockResolvedValueOnce({
      noChange: false,
      item: makeVersion({
        version: 4,
        schemaVersionId: 'version-id-4',
      }),
    });
    getSchemaDraftRevisionContentMock.mockResolvedValueOnce(draftContent);
    getSchemaVersionMock.mockResolvedValueOnce(makeVersion({
      version: 3,
      schemaVersionId: 'version-id-3',
    }));

    extractSchemaIdentityPointersFromJsonSchemaMock.mockReturnValueOnce([
      { jsonPointer: '' },
      { jsonPointer: '/properties/id', parentJsonPointer: '' },
      { jsonPointer: '/properties/name', parentJsonPointer: '' },
    ]);
    loadSchemaNodeIdentitiesForVersionMock.mockResolvedValueOnce(withFieldIdMap([
      { jsonPointer: '', fieldId: 'fid-root' },
      { jsonPointer: '/properties/id', fieldId: 'fid-id' },
      { jsonPointer: '/properties/name', fieldId: 'fid-name' },
    ]));
    deriveSchemaNodeIdentitiesForVersionMock.mockReturnValueOnce(withFieldIdMap([
      { jsonPointer: '', fieldId: 'fid-root' },
      { jsonPointer: '/properties/id', fieldId: 'fid-id' },
      { jsonPointer: '/properties/name', fieldId: 'fid-name' },
    ]));

    const mod = await importModule();
    const result = await mod.createImmutableSchemaVersion('schema-1', { createdBy: 'user-2' });

    expect(result.noChange).toBe(false);
    expect(loadSchemaNodeIdentitiesForVersionMock).toHaveBeenCalledWith('version-id-3');
    expect(deriveSchemaNodeIdentitiesForVersionMock).toHaveBeenCalledWith(
      'version-id-4',
      expect.any(Array),
      expect.arrayContaining([
        expect.objectContaining({ jsonPointer: '/properties/id', fieldId: 'fid-id' }),
      ]),
    );
    expect(saveSchemaNodeIdentitiesForVersionMock).toHaveBeenCalledWith(
      'version-id-4',
      expect.arrayContaining([
        expect.objectContaining({ jsonPointer: '/properties/id', fieldId: 'fid-id' }),
      ]),
    );
  });

  it('createImmutableSchemaVersion rejects stale expectedDraftRevision before persistence call', async () => {
    getCurrentSchemaDraftMock.mockResolvedValueOnce(makeDraft({ revision: 10 }));

    const mod = await importModule();

    await expect(
      mod.createImmutableSchemaVersion('schema-1', {
        createdBy: 'user-2',
        expectedDraftRevision: 9,
      }),
    ).rejects.toThrow(/revision conflict/i);

    expect(createSchemaVersionMock).not.toHaveBeenCalled();
  });

  it('createImmutableSchemaVersion throws when no active draft exists', async () => {
    getCurrentSchemaDraftMock.mockResolvedValueOnce(null);
    const mod = await importModule();

    await expect(
      mod.createImmutableSchemaVersion('schema-1', { createdBy: 'user-2' }),
    ).rejects.toThrow(/No active draft/i);
  });

  it('markSchemaVersionDerivedStatuses updates only derived readiness fields', async () => {
    updateSchemaVersionDerivedStatusesMock.mockResolvedValueOnce(
      makeVersion({
        versionStatus: 'ready',
        indexStatus: 'failed',
        impactStatus: 'ready',
        sampleValidationStatus: 'failed',
      }),
    );

    const mod = await importModule();
    const updated = await mod.markSchemaVersionDerivedStatuses({
      schemaId: 'schema-1',
      version: 4,
      indexStatus: 'failed',
      impactStatus: 'ready',
      sampleValidationStatus: 'failed',
    });

    expect(updateSchemaVersionDerivedStatusesMock).toHaveBeenCalledWith('schema-1', 4, {
      indexStatus: 'failed',
      impactStatus: 'ready',
      sampleValidationStatus: 'failed',
    });
    expect(updated?.versionStatus).toBe('ready');
  });
});
