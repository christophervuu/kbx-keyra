import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  applyPersistenceTestEnvironment,
  assertLocalServicesAvailable,
  clearBucket,
  clearTablesData,
  createBucket,
  createTables,
  deleteBucket,
  deleteTables,
} from './setup.js';

const RUN_INTEGRATION = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.RUN_PERSISTENCE_INTEGRATION === '1';

describe.skipIf(!RUN_INTEGRATION)('persistence integration - schema lifecycle', () => {
  let schemaDrafts: typeof import('../../../src/lib/persistence/schema-drafts.js');
  let schemaNodes: typeof import('../../../src/lib/persistence/schema-nodes.js');
  let schemaVersions: typeof import('../../../src/lib/persistence/schema-versions.js');
  let schemaIdentity: typeof import('../../../src/lib/schema/identity.js');

  beforeAll(async () => {
    await assertLocalServicesAvailable();
    applyPersistenceTestEnvironment();
    await createTables();
    await createBucket();

    vi.resetModules();
    schemaDrafts = await import('../../../src/lib/persistence/schema-drafts.js');
    schemaNodes = await import('../../../src/lib/persistence/schema-nodes.js');
    schemaIdentity = await import('../../../src/lib/schema/identity.js');
    schemaVersions = await import('../../../src/lib/persistence/schema-versions.js');
  });

  afterEach(async () => {
    await clearTablesData();
    await clearBucket();
  });

  afterAll(async () => {
    await clearBucket();
    await deleteTables();
    await deleteBucket();
  });

  it('save-draft no-change does not create revision and create-version no-change allocates no version', async () => {
    const schemaId = 'schema-lifecycle-1';
    const content = {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
      },
    };

    const firstSave = await schemaDrafts.save(schemaId, {
      content,
      updatedBy: 'user-1',
    });
    expect(firstSave.noChange).toBe(false);
    expect(firstSave.item.revision).toBe(1);

    const secondSave = await schemaDrafts.save(schemaId, {
      content,
      expectedRevision: 1,
      updatedBy: 'user-1',
    });
    expect(secondSave.noChange).toBe(true);
    expect(secondSave.item.revision).toBe(1);

    const firstVersion = await schemaVersions.createFromDraft(schemaId, firstSave.item, {
      createdBy: 'user-1',
    });
    expect(firstVersion.noChange).toBe(false);
    expect(firstVersion.item?.version).toBe(1);

    const noChangeVersion = await schemaVersions.createFromDraft(schemaId, firstSave.item, {
      createdBy: 'user-1',
    });
    expect(noChangeVersion.noChange).toBe(true);

    const versions = await schemaVersions.list(schemaId);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.version).toBe(1);
  });

  it('failed version create does not consume visible version number', async () => {
    const schemaId = 'schema-lifecycle-2';
    const content = {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
    };

    const draft = await schemaDrafts.save(schemaId, {
      content,
      updatedBy: 'user-1',
    });

    expect(draft.noChange).toBe(false);

    const originalGetDraftRevision = (await import('../../../src/lib/persistence/s3/schema-content.js')).getDraftRevision;
    const getDraftRevisionSpy = vi
      .spyOn(await import('../../../src/lib/persistence/s3/schema-content.js'), 'getDraftRevision')
      .mockResolvedValueOnce(null)
      .mockImplementation(originalGetDraftRevision);

    await expect(
      schemaVersions.createFromDraft(schemaId, draft.item, { createdBy: 'user-1' }),
    ).rejects.toThrow(/content missing/i);

    const created = await schemaVersions.createFromDraft(schemaId, draft.item, { createdBy: 'user-1' });
    expect(created.noChange).toBe(false);
    expect(created.item?.version).toBe(1);

    getDraftRevisionSpy.mockRestore();
  });

  it('sequential version creation allocates monotonic version numbers', async () => {
    const schemaId = 'schema-lifecycle-3';

    const draftV1 = await schemaDrafts.save(schemaId, {
      content: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      updatedBy: 'user-1',
    });

    const v1 = await schemaVersions.createFromDraft(schemaId, draftV1.item, {
      createdBy: 'user-1',
    });
    expect(v1.noChange).toBe(false);
    expect(v1.item?.version).toBe(1);

    const draftV2 = await schemaDrafts.save(schemaId, {
      content: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string' },
        },
      },
      expectedRevision: draftV1.item.revision,
      updatedBy: 'user-1',
    });
    expect(draftV2.noChange).toBe(false);

    const v2 = await schemaVersions.createFromDraft(schemaId, draftV2.item, {
      createdBy: 'user-1',
    });
    expect(v2.noChange).toBe(false);
    expect(v2.item?.version).toBe(2);

    const versions = await schemaVersions.list(schemaId);
    expect(versions.map((entry) => entry.version)).toEqual([2, 1]);
  });

  it('restore behavior preserves historical fieldIds when restored into a later version identity sidecar', async () => {
    const schemaVersionIdV1 = 'schema-version-v1';
    const schemaVersionIdV3 = 'schema-version-v3';

    const historical = [
      {
        schemaVersionId: schemaVersionIdV1,
        fieldId: 'fid-root',
        jsonPointer: '',
      },
      {
        schemaVersionId: schemaVersionIdV1,
        fieldId: 'fid-id',
        jsonPointer: '/properties/id',
        parentFieldId: 'fid-root',
      },
      {
        schemaVersionId: schemaVersionIdV1,
        fieldId: 'fid-name',
        jsonPointer: '/properties/name',
        parentFieldId: 'fid-root',
      },
    ] as const;

    await schemaNodes.batchWriteSchemaNodeIdentities(schemaVersionIdV1, historical);
    const loadedHistorical = await schemaNodes.listSchemaNodeIdentities(schemaVersionIdV1);
    const restored = schemaIdentity.restoreIdentitiesFromVersion(schemaVersionIdV3, loadedHistorical);

    await schemaNodes.batchWriteSchemaNodeIdentities(schemaVersionIdV3, restored);
    const loadedRestored = await schemaNodes.listSchemaNodeIdentities(schemaVersionIdV3);

    expect(
      loadedRestored
        .map((entry) => ({ fieldId: entry.fieldId, jsonPointer: entry.jsonPointer }))
        .sort((a, b) => a.jsonPointer.localeCompare(b.jsonPointer)),
    ).toEqual([
      { fieldId: 'fid-root', jsonPointer: '' },
      { fieldId: 'fid-id', jsonPointer: '/properties/id' },
      { fieldId: 'fid-name', jsonPointer: '/properties/name' },
    ]);
  });
});
