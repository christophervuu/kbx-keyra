import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateJsonSchemaString } from './fixtures/generate-schema.js';
import { parseJsonSchema as realParseJsonSchema } from '../../../src/lib/schema/parser/parse-json-schema.js';
import { parseXsd as realParseXsd } from '../../../src/lib/schema/parser/parse-xsd.js';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

const schemaLibMocks = vi.hoisted(() => ({
  parseJsonSchema: vi.fn(),
  parseXsd: vi.fn(),
  storeProcessedContent: vi.fn(),
  updateSchemaStatus: vi.fn(),
  batchWriteSchemaNodes: vi.fn(),
  bulkIndexSchemaNodes: vi.fn(),
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

vi.mock('../../../src/lib/schema/index.js', () => {
  return {
    ...schemaLibMocks,
    parseJsonSchema: vi.fn(realParseJsonSchema),
    parseXsd: vi.fn(realParseXsd),
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

function setSchemaBucket(value: string | undefined): void {
  const envStore = getEnvStore();
  if (value === undefined) {
    delete envStore.SCHEMA_BUCKET;
    return;
  }

  envStore.SCHEMA_BUCKET = value;
}

async function importOrchestrationModule() {
  return import('../../../src/lambda/schema/orchestration-tasks.js');
}

async function importProcessBatchModule() {
  return import('../../../src/lambda/schema/process-batch.js');
}

describe('schema ingestion integration - step functions path', () => {
  beforeEach(() => {
    vi.resetModules();
    setSchemaBucket('keyra-schema-bucket');
    sendMock.mockReset();

    schemaLibMocks.storeProcessedContent.mockReset().mockResolvedValue('schemas/schema-1/content.json');
    schemaLibMocks.updateSchemaStatus.mockReset().mockResolvedValue(undefined);
    schemaLibMocks.batchWriteSchemaNodes.mockReset().mockImplementation(async (nodes: unknown[]) => ({ written: nodes.length, failed: 0 }));
    schemaLibMocks.bulkIndexSchemaNodes.mockReset().mockImplementation(async (nodes: unknown[]) => ({ indexed: nodes.length, failed: 0 }));
  });

  it('500-field schema threshold is orchestrated and 23,000 schema chunks into 46x500 batches (AE-04)', async () => {
    const largeSchema = generateJsonSchemaString(23_000);

    sendMock.mockImplementation(async (command: { input?: { Key?: string } }) => {
      const key = command.input?.Key ?? '';
      if (key.endsWith('/original.json')) {
        return {
          Body: {
            transformToString: vi.fn().mockResolvedValue(largeSchema),
          },
        };
      }

      return {};
    });

    const mod = await importOrchestrationModule();
    const result = await mod.parseSchemaTask({
      schemaId: 'schema-1',
      s3Key: 'schemas/schema-1/original.json',
      format: 'json-schema',
    });

    expect(result.fieldCount).toBe(23_000);
    expect(result.batchReferences.length).toBeGreaterThanOrEqual(46);
    expect(result.batchReferences[0]).toMatchObject({ batchIndex: 0, nodeCount: 500 });
    expect(result.batchReferences.every((batch) => batch.nodeCount > 0 && batch.nodeCount <= 500)).toBe(true);

    const last = result.batchReferences[result.batchReferences.length - 1];
    expect(last?.nodeCount).toBeGreaterThan(0);
    expect(last?.nodeCount).toBeLessThanOrEqual(500);

    expect(sendMock).toHaveBeenCalledTimes(result.batchReferences.length + 1);
  }, 30_000);

  it('batch worker processes one 500-node batch and writes/indexes expected counts', async () => {
    const batchNodes = Array.from({ length: 500 }, (_, index) => ({
      schemaId: 'schema-1',
      path: `Order.Field${index + 1}`,
      fieldName: `Field${index + 1}`,
      type: 'string',
      depth: 0,
      isArray: false,
      isRequired: false,
      childCount: 0,
      subtreeFieldCount: 1,
      embeddingText: `Order.Field${index + 1} | Field${index + 1} (string)`,
    }));

    sendMock.mockResolvedValue({
      Body: {
        transformToString: vi.fn().mockResolvedValue(JSON.stringify(batchNodes)),
      },
    });

    const mod = await importProcessBatchModule();
    const result = await mod.handler({
      batch: {
        schemaId: 'schema-1',
        batchIndex: 0,
        s3Key: 'schemas/schema-1/batches/batch-0.json',
        nodeCount: 500,
      },
    });

    expect(result).toEqual({
      batchIndex: 0,
      nodesWritten: 500,
      nodesIndexed: 500,
    });
    expect(schemaLibMocks.batchWriteSchemaNodes).toHaveBeenCalledTimes(1);
    expect(schemaLibMocks.bulkIndexSchemaNodes).toHaveBeenCalledTimes(1);
  });
});
