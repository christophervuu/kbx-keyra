import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SchemaNode } from '../../../../src/lib/schema/types.js';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => {
  class BatchWriteCommand {
    constructor(public readonly input: unknown) {}
  }

  class PutCommand {
    constructor(public readonly input: unknown) {}
  }

  class UpdateCommand {
    constructor(public readonly input: unknown) {}
  }

  class GetCommand {
    constructor(public readonly input: unknown) {}
  }

  return {
    BatchWriteCommand,
    PutCommand,
    UpdateCommand,
    GetCommand,
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

const ORIGINAL_NODES_TABLE = getEnvStore().SCHEMA_NODES_TABLE;

function setNodesTable(value: string | undefined): void {
  const envStore = getEnvStore();

  if (value === undefined) {
    delete envStore.SCHEMA_NODES_TABLE;
    return;
  }

  envStore.SCHEMA_NODES_TABLE = value;
}

async function importModule() {
  return import('../../../../src/lib/schema/dynamo/node-writer.js');
}

function createNodes(count: number): SchemaNode[] {
  return Array.from({ length: count }, (_, index) => ({
    schemaId: 'schema-1',
    path: `Order.field${index + 1}`,
    fieldName: `field${index + 1}`,
    type: 'string',
    depth: 0,
    isArray: false,
    isRequired: false,
    childCount: 0,
    subtreeFieldCount: 1,
    embeddingText: `Order.field${index + 1} | field${index + 1} (string)`,
  }));
}

describe('node-writer', () => {
  beforeEach(() => {
    sendMock.mockReset();
    vi.resetModules();
    setNodesTable('keyra-schema-nodes');
  });

  afterEach(() => {
    setNodesTable(ORIGINAL_NODES_TABLE);
    vi.useRealTimers();
  });

  it('writes 10 nodes in one batch', async () => {
    sendMock.mockResolvedValue({ UnprocessedItems: {} });
    const mod = await importModule();

    const result = await mod.batchWriteSchemaNodes(createNodes(10));

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ written: 10, failed: 0 });
  });

  it('writes 50 nodes in two batches', async () => {
    sendMock.mockResolvedValue({ UnprocessedItems: {} });
    const mod = await importModule();

    const result = await mod.batchWriteSchemaNodes(createNodes(50));

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ written: 50, failed: 0 });
  });

  it('writes 75 nodes in three batches', async () => {
    sendMock.mockResolvedValue({ UnprocessedItems: {} });
    const mod = await importModule();

    const result = await mod.batchWriteSchemaNodes(createNodes(75));

    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ written: 75, failed: 0 });
  });

  it('retries unprocessed items and eventually succeeds', async () => {
    vi.useFakeTimers();
    sendMock
      .mockResolvedValueOnce({
        UnprocessedItems: {
          'keyra-schema-nodes': [{ PutRequest: { Item: createNodes(1)[0] } }],
        },
      })
      .mockResolvedValueOnce({ UnprocessedItems: {} });

    const mod = await importModule();
    const promise = mod.batchWriteSchemaNodes(createNodes(2));
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ written: 2, failed: 0 });
  });

  it('returns failed count after max retries exceeded', async () => {
    vi.useFakeTimers();
    const unprocessed = {
      'keyra-schema-nodes': [{ PutRequest: { Item: createNodes(1)[0] } }],
    };
    sendMock.mockResolvedValue({ UnprocessedItems: unprocessed });

    const mod = await importModule();
    const promise = mod.batchWriteSchemaNodes(createNodes(1));
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(sendMock).toHaveBeenCalledTimes(6);
    expect(result).toEqual({ written: 0, failed: 1 });
  });

  it('handles 500-node chunking without logic errors', async () => {
    sendMock.mockResolvedValue({ UnprocessedItems: {} });
    const mod = await importModule();

    const result = await mod.batchWriteSchemaNodes(createNodes(500));

    expect(sendMock).toHaveBeenCalledTimes(20);
    expect(result).toEqual({ written: 500, failed: 0 });
  });

  it('throws configuration error when SCHEMA_NODES_TABLE is missing', async () => {
    setNodesTable(undefined);
    vi.resetModules();
    const mod = await importModule();

    await expect(mod.batchWriteSchemaNodes(createNodes(1))).rejects.toMatchObject({
      name: 'NodeWriterError',
      code: 'SCHEMA_DYNAMO_CONFIG_ERROR',
    });
  });
});
