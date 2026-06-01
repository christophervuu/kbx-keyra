import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MappingConfig, MappingRevisionItem, MappingVersionItem } from '../../../src/lib/persistence/types.js';

const { dynamoSendMock, s3SendMock } = vi.hoisted(() => ({
  dynamoSendMock: vi.fn(),
  s3SendMock: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/clients.js', () => ({
  dynamoClient: {
    send: dynamoSendMock,
  },
  s3Client: {
    send: s3SendMock,
  },
}));

async function importModule() {
  return import('../../../src/lib/persistence/mapping-revisions.js');
}

function makeConfig(overrides: Partial<MappingConfig> = {}): MappingConfig {
  return {
    id: 'mapping-1',
    projectId: 'project-1',
    name: 'Mapping',
    version: 1,
    engineVersion: '1.0.0',
    sourceSchemaRef: {
      schemaId: 'source-1',
      type: 'local',
    },
    targetSchemaRef: {
      schemaId: 'target-1',
      type: 'local',
    },
    config: {},
    rules: [],
    ...overrides,
  };
}

function makeRevisionItem(overrides: Partial<MappingRevisionItem> = {}): MappingRevisionItem {
  return {
    mappingId: 'mapping-1',
    revision: 1,
    savedAt: '2026-06-01T00:00:00.000Z',
    savedBy: 'user-1',
    ruleCount: 2,
    configS3Key: 'mappings/mapping-1/revisions/r1.json',
    configHash: 'a'.repeat(64),
    ...overrides,
  };
}

function makeVersionItem(overrides: Partial<MappingVersionItem> = {}): MappingVersionItem {
  return {
    mappingId: 'mapping-1',
    version: 1,
    revisionNumber: 1,
    createdAt: '2026-06-01T00:00:00.000Z',
    createdBy: 'user-1',
    ...overrides,
  };
}

