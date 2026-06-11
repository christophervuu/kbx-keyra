import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

const schemaMocks = vi.hoisted(() => ({
  batchWriteSchemaNodes: vi.fn(),
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
    setSchemaBucket('keyra-schema-bucket');
    vi.spyOn(console, 'info').mockImplementation(() => {
      // noop
    });
  });

  it('reads batch from S3 and writes DynamoDB nodes', async () => {
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

    const mod = await importModule();
    const result = await mod.handler({
      batchIndex: 0,
      schemaId: 'schema-1',
      s3Key: 'schemas/schema-1/batches/batch-0.json',
      nodeCount: 1,
    });

    expect(schemaMocks.batchWriteSchemaNodes).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      batchIndex: 0,
      nodesWritten: 1,
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
    expect(result.errors?.[0]).toContain('Dynamo unavailable');
  });

  it('emits retrieval field telemetry for batch embedding payloads', async () => {
    const infoSpy = vi.spyOn(console, 'info');
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
              embedding: [0.1, 0.2, 0.3],
            },
          ]),
        ),
      },
    });
    schemaMocks.batchWriteSchemaNodes.mockResolvedValue({ written: 1, failed: 0 });

    const mod = await importModule();
    const result = await mod.handler({
      batchIndex: 3,
      schemaId: 'schema-1',
      s3Key: 'schemas/schema-1/batches/batch-3.json',
      nodeCount: 1,
    });

    expect(result.nodesWritten).toBe(1);
    expect(infoSpy).toHaveBeenCalledWith(
      '[schema-process-batch] retrieval fields batch telemetry',
      expect.objectContaining({
        schemaId: 'schema-1',
        batchIndex: 3,
        nodeCount: 1,
        nodesWithEmbeddingText: 1,
        nodesWithEmbeddingVector: 1,
        approxEmbeddingBytes: 24,
      }),
    );
  });
});
