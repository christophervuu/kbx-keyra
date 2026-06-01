import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => {
  class DynamoServiceError extends Error {
    constructor(message: string, public readonly appError: { code: string; message: string; statusCode: number; retryable: boolean; requestId: string }) {
      super(message);
      this.name = 'DynamoServiceError';
    }
  }

  class S3ServiceError extends Error {
    constructor(message: string, public readonly appError: { code: string; message: string; statusCode: number; retryable: boolean; requestId: string }) {
      super(message);
      this.name = 'S3ServiceError';
    }
  }

  return {
    parseBody: vi.fn(),
    requireFields: vi.fn(),
    putItem: vi.fn(),
    putObject: vi.fn(),
    jsonResponse: vi.fn(),
    errorResponse: vi.fn(),
    internalError: vi.fn(),
    ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
    DynamoServiceError,
    S3ServiceError,
  };
});

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/create-schema.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('create-schema handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.SCHEMAS_TABLE = 'Schemas';
    env.SCHEMA_NODES_TABLE = 'SchemaNodes';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parseBody.mockReset().mockReturnValue({
      name: 'Small Schema',
      format: 'json-schema',
      origin: 'local',
      content: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string' },
          amount: { type: 'number' },
        },
      },
    });
    sharedMocks.requireFields.mockReset().mockReturnValue({ ok: true });
    sharedMocks.putItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse
      .mockReset()
      .mockImplementation((code, message, statusCode, retryable, requestId) => ({
        statusCode,
        body: JSON.stringify({ error: { code, message, statusCode, retryable, requestId } }),
      }));
    sharedMocks.internalError
      .mockReset()
      .mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true, requestId: 'req-internal' });
  });

  it('small schema returns 201 with ready status and computed fieldCount', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(201);
    const parsed = JSON.parse(result.body) as { status: string; fieldCount: number };
    expect(parsed.status).toBe('ready');
    expect(parsed.fieldCount).toBe(2);
    expect(sharedMocks.putItem).toHaveBeenCalledTimes(3); // metadata + 2 nodes

    const firstNodePut = sharedMocks.putItem.mock.calls[1]?.[0] as { Item?: Record<string, unknown> } | undefined;
    expect(firstNodePut?.Item).toBeDefined();
    expect(firstNodePut?.Item).not.toHaveProperty('parentPath');
  });

  it('large schema returns 201 with ingesting status', async () => {
    const bigXsd = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">${'<xs:element name="f" type="xs:string"/>'.repeat(501)}</xs:schema>`;
    sharedMocks.parseBody.mockReturnValue({
      name: 'Large Schema',
      format: 'xsd',
      origin: 'local',
      content: bigXsd,
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(201);
    const parsed = JSON.parse(result.body) as { status: string; fieldCount: number };
    expect(parsed.status).toBe('ingesting');
    expect(parsed.fieldCount).toBe(0);
  });

  it('missing required fields returns 400 validation error', async () => {
    sharedMocks.requireFields.mockReturnValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Missing required field: name', statusCode: 400, retryable: false },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(400);
  });

  it('maps S3 service errors to error response envelope', async () => {
    sharedMocks.putObject.mockRejectedValue(
      new sharedMocks.S3ServiceError('S3 transient failure during putObject', {
        code: 'SERVICE_UNAVAILABLE',
        message: 'S3 transient failure during putObject',
        statusCode: 503,
        retryable: true,
        requestId: 'req-s3',
      }),
    );

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(503);
    expect(sharedMocks.errorResponse).toHaveBeenCalledWith(
      'SERVICE_UNAVAILABLE',
      'S3 transient failure during putObject',
      503,
      true,
      'req-s3',
    );
  });

  it('maps Dynamo service errors to error response envelope', async () => {
    sharedMocks.putItem.mockRejectedValue(
      new sharedMocks.DynamoServiceError('DynamoDB throttled during putItem', {
        code: 'SERVICE_UNAVAILABLE',
        message: 'DynamoDB throttled during putItem',
        statusCode: 503,
        retryable: true,
        requestId: 'req-dynamo',
      }),
    );

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(503);
    expect(sharedMocks.errorResponse).toHaveBeenCalledWith(
      'SERVICE_UNAVAILABLE',
      'DynamoDB throttled during putItem',
      503,
      true,
      'req-dynamo',
    );
  });
});
