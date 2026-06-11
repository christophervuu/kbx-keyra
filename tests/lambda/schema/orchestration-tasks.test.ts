import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

const schemaMocks = vi.hoisted(() => ({
  parseJsonSchema: vi.fn(),
  parseXsd: vi.fn(),
  storeProcessedContent: vi.fn(),
  updateSchemaStatus: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => {
  class GetObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  class PutObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  class S3Client {
    send = sendMock;
  }

  return {
    GetObjectCommand,
    PutObjectCommand,
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
  return import('../../../src/lambda/schema/orchestration-tasks.js');
}

function createNodes(count: number) {
  return Array.from({ length: count }, (_, idx) => ({
    schemaId: 'schema-1',
    path: `Order.Field${idx + 1}`,
    fieldName: `Field${idx + 1}`,
    type: 'string',
    depth: 0,
    isArray: false,
    isRequired: false,
    childCount: 0,
    subtreeFieldCount: 1,
    embeddingText: `Order.Field${idx + 1} | Field${idx + 1} (string)`,
  }));
}

describe('schema orchestration tasks', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    schemaMocks.parseJsonSchema.mockReset();
    schemaMocks.parseXsd.mockReset();
    schemaMocks.storeProcessedContent.mockReset().mockResolvedValue('schemas/schema-1/content.json');
    schemaMocks.updateSchemaStatus.mockReset().mockResolvedValue(undefined);
    setSchemaBucket('keyra-schema-bucket');
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.spyOn(console, 'info').mockImplementation(() => {
      // noop
    });
  });

  it('parseSchemaTask chunks 23,000 nodes into 46 batches and writes manifests', async () => {
    sendMock.mockResolvedValue({
      Body: {
        transformToString: vi.fn().mockResolvedValue('{"type":"object","properties":{}}'),
      },
    });
    schemaMocks.parseJsonSchema.mockReturnValue({
      nodes: createNodes(23_000),
      fieldCount: 23_000,
    });

    const mod = await importModule();
    const result = await mod.parseSchemaTask({
      schemaId: 'schema-1',
      s3Key: 'schemas/schema-1/original.json',
      format: 'json-schema',
    });

    expect(result.batchReferences).toHaveLength(46);
    expect(result.batchReferences[0]).toMatchObject({ batchIndex: 0, nodeCount: 500 });
    expect(result.batchReferences[45]).toMatchObject({ batchIndex: 45, nodeCount: 500 });
    expect(result.fieldCount).toBe(23_000);
    expect(sendMock).toHaveBeenCalledTimes(47);
  });

  it('aggregateResultsTask sums totals and stores processed content', async () => {
    const mod = await importModule();

    const summary = await mod.aggregateResultsTask({
      schemaId: 'schema-1',
      fieldCount: 1000,
      batchResults: [
        { batchIndex: 0, nodesWritten: 500 },
        { batchIndex: 1, nodesWritten: 500, errors: ['partial failure'] },
      ],
    });

    expect(summary).toEqual({
      schemaId: 'schema-1',
      fieldCount: 1000,
      written: 1000,
      failed: 1,
    });
    expect(schemaMocks.storeProcessedContent).toHaveBeenCalledTimes(1);
  });

  it('handleErrorTask updates metadata to error status', async () => {
    const mod = await importModule();

    const result = await mod.handleErrorTask({
      schemaId: 'schema-err',
      error: {
        Error: 'States.TaskFailed',
      },
    });

    expect(result.status).toBe('error');
    expect(schemaMocks.updateSchemaStatus).toHaveBeenCalledWith(
      'schema-err',
      'error',
      expect.objectContaining({
        name: expect.stringContaining('error:'),
      }),
    );
  });

  it('parseSchemaTask emits retrieval field telemetry for parsed nodes', async () => {
    const infoSpy = vi.spyOn(console, 'info');
    sendMock.mockResolvedValue({
      Body: {
        transformToString: vi.fn().mockResolvedValue('{"type":"object","properties":{}}'),
      },
    });
    schemaMocks.parseJsonSchema.mockReturnValue({
      nodes: [
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
      ],
      fieldCount: 1,
    });

    const mod = await importModule();
    const result = await mod.parseSchemaTask({
      schemaId: 'schema-1',
      s3Key: 'schemas/schema-1/original.json',
      format: 'json-schema',
    });

    expect(result.fieldCount).toBe(1);
    expect(infoSpy).toHaveBeenCalledWith(
      '[schema-orchestration] parsed retrieval fields telemetry',
      expect.objectContaining({
        schemaId: 'schema-1',
        format: 'json-schema',
        fieldCount: 1,
        nodeCount: 1,
        nodesWithEmbeddingText: 1,
        nodesWithEmbeddingVector: 1,
        approxEmbeddingBytes: 24,
      }),
    );
  });
});
