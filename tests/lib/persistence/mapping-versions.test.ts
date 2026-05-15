import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MappingConfig, MappingVersionItem } from '../../../src/lib/persistence/types.js';

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
  return import('../../../src/lib/persistence/mapping-versions.js');
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

function makeVersionItem(overrides: Partial<MappingVersionItem> = {}): MappingVersionItem {
  return {
    mappingId: 'mapping-1',
    version: 1,
    savedAt: '2026-05-15T00:00:00.000Z',
    savedBy: 'user-1',
    ruleCount: 2,
    configS3Key: 'mappings/mapping-1/versions/v1.json',
    ...overrides,
  };
}

describe('persistence mapping-versions', () => {
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

  it('save writes config to S3 and metadata to DynamoDB', async () => {
    s3SendMock.mockResolvedValueOnce({});
    dynamoSendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Items: [makeVersionItem()] });

    const mod = await importModule();

    const result = await mod.save('mapping-1', {
      version: 4,
      savedBy: 'user-123',
      ruleCount: 7,
      config: makeConfig({ version: 4, name: 'Updated' }),
    });

    expect(result.mappingId).toBe('mapping-1');
    expect(result.version).toBe(4);
    expect(result.savedBy).toBe('user-123');
    expect(result.ruleCount).toBe(7);
    expect(result.configS3Key).toBe('mappings/mapping-1/versions/v4.json');
    expect(result.savedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);

    const putObjectCommand = s3SendMock.mock.calls[0]?.[0] as {
      input: { Bucket: string; Key: string; ContentType: string; Body: string };
    };
    expect(putObjectCommand.input.Bucket).toBe('keyra-storage');
    expect(putObjectCommand.input.Key).toBe('mappings/mapping-1/versions/v4.json');
    expect(putObjectCommand.input.ContentType).toBe('application/json');

    const putCommand = dynamoSendMock.mock.calls[0]?.[0] as {
      input: { TableName: string; Item: MappingVersionItem };
    };
    expect(putCommand.input.TableName).toBe('keyra-mapping-versions');
    expect(putCommand.input.Item).toMatchObject({
      mappingId: 'mapping-1',
      version: 4,
      savedBy: 'user-123',
      ruleCount: 7,
      configS3Key: 'mappings/mapping-1/versions/v4.json',
    });
  });

  it('save triggers prune when versions exceed 50 and deletes oldest', async () => {
    const existing = Array.from({ length: 51 }, (_, i) =>
      makeVersionItem({
        version: i + 1,
        configS3Key: `mappings/mapping-1/versions/v${i + 1}.json`,
      }),
    );

    s3SendMock.mockResolvedValueOnce({});
    dynamoSendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Items: existing })
      .mockResolvedValueOnce({});
    s3SendMock.mockResolvedValueOnce({});

    const mod = await importModule();

    await mod.save('mapping-1', {
      version: 52,
      savedBy: 'user-1',
      ruleCount: 3,
      config: makeConfig({ version: 52 }),
    });

    const deleteCommand = dynamoSendMock.mock.calls[2]?.[0] as {
      input: { Key: { mappingId: string; version: number } };
    };
    expect(deleteCommand.input.Key).toEqual({ mappingId: 'mapping-1', version: 1 });

    const deleteObjectCommand = s3SendMock.mock.calls[1]?.[0] as {
      input: { Key: string };
    };
    expect(deleteObjectCommand.input.Key).toBe('mappings/mapping-1/versions/v1.json');
  });

  it('save does not fail when prune fails and logs warning', async () => {
    s3SendMock.mockResolvedValueOnce({});
    dynamoSendMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Query failure during prune'));

    const mod = await importModule();

    await expect(
      mod.save('mapping-1', {
        version: 2,
        savedBy: 'user-2',
        ruleCount: 1,
        config: makeConfig({ version: 2 }),
      }),
    ).resolves.toMatchObject({
      mappingId: 'mapping-1',
      version: 2,
    });

    expect(warnSpy).toHaveBeenCalled();
  });

  it('list queries descending by version', async () => {
    dynamoSendMock.mockResolvedValue({
      Items: [makeVersionItem({ version: 3 }), makeVersionItem({ version: 2 }), makeVersionItem({ version: 1 })],
    });

    const mod = await importModule();
    const result = await mod.list('mapping-1');

    expect(result.map((item) => item.version)).toEqual([3, 2, 1]);

    const queryCommand = dynamoSendMock.mock.calls[0]?.[0] as {
      input: {
        TableName: string;
        KeyConditionExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
        ScanIndexForward: boolean;
      };
    };
    expect(queryCommand.input).toEqual({
      TableName: 'keyra-mapping-versions',
      KeyConditionExpression: 'mappingId = :mappingId',
      ExpressionAttributeValues: { ':mappingId': 'mapping-1' },
      ScanIndexForward: false,
    });
  });

  it('get returns item or null', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({ Item: makeVersionItem({ version: 7 }) });
    dynamoSendMock.mockResolvedValueOnce({ Item: undefined });

    const found = await mod.get('mapping-1', 7);
    const missing = await mod.get('mapping-1', 999);

    expect(found?.version).toBe(7);
    expect(missing).toBeNull();
  });

  it('getConfig returns parsed config and null for missing cases', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({
      Item: makeVersionItem({ version: 5, configS3Key: 'mappings/mapping-1/versions/v5.json' }),
    });
    s3SendMock.mockResolvedValueOnce({
      Body: {
        transformToString: vi.fn().mockResolvedValue(JSON.stringify(makeConfig({ version: 5, name: 'v5' }))),
      },
    });

    const foundConfig = await mod.getConfig('mapping-1', 5);
    expect(foundConfig?.version).toBe(5);
    expect(foundConfig?.name).toBe('v5');

    dynamoSendMock.mockResolvedValueOnce({ Item: undefined });
    const missingVersionConfig = await mod.getConfig('mapping-1', 999);
    expect(missingVersionConfig).toBeNull();

    dynamoSendMock.mockResolvedValueOnce({
      Item: makeVersionItem({ version: 6, configS3Key: 'mappings/mapping-1/versions/v6.json' }),
    });
    s3SendMock.mockRejectedValueOnce({ name: 'NoSuchKey' });

    const missingObjectConfig = await mod.getConfig('mapping-1', 6);
    expect(missingObjectConfig).toBeNull();
  });

  it('exports mappingVersions object with expected operations', async () => {
    const mod = await importModule();

    expect(mod.mappingVersions.save).toBe(mod.save);
    expect(mod.mappingVersions.list).toBe(mod.list);
    expect(mod.mappingVersions.get).toBe(mod.get);
    expect(mod.mappingVersions.getConfig).toBe(mod.getConfig);
  });
});
