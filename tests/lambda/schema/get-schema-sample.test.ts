import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  getItem: vi.fn(),
  getObject: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  notFound: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
  },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/get-schema-sample.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('get-schema-sample handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.SCHEMAS_TABLE = 'Schemas';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockImplementation((event: unknown, key: string) => {
      if (key === 'id') {
        return 'schema-1';
      }

      if (key === 'sampleId') {
        return 'sample-1';
      }

      return null;
    });
    sharedMocks.getItem.mockReset().mockResolvedValue({
      schemaId: 'schema-1',
      samplePayloads: [
        {
          sampleId: 'sample-1',
          schemaId: 'schema-1',
          name: 'Sample 1',
          dataFormat: 'json',
          contentRef: 'schemas/schema-1/samples/sample-1/payload.json',
          usedForInference: false,
          source: 'added_sample',
          createdAt: '2026-06-09T00:00:00.000Z',
        },
      ],
    });
    sharedMocks.getObject.mockReset().mockResolvedValue('{"customer":{"name":"Alice"}}');
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({
      statusCode,
      body: JSON.stringify({ error: { code, message, statusCode, retryable } }),
    }));
    sharedMocks.notFound.mockReset().mockImplementation((resource: string, id: string) => ({
      code: 'RESOURCE_NOT_FOUND',
      message: `${resource} with id '${id}' not found`,
      statusCode: 404,
      retryable: false,
    }));
    sharedMocks.internalError.mockReset().mockImplementation((message = 'err') => ({
      code: 'INTERNAL_ERROR',
      message,
      statusCode: 500,
      retryable: true,
    }));
  });

  it('returns raw+parsed payload for JSON sample', async () => {
    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1', sampleId: 'sample-1' } } as never);

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { raw: string; parsed: { customer: { name: string } } };
    expect(parsed.raw).toContain('Alice');
    expect(parsed.parsed.customer.name).toBe('Alice');
  });

  it('returns 404 when sample metadata is missing', async () => {
    sharedMocks.getItem.mockResolvedValueOnce({ schemaId: 'schema-1', samplePayloads: [] });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1', sampleId: 'missing' } } as never);

    expect(result.statusCode).toBe(404);
  });
});
