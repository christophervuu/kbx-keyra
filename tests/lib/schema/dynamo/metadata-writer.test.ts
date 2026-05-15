import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SchemaMetadata } from '../../../../src/lib/schema/types.js';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => {
  class PutCommand {
    constructor(public readonly input: unknown) {}
  }

  class UpdateCommand {
    constructor(public readonly input: unknown) {}
  }

  class GetCommand {
    constructor(public readonly input: unknown) {}
  }

  class BatchWriteCommand {
    constructor(public readonly input: unknown) {}
  }

  return {
    PutCommand,
    UpdateCommand,
    GetCommand,
    BatchWriteCommand,
    DynamoDBDocumentClient: {
      from: () => ({ send: sendMock }),
    },
  };
});

vi.mock('@aws-sdk/client-dynamodb', () => {
  class DynamoDBClient {}

  return {
    DynamoDBClient,
  };
});

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

const ORIGINAL_METADATA_TABLE = getEnvStore().SCHEMA_METADATA_TABLE;

function setMetadataTable(value: string | undefined): void {
  const envStore = getEnvStore();

  if (value === undefined) {
    delete envStore.SCHEMA_METADATA_TABLE;
    return;
  }

  envStore.SCHEMA_METADATA_TABLE = value;
}

async function importModule() {
  return import('../../../../src/lib/schema/dynamo/metadata-writer.js');
}

function createMetadata(overrides: Partial<SchemaMetadata> = {}): SchemaMetadata {
  return {
    schemaId: 'schema-1',
    name: 'Order Schema',
    format: 'json-schema',
    fieldCount: 0,
    origin: 'local',
    status: 'ingesting',
    source: {
      type: 'upload',
    },
    createdAt: 'ignored',
    updatedAt: 'ignored',
    ...overrides,
  };
}

describe('metadata-writer', () => {
  beforeEach(() => {
    sendMock.mockReset();
    vi.resetModules();
    setMetadataTable('keyra-schema-metadata');
  });

  afterEach(() => {
    setMetadataTable(ORIGINAL_METADATA_TABLE);
  });

  it('createSchemaMetadata sends PutCommand with timestamps', async () => {
    sendMock.mockResolvedValue({});
    const mod = await importModule();
    const metadata = createMetadata();

    await mod.createSchemaMetadata(metadata);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0]?.[0] as { input: { TableName: string; Item: SchemaMetadata } };
    expect(command.input.TableName).toBe('keyra-schema-metadata');
    expect(command.input.Item.schemaId).toBe('schema-1');
    expect(command.input.Item.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(command.input.Item.updatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('updateSchemaStatus sends UpdateCommand with merged fields', async () => {
    sendMock.mockResolvedValue({});
    const mod = await importModule();

    await mod.updateSchemaStatus('schema-1', 'ready', {
      fieldCount: 50,
      name: 'Small Order',
    });

    const command = sendMock.mock.calls[0]?.[0] as {
      input: {
        TableName: string;
        Key: { schemaId: string };
        UpdateExpression: string;
        ExpressionAttributeNames: Record<string, string>;
        ExpressionAttributeValues: Record<string, unknown>;
      };
    };

    expect(command.input.TableName).toBe('keyra-schema-metadata');
    expect(command.input.Key).toEqual({ schemaId: 'schema-1' });
    expect(command.input.UpdateExpression).toContain('#status = :status');
    expect(command.input.UpdateExpression).toContain('#updatedAt = :updatedAt');
    expect(command.input.UpdateExpression).toContain('#fieldCount = :fieldCount');
    expect(command.input.ExpressionAttributeValues[':status']).toBe('ready');
    expect(command.input.ExpressionAttributeValues[':fieldCount']).toBe(50);
  });

  it('getSchemaMetadata returns null when item not found', async () => {
    sendMock.mockResolvedValue({ Item: undefined });
    const mod = await importModule();

    const result = await mod.getSchemaMetadata('missing-schema');

    expect(result).toBeNull();
  });

  it('throws configuration error when SCHEMA_METADATA_TABLE is missing', async () => {
    setMetadataTable(undefined);
    vi.resetModules();
    const mod = await importModule();

    await expect(mod.getSchemaMetadata('schema-1')).rejects.toMatchObject({
      name: 'MetadataWriterError',
      code: 'SCHEMA_DYNAMO_CONFIG_ERROR',
    });
  });
});
