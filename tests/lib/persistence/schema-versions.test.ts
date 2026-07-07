import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SchemaDraftItem, SchemaVersionItem } from '../../../src/lib/persistence/types.js';

const { dynamoSendMock, getDraftRevisionMock, putVersionMock, randomUuidMock } = vi.hoisted(() => ({
  dynamoSendMock: vi.fn(),
  getDraftRevisionMock: vi.fn(),
  putVersionMock: vi.fn(),
  randomUuidMock: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/clients.js', () => ({
  dynamoClient: {
    send: dynamoSendMock,
  },
}));

vi.mock('../../../src/lib/persistence/s3/schema-content.js', () => ({
  schemaContent: {
    getDraftRevision: getDraftRevisionMock,
    putVersion: putVersionMock,
  },
}));

async function importModule() {
  return import('../../../src/lib/persistence/schema-versions.js');
}

function makeDraft(overrides: Partial<SchemaDraftItem> = {}): SchemaDraftItem {
  return {
    schemaId: 'schema-1',
    revision: 2,
    basedOnVersion: 1,
    contentHash: 'a'.repeat(64),
    contentS3Key: 'schemas/schema-1/drafts/r2.json',
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
    version: 1,
    schemaVersionId: 'version-id-1',
    draftRevision: 1,
    basedOnVersion: null,
    contentHash: 'b'.repeat(64),
    contentS3Key: 'schemas/schema-1/versions/v1.json',
    versionStatus: 'ready',
    indexStatus: 'pending',
    impactStatus: 'pending',
    sampleValidationStatus: 'pending',
    createdAt: '2026-07-06T00:00:00.000Z',
    createdBy: 'user-1',
    ...overrides,
  };
}

describe('persistence schema-versions', () => {
  beforeEach(() => {
    vi.resetModules();
    dynamoSendMock.mockReset();
    getDraftRevisionMock.mockReset();
    putVersionMock.mockReset();
    randomUuidMock.mockReset();
    randomUuidMock.mockReturnValue('schema-version-uuid-1');
    vi.stubGlobal('crypto', {
      randomUUID: () => randomUuidMock(),
    } satisfies Pick<Crypto, 'randomUUID'>);
  });

  it('createFromDraft returns noChange when latest hash matches draft', async () => {
    dynamoSendMock
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [makeVersion({ contentHash: 'h'.repeat(64) })] });

    const mod = await importModule();
    const result = await mod.createFromDraft('schema-1', makeDraft({ contentHash: 'h'.repeat(64) }), {
      createdBy: 'user-2',
    });

    expect(result.noChange).toBe(true);
    expect(result.item).toBeUndefined();
    expect(getDraftRevisionMock).not.toHaveBeenCalled();
  });

  it('createFromDraft allocates next monotonic version and writes record', async () => {
    dynamoSendMock
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [makeVersion({ version: 2, contentHash: 'x'.repeat(64) })] })
      .mockResolvedValueOnce({});
    getDraftRevisionMock.mockResolvedValueOnce({ type: 'object', title: 'Order' });
    putVersionMock.mockResolvedValueOnce('schemas/schema-1/versions/v3.json');

    const mod = await importModule();
    const result = await mod.createFromDraft('schema-1', makeDraft({ revision: 7, contentHash: 'y'.repeat(64) }), {
      createdBy: 'user-3',
    });

    expect(result.noChange).toBe(false);
    expect(result.item?.version).toBe(3);
    expect(result.item?.draftRevision).toBe(7);
    expect(result.item?.schemaVersionId).toBe('schema-version-uuid-1');

    const putCommand = dynamoSendMock.mock.calls[2]?.[0] as {
      input: { ConditionExpression: string; ExpressionAttributeNames: Record<string, string> };
    };
    expect(putCommand.input.ConditionExpression).toContain('attribute_not_exists');
    expect(putCommand.input.ExpressionAttributeNames['#version']).toBe('version');
  });

  it('createFromDraft fails when draft content is missing', async () => {
    dynamoSendMock
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [] });
    getDraftRevisionMock.mockResolvedValueOnce(null);

    const mod = await importModule();

    await expect(
      mod.createFromDraft('schema-1', makeDraft({ revision: 9 }), { createdBy: 'user-4' }),
    ).rejects.toThrow(/content missing/i);
  });

  it('failed create does not consume next visible version number', async () => {
    const mod = await importModule();

    // Attempt 1 fails before write.
    dynamoSendMock
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [] });
    getDraftRevisionMock.mockResolvedValueOnce(null);
    await expect(
      mod.createFromDraft('schema-1', makeDraft({ revision: 10, contentHash: 'z'.repeat(64) }), { createdBy: 'user-5' }),
    ).rejects.toThrow(/content missing/i);

    // Attempt 2 succeeds and should still allocate v1.
    dynamoSendMock
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({});
    getDraftRevisionMock.mockResolvedValueOnce({ type: 'object' });
    putVersionMock.mockResolvedValueOnce('schemas/schema-1/versions/v1.json');

    randomUuidMock.mockReturnValueOnce('schema-version-uuid-2');

    const created = await mod.createFromDraft('schema-1', makeDraft({ revision: 11, contentHash: 'y'.repeat(64) }), {
      createdBy: 'user-5',
    });

    expect(created.noChange).toBe(false);
    expect(created.item?.version).toBe(1);
  });

  it('replays existing version when same draft revision was already versioned', async () => {
    const mod = await importModule();

    const existing = makeVersion({
      version: 6,
      draftRevision: 12,
      idempotencyKey: 'idem-existing',
    });

    dynamoSendMock.mockResolvedValueOnce({ Items: [existing] });

    const result = await mod.createFromDraft(
      'schema-1',
      makeDraft({ revision: 12, contentHash: 'x'.repeat(64) }),
      { createdBy: 'user-6', idempotencyKey: 'idem-existing' },
    );

    expect(result.noChange).toBe(false);
    expect(result.replayed).toBe(true);
    expect(result.item?.version).toBe(6);
  });

  it('updateDerivedStatuses updates derived statuses without changing versionStatus', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({
      Attributes: makeVersion({
        versionStatus: 'ready',
        indexStatus: 'failed',
        impactStatus: 'ready',
        sampleValidationStatus: 'failed',
      }),
    });

    const updated = await mod.updateDerivedStatuses('schema-1', 1, {
      indexStatus: 'failed',
      impactStatus: 'ready',
      sampleValidationStatus: 'failed',
    });

    expect(updated?.versionStatus).toBe('ready');
    expect(updated?.indexStatus).toBe('failed');
    expect(updated?.impactStatus).toBe('ready');
    expect(updated?.sampleValidationStatus).toBe('failed');
  });
});
