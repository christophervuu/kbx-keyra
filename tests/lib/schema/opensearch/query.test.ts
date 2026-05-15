import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchMock } = vi.hoisted(() => ({
  searchMock: vi.fn(),
}));

vi.mock('@opensearch-project/opensearch', () => {
  class Client {
    search = searchMock;
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

function setOpenSearchEndpoint(value: string | undefined): void {
  const envStore = getEnvStore();

  if (value === undefined) {
    delete envStore.OPENSEARCH_ENDPOINT;
    return;
  }

  envStore.OPENSEARCH_ENDPOINT = value;
}

async function importModule() {
  return import('../../../../src/lib/schema/opensearch/query.js');
}

describe('opensearch query module', () => {
  beforeEach(() => {
    vi.resetModules();
    searchMock.mockReset();
    setOpenSearchEndpoint('https://test-collection.us-east-1.aoss.amazonaws.com');
    searchMock.mockResolvedValue({
      body: {
        hits: {
          hits: [],
        },
      },
    });
  });

  it('constructs multi_match query with required boosts', async () => {
    const mod = await importModule();
    await mod.searchSchemaNodes('schema-1', 'postal code');

    const call = searchMock.mock.calls[0]?.[0] as {
      body: {
        query: {
          bool: {
            must: Array<{
              multi_match: {
                fields: string[];
              };
            }>;
          };
        };
      };
    };

    expect(call.body.query.bool.must[0]?.multi_match.fields).toEqual([
      'fieldName^3',
      'path^2',
      'embeddingText^1',
    ]);
  });

  it('applies schemaId term filter', async () => {
    const mod = await importModule();
    await mod.searchSchemaNodes('schema-123', 'postal code');

    const call = searchMock.mock.calls[0]?.[0] as {
      body: {
        query: {
          bool: {
            filter: Array<{ term?: { schemaId?: string } }>;
          };
        };
      };
    };

    expect(call.body.query.bool.filter[0]?.term?.schemaId).toBe('schema-123');
  });

  it('applies type filter when provided', async () => {
    const mod = await importModule();
    await mod.searchSchemaNodes('schema-1', 'amount', { type: ['number'] });

    const call = searchMock.mock.calls[0]?.[0] as {
      body: {
        query: {
          bool: {
            filter: Array<{ terms?: { type?: string[] } }>;
          };
        };
      };
    };

    expect(call.body.query.bool.filter.some((entry) => entry.terms?.type?.[0] === 'number')).toBe(true);
  });

  it('applies isArray filter when provided', async () => {
    const mod = await importModule();
    await mod.searchSchemaNodes('schema-1', 'line items', { isArray: true });

    const call = searchMock.mock.calls[0]?.[0] as {
      body: {
        query: {
          bool: {
            filter: Array<{ term?: { isArray?: boolean } }>;
          };
        };
      };
    };

    expect(call.body.query.bool.filter.some((entry) => entry.term?.isArray === true)).toBe(true);
  });

  it('applies depth filter when provided', async () => {
    const mod = await importModule();
    await mod.searchSchemaNodes('schema-1', 'address', { depth: 3 });

    const call = searchMock.mock.calls[0]?.[0] as {
      body: {
        query: {
          bool: {
            filter: Array<{ term?: { depth?: number } }>;
          };
        };
      };
    };

    expect(call.body.query.bool.filter.some((entry) => entry.term?.depth === 3)).toBe(true);
  });

  it('respects limit parameter with default and max cap', async () => {
    const mod = await importModule();

    await mod.searchSchemaNodes('schema-1', 'postal code');
    await mod.searchSchemaNodes('schema-1', 'postal code', undefined, 10);
    await mod.searchSchemaNodes('schema-1', 'postal code', undefined, 500);

    const first = searchMock.mock.calls[0]?.[0] as { size: number };
    const second = searchMock.mock.calls[1]?.[0] as { size: number };
    const third = searchMock.mock.calls[2]?.[0] as { size: number };

    expect(first.size).toBe(20);
    expect(second.size).toBe(10);
    expect(third.size).toBe(100);
  });
});