describe('persistence mapping-revisions', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    dynamoSendMock.mockReset();
    s3SendMock.mockReset();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('save writes revision config to S3 and metadata to DynamoDB', async () => {
    dynamoSendMock
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Items: [makeRevisionItem()] })
      .mockResolvedValueOnce({ Items: [] });
    s3SendMock.mockResolvedValueOnce({});

    const mod = await importModule();

    const result = await mod.save('mapping-1', {
      savedBy: 'user-123',
      ruleCount: 7,
      config: makeConfig({ version: 99, name: 'Updated' }),
    });

    expect(result.noChange).toBe(false);
    expect(result.item.mappingId).toBe('mapping-1');
    expect(result.item.revision).toBe(1);
    expect(result.item.savedBy).toBe('user-123');
    expect(result.item.ruleCount).toBe(7);
    expect(result.item.configS3Key).toBe('mappings/mapping-1/revisions/r1.json');
    expect(result.item.configHash).toMatch(/^[a-f0-9]{64}$/);

    const putObjectCommand = s3SendMock.mock.calls[0]?.[0] as {
      input: { Bucket: string; Key: string; ContentType: string; Body: string };
    };
    expect(putObjectCommand.input.Bucket).toBe('keyra-storage');
    expect(putObjectCommand.input.Key).toBe('mappings/mapping-1/revisions/r1.json');
    expect(putObjectCommand.input.ContentType).toBe('application/json');

    const payload = JSON.parse(putObjectCommand.input.Body) as MappingConfig;
    expect(payload.version).toBe(1);

    const putCommand = dynamoSendMock.mock.calls[1]?.[0] as {
      input: { TableName: string; Item: MappingRevisionItem };
    };
    expect(putCommand.input.TableName).toBe('keyra-mapping-revisions');
    expect(putCommand.input.Item.revision).toBe(1);
  });

  it('save no-ops when config hash matches latest revision', async () => {
    const latest = makeRevisionItem({ configHash: 'b'.repeat(64), revision: 4 });

    dynamoSendMock.mockResolvedValueOnce({ Items: [latest] });

    const mod = await importModule();

    const matchingConfig = makeConfig();
    const hash = (await import('../../../src/lib/persistence/hash.js')).computeConfigHash;
    const matchingHash = await hash(matchingConfig);
    const latestMatching = { ...latest, configHash: matchingHash };
    dynamoSendMock.mockReset();
    dynamoSendMock.mockResolvedValueOnce({ Items: [latestMatching] });

    const result = await mod.save('mapping-1', {
      savedBy: 'user-123',
      ruleCount: 7,
      config: matchingConfig,
    });

    expect(result.noChange).toBe(true);
    expect(result.item.revision).toBe(4);
    expect(s3SendMock).not.toHaveBeenCalled();
  });

  it('prunes unversioned revisions beyond 50 and preserves version-referenced revisions', async () => {
    const revisions = Array.from({ length: 52 }, (_, i) =>
      makeRevisionItem({
        revision: i + 1,
        configS3Key: `mappings/mapping-1/revisions/r${i + 1}.json`,
        configHash: `${i + 1}`.padStart(64, '0'),
      }),
    );

    // Existing latest revisions for save()
    dynamoSendMock
      .mockResolvedValueOnce({ Items: [revisions[revisions.length - 1]] })
      // Put revision
      .mockResolvedValueOnce({})
      // listAscending during prune
      .mockResolvedValueOnce({ Items: [...revisions, makeRevisionItem({ revision: 53, configS3Key: 'mappings/mapping-1/revisions/r53.json' })] })
      // getVersionReferencedRevisions during prune (revision 1 is protected)
      .mockResolvedValueOnce({ Items: [makeVersionItem({ revisionNumber: 1 })] })
      // delete oldest unversioned item (revision 2)
      .mockResolvedValueOnce({});

    s3SendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const mod = await importModule();

    await mod.save('mapping-1', {
      savedBy: 'user-123',
      ruleCount: 7,
      config: makeConfig({ version: 53, name: 'Updated' }),
    });

    const deleteCommand = dynamoSendMock.mock.calls.find((call) => {
      const input = (call[0] as { input?: { Key?: { revision?: number } } }).input;
      return input?.Key?.revision !== undefined;
    })?.[0] as { input: { Key: { mappingId: string; revision: number } } };

    expect(deleteCommand.input.Key).toEqual({ mappingId: 'mapping-1', revision: 2 });

    const deleteObjectCommand = s3SendMock.mock.calls[1]?.[0] as {
      input: { Key: string };
    };
    expect(deleteObjectCommand.input.Key).toBe('mappings/mapping-1/revisions/r2.json');
  });

  it('save does not fail when prune fails and logs warning', async () => {
    dynamoSendMock
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Query failure during prune'));
    s3SendMock.mockResolvedValueOnce({});

    const mod = await importModule();

    await expect(
      mod.save('mapping-1', {
        savedBy: 'user-2',
        ruleCount: 1,
        config: makeConfig({ version: 2 }),
      }),
    ).resolves.toMatchObject({
      noChange: false,
      item: {
        mappingId: 'mapping-1',
      },
    });

    expect(warnSpy).toHaveBeenCalled();
  });

  it('list queries descending by revision', async () => {
    dynamoSendMock.mockResolvedValue({
      Items: [makeRevisionItem({ revision: 3 }), makeRevisionItem({ revision: 2 }), makeRevisionItem({ revision: 1 })],
    });

    const mod = await importModule();
    const result = await mod.list('mapping-1');

    expect(result.map((item) => item.revision)).toEqual([3, 2, 1]);
  });

  it('get returns item or null', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({ Item: makeRevisionItem({ revision: 7 }) });
    dynamoSendMock.mockResolvedValueOnce({ Item: undefined });

    const found = await mod.get('mapping-1', 7);
    const missing = await mod.get('mapping-1', 999);

    expect(found?.revision).toBe(7);
    expect(missing).toBeNull();
  });

  it('getConfig returns parsed config and null for missing cases', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({
      Item: makeRevisionItem({ revision: 5, configS3Key: 'mappings/mapping-1/revisions/r5.json' }),
    });
    s3SendMock.mockResolvedValueOnce({
      Body: {
        transformToString: vi.fn().mockResolvedValue(JSON.stringify(makeConfig({ version: 5, name: 'r5' }))),
      },
    });

    const foundConfig = await mod.getConfig('mapping-1', 5);
    expect(foundConfig?.version).toBe(5);
    expect(foundConfig?.name).toBe('r5');

    dynamoSendMock.mockResolvedValueOnce({ Item: undefined });
    const missingRevisionConfig = await mod.getConfig('mapping-1', 999);
    expect(missingRevisionConfig).toBeNull();

    dynamoSendMock.mockResolvedValueOnce({
      Item: makeRevisionItem({ revision: 6, configS3Key: 'mappings/mapping-1/revisions/r6.json' }),
    });
    s3SendMock.mockRejectedValueOnce({ name: 'NoSuchKey' });

    const missingObjectConfig = await mod.getConfig('mapping-1', 6);
    expect(missingObjectConfig).toBeNull();
  });

  it('exports mappingRevisions object with expected operations', async () => {
    const mod = await importModule();

    expect(mod.mappingRevisions.save).toBe(mod.save);
    expect(mod.mappingRevisions.list).toBe(mod.list);
    expect(mod.mappingRevisions.get).toBe(mod.get);
    expect(mod.mappingRevisions.getConfig).toBe(mod.getConfig);
  });
});
