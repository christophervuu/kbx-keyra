import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateSchemaMetadataInput, SchemaMetadataItem } from '../../../src/lib/persistence/types.js';

const { sendMock, randomUuidMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  randomUuidMock: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/clients.js', () => ({
  dynamoClient: {
    send: sendMock,
  },
}));

async function importModule() {
  return import('../../../src/lib/persistence/schema-metadata.js');
}

function makeCreateInput(overrides: Partial<CreateSchemaMetadataInput> = {}): CreateSchemaMetadataInput {
  return {
    name: 'Order Schema',
    format: 'json-schema',
    fieldCount: 0,
    origin: 'local',
    scope: 'project',
    source: {
      type: 'upload',
    },
    ...overrides,
  };
}

function makeItem(overrides: Partial<SchemaMetadataItem> = {}): SchemaMetadataItem {
  return {
    schemaId: 'schema-1',
    name: 'Order Schema',
    format: 'json-schema',
    fieldCount: 25,
    origin: 'local',
    status: 'ready',
    scope: 'project',
    syncStatus: 'not-synced',
    source: { type: 'upload' },
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('persistence schema-metadata', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    randomUuidMock.mockReset();
    randomUuidMock.mockReturnValue('schema-created-1');
    vi.stubGlobal('crypto', {
      randomUUID: () => randomUuidMock(),
    } satisfies Pick<Crypto, 'randomUUID'>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('create generates UUID, sets defaults, and writes PutCommand', async () => {
    sendMock.mockResolvedValue({});
    const mod = await importModule();

    const result = await mod.create(makeCreateInput());

    expect(result.schemaId).toBe('schema-created-1');
    expect(result.status).toBe('ingesting');
    expect(result.syncStatus).toBe('not-synced');
    expect(result.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(result.updatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);

    const putCommand = sendMock.mock.calls[0]?.[0] as {
      input: { TableName: string; Item: SchemaMetadataItem };
    };
    expect(putCommand.input.TableName).toBe('keyra-schema-metadata');
    expect(putCommand.input.Item).toEqual(result);
  });

  it('create respects explicit status and syncStatus when provided', async () => {
    sendMock.mockResolvedValue({});
    const mod = await importModule();

    const result = await mod.create(
      makeCreateInput({
        status: 'ready',
        syncStatus: 'synced',
      }),
    );

    expect(result.status).toBe('ready');
    expect(result.syncStatus).toBe('synced');
  });

  it('create projects sourceRepoId when github source includes repoId', async () => {
    sendMock.mockResolvedValue({});
    const mod = await importModule();

    const result = await mod.create(
      makeCreateInput({
        origin: 'cdm',
        source: {
          type: 'github',
          repo: 'KBXT/KBX-Canonicals',
          repoId: 1052821334,
          branch: 'main',
          path: 'JSONSchemas/CommonDataModels/Patient.json',
          commitSha: 'abc123',
        },
      }),
    );

    expect(result.source).toEqual({
      type: 'github',
      repo: 'KBXT/KBX-Canonicals',
      repoId: 1052821334,
      branch: 'main',
      path: 'JSONSchemas/CommonDataModels/Patient.json',
      commitSha: 'abc123',
    });
    expect(result.sourceRepoId).toBe(1052821334);
  });

  it('create accepts canonical FS-076 sync statuses and legacy statuses', async () => {
    sendMock.mockResolvedValue({});
    const mod = await importModule();

    const canonical = await mod.create(
      makeCreateInput({
        syncStatus: 'update-available',
      }),
    );
    const failure = await mod.create(
      makeCreateInput({
        syncStatus: 'sync-failed',
      }),
    );
    const legacy = await mod.create(
      makeCreateInput({
        syncStatus: 'local-changes',
      }),
    );

    expect(canonical.syncStatus).toBe('update-available');
    expect(failure.syncStatus).toBe('sync-failed');
    expect(legacy.syncStatus).toBe('local-changes');
  });

  it('get returns item or null', async () => {
    const mod = await importModule();
    sendMock.mockResolvedValueOnce({ Item: makeItem() });
    sendMock.mockResolvedValueOnce({ Item: undefined });

    const found = await mod.get('schema-1');
    const missing = await mod.get('missing');

    expect(found?.schemaId).toBe('schema-1');
    expect(missing).toBeNull();
  });

  it('list returns all scan results', async () => {
    const mod = await importModule();
    sendMock.mockResolvedValue({
      Items: [makeItem({ schemaId: 'schema-1' }), makeItem({ schemaId: 'schema-2' })],
    });

    const result = await mod.list();

    expect(result).toHaveLength(2);
    const scanCommand = sendMock.mock.calls[0]?.[0] as { input: { TableName: string } };
    expect(scanCommand.input).toEqual({ TableName: 'keyra-schema-metadata' });
  });

  it('updateStatus updates status + optional fieldCount and always updatedAt', async () => {
    const mod = await importModule();

    sendMock.mockResolvedValueOnce({ Attributes: makeItem({ status: 'error', fieldCount: 0 }) });
    const updated = await mod.updateStatus('schema-1', 'error');
    expect(updated.status).toBe('error');

    const commandWithoutCount = sendMock.mock.calls[0]?.[0] as {
      input: {
        UpdateExpression: string;
        ExpressionAttributeNames: Record<string, string>;
        ExpressionAttributeValues: Record<string, unknown>;
      };
    };
    expect(commandWithoutCount.input.UpdateExpression).toContain('#status = :status');
    expect(commandWithoutCount.input.UpdateExpression).toContain('#updatedAt = :updatedAt');
    expect(commandWithoutCount.input.UpdateExpression).not.toContain('#fieldCount = :fieldCount');

    sendMock.mockResolvedValueOnce({ Attributes: makeItem({ status: 'ready', fieldCount: 123 }) });
    const updatedWithCount = await mod.updateStatus('schema-1', 'ready', 123);
    expect(updatedWithCount.fieldCount).toBe(123);

    const commandWithCount = sendMock.mock.calls[1]?.[0] as {
      input: {
        UpdateExpression: string;
        ExpressionAttributeNames: Record<string, string>;
        ExpressionAttributeValues: Record<string, unknown>;
      };
    };
    expect(commandWithCount.input.UpdateExpression).toContain('#fieldCount = :fieldCount');
    expect(commandWithCount.input.ExpressionAttributeNames['#fieldCount']).toBe('fieldCount');
    expect(commandWithCount.input.ExpressionAttributeValues[':fieldCount']).toBe(123);
  });

  it('delete sends DeleteCommand and is idempotent', async () => {
    sendMock.mockResolvedValue({});
    const mod = await importModule();

    await expect(mod.delete('missing-schema')).resolves.toBeUndefined();

    const deleteCommand = sendMock.mock.calls[0]?.[0] as {
      input: { TableName: string; Key: { schemaId: string } };
    };
    expect(deleteCommand.input).toEqual({
      TableName: 'keyra-schema-metadata',
      Key: {
        schemaId: 'missing-schema',
      },
    });
  });

  it('exports schemaMetadata object with expected operations', async () => {
    const mod = await importModule();

    expect(mod.schemaMetadata.create).toBe(mod.create);
    expect(mod.schemaMetadata.get).toBe(mod.get);
    expect(mod.schemaMetadata.list).toBe(mod.list);
    expect(mod.schemaMetadata.updateStatus).toBe(mod.updateStatus);
    expect(mod.schemaMetadata.delete).toBe(mod.delete);
  });
});
