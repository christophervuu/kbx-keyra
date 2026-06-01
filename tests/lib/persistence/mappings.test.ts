import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MappingConfig, MappingItem } from '../../../src/lib/persistence/types.js';

const { dynamoSendMock, s3SendMock, randomUuidMock } = vi.hoisted(() => ({
  dynamoSendMock: vi.fn(),
  s3SendMock: vi.fn(),
  randomUuidMock: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/clients.js', () => ({
  dynamoClient: {
    send: dynamoSendMock,
  },
  s3Client: {
    send: s3SendMock,
  },
}));

async function importMappingsModule() {
  return import('../../../src/lib/persistence/mappings.js');
}

function makeConfig(overrides: Partial<MappingConfig> = {}): MappingConfig {
  return {
    name: 'Mapping A',
    version: 1,
    engineVersion: '1.0.0',
    sourceSchemaRef: {
      schemaId: 'schema-source',
      type: 'local',
    },
    targetSchemaRef: {
      schemaId: 'schema-target',
      type: 'local',
    },
    config: {},
    rules: [],
    ...overrides,
  };
}

function makeMappingItem(overrides: Partial<MappingItem> = {}): MappingItem {
  return {
    mappingId: 'mapping-1',
    projectId: 'project-1',
    name: 'Mapping 1',
    version: 1,
    revision: 1,
    latestVersion: null,
    configHash: 'hash-1',
    sourceSchemaId: 'schema-source',
    targetSchemaId: 'schema-target',
    status: 'draft',
    ruleCount: 0,
    coverage: 0,
    configS3Key: 'mappings/mapping-1/config.json',
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('persistence mappings', () => {
  beforeEach(() => {
    vi.resetModules();
    dynamoSendMock.mockReset();
    s3SendMock.mockReset();
    randomUuidMock.mockReset();
    vi.stubGlobal('crypto', {
      randomUUID: () => randomUuidMock(),
    } satisfies Pick<Crypto, 'randomUUID'>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('create stores config in S3 and metadata in DynamoDB with revision/version 1', async () => {
    randomUuidMock.mockReturnValue('mapping-created-1');
    s3SendMock.mockResolvedValue({});
    dynamoSendMock.mockResolvedValue({});
    const mappings = await importMappingsModule();

    const result = await mappings.create({
      projectId: 'project-1',
      name: 'Mapping A',
      config: makeConfig(),
    });

    expect(result.mappingId).toBe('mapping-created-1');
    expect(result.version).toBe(1);
    expect(result.revision).toBe(1);
    expect(result.latestVersion).toBeNull();
    expect(result.configHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.configS3Key).toBe('mappings/mapping-created-1/config.json');

    expect(s3SendMock).toHaveBeenCalledTimes(1);
    const s3Command = s3SendMock.mock.calls[0]?.[0] as {
      input: { Bucket: string; Key: string; ContentType: string; Body: string };
    };
    expect(s3Command.input.Bucket).toBe('keyra-storage');
    expect(s3Command.input.Key).toBe('mappings/mapping-created-1/config.json');
    expect(s3Command.input.ContentType).toBe('application/json');

    expect(dynamoSendMock).toHaveBeenCalledTimes(1);
    const putCommand = dynamoSendMock.mock.calls[0]?.[0] as {
      input: { TableName: string; Item: MappingItem };
    };
    expect(putCommand.input.TableName).toBe('keyra-mappings');
    expect(putCommand.input.Item).toEqual(result);
  });

  it('get returns item or null', async () => {
    const mappings = await importMappingsModule();

    dynamoSendMock.mockResolvedValueOnce({ Item: makeMappingItem() });
    dynamoSendMock.mockResolvedValueOnce({ Item: undefined });

    const found = await mappings.get('mapping-1');
    const missing = await mappings.get('missing');

    expect(found?.mappingId).toBe('mapping-1');
    expect(missing).toBeNull();
  });

  it('listByProject queries GSI with expected key condition', async () => {
    dynamoSendMock.mockResolvedValue({
      Items: [makeMappingItem({ mappingId: 'mapping-1' }), makeMappingItem({ mappingId: 'mapping-2' })],
    });
    const mappings = await importMappingsModule();

    const result = await mappings.listByProject('project-1');

    expect(result).toHaveLength(2);

    const queryCommand = dynamoSendMock.mock.calls[0]?.[0] as {
      input: {
        TableName: string;
        IndexName: string;
        KeyConditionExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
      };
    };
    expect(queryCommand.input).toEqual({
      TableName: 'keyra-mappings',
      IndexName: 'projectId-index',
      KeyConditionExpression: 'projectId = :projectId',
      ExpressionAttributeValues: {
        ':projectId': 'project-1',
      },
    });
  });

  it('update increments revision/version and writes S3 only when config is provided', async () => {
    const existing = makeMappingItem({ version: 3, revision: 3, configS3Key: 'mappings/mapping-1/config.json' });
    const updated = makeMappingItem({ version: 4, revision: 4, name: 'Updated', updatedAt: '2026-05-15T01:00:00.000Z' });
    const mappings = await importMappingsModule();

    dynamoSendMock.mockResolvedValueOnce({ Item: existing });
    s3SendMock.mockResolvedValueOnce({});
    dynamoSendMock.mockResolvedValueOnce({ Attributes: updated });

    const withConfig = await mappings.update(
      'mapping-1',
      {
        name: 'Updated',
        status: 'ready',
        ruleCount: 5,
        coverage: 80,
      },
      makeConfig({ name: 'Updated', version: 4, rules: [{ target: 'a', type: 'string', expression: 'source("a")' }] }),
    );

    expect(withConfig.version).toBe(4);
    expect(withConfig.revision).toBe(4);
    expect(s3SendMock).toHaveBeenCalledTimes(1);

    const updateCommand = dynamoSendMock.mock.calls[1]?.[0] as {
      input: {
        UpdateExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
      };
    };
    expect(updateCommand.input.UpdateExpression).toContain('#revision = #version + :one');
    expect(updateCommand.input.UpdateExpression).toContain('#version = #version + :one');
    expect(updateCommand.input.ExpressionAttributeValues[':one']).toBe(1);

    dynamoSendMock.mockResolvedValueOnce({ Item: existing });
    dynamoSendMock.mockResolvedValueOnce({ Attributes: updated });

    await mappings.update('mapping-1', { name: 'No S3 overwrite' });
    expect(s3SendMock).toHaveBeenCalledTimes(1);
  });

  it('delete removes S3 config and DynamoDB item and is idempotent when missing', async () => {
    const mappings = await importMappingsModule();

    dynamoSendMock.mockResolvedValueOnce({ Item: makeMappingItem() });
    s3SendMock.mockResolvedValueOnce({});
    dynamoSendMock.mockResolvedValueOnce({});

    await expect(mappings.delete('mapping-1')).resolves.toBeUndefined();
    expect(s3SendMock).toHaveBeenCalledTimes(1);

    const deleteCommand = dynamoSendMock.mock.calls[1]?.[0] as {
      input: { TableName: string; Key: { mappingId: string } };
    };
    expect(deleteCommand.input).toEqual({
      TableName: 'keyra-mappings',
      Key: { mappingId: 'mapping-1' },
    });

    dynamoSendMock.mockResolvedValueOnce({ Item: undefined });
    await expect(mappings.delete('missing')).resolves.toBeUndefined();
  });

  it('duplicate creates new mapping ID with version reset and name override', async () => {
    randomUuidMock.mockReturnValue('mapping-duplicated-1');
    const source = makeMappingItem({
      mappingId: 'mapping-source',
      projectId: 'project-1',
      name: 'Original',
      version: 7,
      configS3Key: 'mappings/mapping-source/config.json',
    });
    const sourceConfig = makeConfig({
      id: 'mapping-source',
      projectId: 'project-1',
      name: 'Original',
      version: 7,
      rules: [{ target: 'x', type: 'string', expression: 'source("x")' }],
    });

    const mappings = await importMappingsModule();

    dynamoSendMock.mockResolvedValueOnce({ Item: source });
    s3SendMock.mockResolvedValueOnce({
      Body: {
        transformToString: vi.fn().mockResolvedValue(JSON.stringify(sourceConfig)),
      },
    });
    s3SendMock.mockResolvedValueOnce({});
    dynamoSendMock.mockResolvedValueOnce({});

    const result = await mappings.duplicate('mapping-source', 'Copy Name');

    expect(result.mappingId).toBe('mapping-duplicated-1');
    expect(result.version).toBe(1);
    expect(result.revision).toBe(1);
    expect(result.name).toBe('Copy Name');

    const putCommand = dynamoSendMock.mock.calls[1]?.[0] as { input: { Item: MappingItem } };
    expect(putCommand.input.Item.version).toBe(1);
    expect(putCommand.input.Item.revision).toBe(1);
    expect(putCommand.input.Item.name).toBe('Copy Name');

    const putObjectCommand = s3SendMock.mock.calls[1]?.[0] as { input: { Body: string; Key: string } };
    const writtenConfig = JSON.parse(putObjectCommand.input.Body) as MappingConfig;
    expect(putObjectCommand.input.Key).toBe('mappings/mapping-duplicated-1/config.json');
    expect(writtenConfig.id).toBe('mapping-duplicated-1');
    expect(writtenConfig.name).toBe('Copy Name');
    expect(writtenConfig.version).toBe(1);
  });

  it('exports mappings object with expected operations', async () => {
    const mod = await importMappingsModule();

    expect(mod.mappings.create).toBe(mod.create);
    expect(mod.mappings.get).toBe(mod.get);
    expect(mod.mappings.listByProject).toBe(mod.listByProject);
    expect(mod.mappings.update).toBe(mod.update);
    expect(mod.mappings.delete).toBe(mod.delete);
    expect(mod.mappings.duplicate).toBe(mod.duplicate);
  });
});
