import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

const schemaMocks = vi.hoisted(() => ({
  batchWriteSchemaNodes: vi.fn(),
  bulkIndexSchemaNodes: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => {
  class GetObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  class S3Client {
    send = sendMock;
  }

  return {
    GetObjectCommand,
    S3Client,
  };
});

vi.mock('../../../src/lib/schema/index.js', () => schemaMocks);

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

function setSchemaBucket(value: string | undefined): void {
  const envStore = getEnvStore();
  if (value === undefined) {
    delete envStore.SCHEMA_BUCKET;
    return;
  }

  envStore.SCHEMA_BUCKET = value;
}

async function importModule() {
  return import('../../../src/lambda/schema/process-batch.js');
}

describe('process-batch handler', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    schemaMocks.batchWriteSchemaNodes.mockReset();
    schemaMocks.bulkIndexSchemaNodes.mockReset();
    setSchemaBucket('keyra-schema-bucket');
  });

  it('reads batch from S3 and calls DynamoDB + OpenSearch', async () => {
    sendMock.mockResolvedValue({
      Body: {
        transformToString: vi.fn().mockResolvedValue(
          JSON.stringify([
            {
              schemaId: 'schema-1',
              path: 'Order.Id',
              fieldName: 'Id',
              type: 'string',
              depth: 0,
              isArray: false,
              isRequired: true,
              childCount: 0,
              subtreeFieldCount: 1,
              embeddingText: 'Order.Id | Id (string)',
            },
          ]),
        ),
      },
    });
    schemaMocks.batchWriteSchemaNodes.mockResolvedValue({ written: 1, failed: 0 });
    schemaMocks.bulkIndexSchemaNodes.mockResolvedValue({ indexed: 1, failed: 0 });

    const mod = await importModule();
    const result = await mod.handler({
      batchIndex: 0,
      schemaId: 'schema-1',
      s3Key: 'schemas/schema-1/batches/batch-0.json',
      nodeCount: 1,
    });

    expect(schemaMocks.batchWriteSchemaNodes).toHaveBeenCalledTimes(1);
    expect(schemaMocks.bulkIndexSchemaNodes).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      batchIndex: 0,
      nodesWritten: 1,
      nodesIndexed: 1,
    });
  });

  it('returns error info when DynamoDB write fails', async () => {
    sendMock.mockResolvedValue({
      Body: {
        transformToString: vi.fn().mockResolvedValue('[]'),
      },
    });
    schemaMocks.batchWriteSchemaNodes.mockRejectedValue(new Error('Dynamo unavailable'));

    const mod = await importModule();
    const result = await mod.handler({
      batchIndex: 1,
      schemaId: 'schema-1',
      s3Key: 'schemas/schema-1/batches/batch-1.json',
      nodeCount: 0,
    });

    expect(result.batchIndex).toBe(1);
    expect(result.nodesWritten).toBe(0);
    expect(result.nodesIndexed).toBe(0);
    expect(result.errors?.[0]).toContain('Dynamo unavailable');
  });

  it('returns partial success info when OpenSearch fails', async () => {
    sendMock.mockResolvedValue({
      Body: {
        transformToString: vi.fn().mockResolvedValue('[]'),
      },
    });
    schemaMocks.batchWriteSchemaNodes.mockResolvedValue({ written: 5, failed: 0 });
    schemaMocks.bulkIndexSchemaNodes.mockRejectedValue(new Error('OpenSearch unavailable'));

    const mod = await importModule();
    const result = await mod.handler({
      batchIndex: 2,
      schemaId: 'schema-1',
      s3Key: 'schemas/schema-1/batches/batch-2.json',
      nodeCount: 5,
    });

    expect(result.batchIndex).toBe(2);
    expect(result.nodesWritten).toBe(5);
    expect(result.nodesIndexed).toBe(0);
    expect(result.errors?.[0]).toContain('OpenSearch unavailable');
  });
});
