import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SchemaNode } from '../../../../src/lib/schema/types.js';

const { existsMock, createMock, bulkMock, deleteByQueryMock } = vi.hoisted(() => ({
  existsMock: vi.fn(),
  createMock: vi.fn(),
  bulkMock: vi.fn(),
  deleteByQueryMock: vi.fn(),
}));

vi.mock('@opensearch-project/opensearch', () => {
  class Client {
    indices = {
      exists: existsMock,
      create: createMock,
    };

    bulk = bulkMock;

    deleteByQuery = deleteByQueryMock;
  }

  return {
    Client,
  };
});

vi.mock('@opensearch-project/opensearch/aws', () => {
  return {
    AwsSigv4Signer: vi.fn().mockReturnValue({}),
  };
});

vi.mock('@aws-sdk/credential-provider-node', () => {
  return {
    defaultProvider: vi.fn().mockReturnValue(async () => ({
      accessKeyId: 'test',
      secretAccessKey: 'test',
      sessionToken: 'test',
    })),
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

const ORIGINAL_OPENSEARCH_ENDPOINT = getEnvStore().OPENSEARCH_ENDPOINT;

function setOpenSearchEndpoint(value: string | undefined): void {
  const envStore = getEnvStore();

  if (value === undefined) {
    delete envStore.OPENSEARCH_ENDPOINT;
    return;
  }

  envStore.OPENSEARCH_ENDPOINT = value;
}

async function importIndexerModule() {
  return import('../../../../src/lib/schema/opensearch/indexer.js');
}

function createNodes(count: number): SchemaNode[] {
  return Array.from({ length: count }, (_, index) => ({
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
}

describe('opensearch indexer', () => {
  beforeEach(() => {
    vi.resetModules();
    existsMock.mockReset();
    createMock.mockReset();
    bulkMock.mockReset();
    deleteByQueryMock.mockReset();
    setOpenSearchEndpoint('https://test-collection.us-east-1.aoss.amazonaws.com');
  });

  afterEach(() => {
    setOpenSearchEndpoint(ORIGINAL_OPENSEARCH_ENDPOINT);
  });

  it('ensureIndexExists creates index when missing', async () => {
    existsMock.mockResolvedValue({ body: false });
    createMock.mockResolvedValue({});

    const mod = await importIndexerModule();
    await mod.ensureIndexExists();

    expect(existsMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('ensureIndexExists skips creation when index already exists', async () => {
    existsMock.mockResolvedValue({ body: true });

    const mod = await importIndexerModule();
    await mod.ensureIndexExists();

    expect(existsMock).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('ensureIndexExists sends mapping with required fields', async () => {
    existsMock.mockResolvedValue({ body: false });
    createMock.mockResolvedValue({});

    const mod = await importIndexerModule();
    await mod.ensureIndexExists();

    const call = createMock.mock.calls[0]?.[0] as {
      body: {
        mappings: {
          properties: Record<string, unknown>;
        };
      };
    };

    expect(call.body.mappings.properties.schemaId).toBeDefined();
    expect(call.body.mappings.properties.path).toBeDefined();
    expect(call.body.mappings.properties.fieldName).toBeDefined();
    expect(call.body.mappings.properties.embeddingText).toBeDefined();
    expect(call.body.mappings.properties.embedding).toBeDefined();
    expect(call.body.mappings.properties.type).toBeDefined();
    expect(call.body.mappings.properties.depth).toBeDefined();
    expect(call.body.mappings.properties.parentPath).toBeDefined();
    expect(call.body.mappings.properties.isArray).toBeDefined();
  });

  it('bulkIndexSchemaNodes indexes 100 nodes in one bulk call', async () => {
    bulkMock.mockResolvedValue({ body: { errors: false } });

    const mod = await importIndexerModule();
    const result = await mod.bulkIndexSchemaNodes(createNodes(100));

    expect(bulkMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ indexed: 100, failed: 0 });
  });

  it('bulkIndexSchemaNodes indexes 1000 nodes in two bulk calls', async () => {
    bulkMock.mockResolvedValue({ body: { errors: false } });

    const mod = await importIndexerModule();
    const result = await mod.bulkIndexSchemaNodes(createNodes(1000));

    expect(bulkMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ indexed: 1000, failed: 0 });
  });

  it('bulk index document IDs follow schemaId#path format', async () => {
    bulkMock.mockResolvedValue({ body: { errors: false } });

    const mod = await importIndexerModule();
    await mod.bulkIndexSchemaNodes(createNodes(1));

    const firstBulkCall = bulkMock.mock.calls[0]?.[0] as { body: unknown[] };
    const action = firstBulkCall.body[0] as { index: { _id: string } };
    expect(action.index._id).toBe('schema-1#Order.Field1');
  });

  it('applies refresh wait_for on final batch only', async () => {
    bulkMock.mockResolvedValue({ body: { errors: false } });

    const mod = await importIndexerModule();
    await mod.bulkIndexSchemaNodes(createNodes(501));

    const firstCall = bulkMock.mock.calls[0]?.[0] as { refresh?: string };
    const secondCall = bulkMock.mock.calls[1]?.[0] as { refresh?: string };

    expect(firstCall.refresh).toBeUndefined();
    expect(secondCall.refresh).toBe('wait_for');
  });

  it('reports indexed and failed counts for partial failures', async () => {
    bulkMock.mockResolvedValue({
      body: {
        errors: true,
        items: [
          { index: {} },
          { index: { error: { type: 'mapper_parsing_exception' } } },
          { index: {} },
        ],
      },
    });

    const mod = await importIndexerModule();
    const result = await mod.bulkIndexSchemaNodes(createNodes(3));

    expect(result).toEqual({ indexed: 2, failed: 1 });
  });

  it('deleteSchemaDocuments uses delete_by_query with schemaId term filter', async () => {
    deleteByQueryMock.mockResolvedValue({});

    const mod = await importIndexerModule();
    await mod.deleteSchemaDocuments('schema-123');

    expect(deleteByQueryMock).toHaveBeenCalledTimes(1);
    const call = deleteByQueryMock.mock.calls[0]?.[0] as {
      body: {
        query: {
          term: {
            schemaId: string;
          };
        };
      };
    };

    expect(call.body.query.term.schemaId).toBe('schema-123');
  });
});
