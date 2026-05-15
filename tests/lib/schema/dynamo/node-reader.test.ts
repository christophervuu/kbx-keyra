import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => {
  class QueryCommand {
    constructor(public readonly input: unknown) {}
  }

  return {
    QueryCommand,
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

function setNodesTable(value: string | undefined): void {
  const envStore = getEnvStore();

  if (value === undefined) {
    delete envStore.SCHEMA_NODES_TABLE;
    return;
  }

  envStore.SCHEMA_NODES_TABLE = value;
}

async function importModule() {
  return import('../../../../src/lib/schema/dynamo/node-reader.js');
}

describe('dynamo node-reader', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    setNodesTable('keyra-schema-nodes');
    sendMock.mockResolvedValue({ Items: [] });
  });

  it('getParentChain returns 3 ancestor paths for depth-3 node (AE-07)', async () => {
    sendMock.mockResolvedValue({ Items: [] });
    const mod = await importModule();

    const chain = await mod.getParentChain('schema-1', 'Order.Parties.Buyer.PostalCode');

    expect(chain).toEqual(['Order', 'Order.Parties', 'Order.Parties.Buyer']);
  });

  it('getParentChain for root node returns empty array', async () => {
    const mod = await importModule();

    const chain = await mod.getParentChain('schema-1', 'Order');

    expect(chain).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('getNodeChildren returns parsed children from parentPath-index query', async () => {
    sendMock.mockResolvedValue({
      Items: [
        {
          schemaId: 'schema-1',
          path: 'Order.Address.City',
          fieldName: 'City',
          type: 'string',
          depth: 2,
          isArray: false,
          isRequired: true,
          parentPath: 'Order.Address',
          childCount: 0,
          subtreeFieldCount: 1,
          embeddingText: 'Order.Address.City | City (string)',
        },
        {
          schemaId: 'schema-1',
          path: 'Order.Address.PostalCode',
          fieldName: 'PostalCode',
          type: 'string',
          depth: 2,
          isArray: false,
          isRequired: true,
          parentPath: 'Order.Address',
          childCount: 0,
          subtreeFieldCount: 1,
          embeddingText: 'Order.Address.PostalCode | PostalCode (string)',
        },
      ],
    });

    const mod = await importModule();
    const children = await mod.getNodeChildren('schema-1', 'Order.Address');

    expect(children).toHaveLength(2);
    expect(children.map((item) => item.path)).toEqual([
      'Order.Address.City',
      'Order.Address.PostalCode',
    ]);
  });
});
