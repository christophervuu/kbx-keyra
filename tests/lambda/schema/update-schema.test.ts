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
    parsePathParam: vi.fn(),
    parseBody: vi.fn(),
    getItem: vi.fn(),
    putObject: vi.fn(),
    updateItem: vi.fn(),
    jsonResponse: vi.fn(),
    errorResponse: vi.fn(),
    notFound: vi.fn(),
    internalError: vi.fn(),
    ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
    DynamoServiceError,
    S3ServiceError,
  };
});

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/update-schema.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('update-schema handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.SCHEMAS_TABLE = 'Schemas';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('schema-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({
      name: 'Updated Name',
      description: 'Updated Description',
      content: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string' },
        },
      },
      fieldCount: 1,
    });
    sharedMocks.getItem.mockReset().mockResolvedValue({
      schemaId: 'schema-1',
      name: 'Original Name',
      format: 'json-schema',
      fieldCount: 2,
      origin: 'local',
      status: 'ready',
      description: 'Original Description',
      inferred: false,
      reviewState: 'not_required',
      syncStatus: 'synced',
      source: { type: 'upload' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.updateItem.mockReset().mockResolvedValue({
      schemaId: 'schema-1',
      name: 'Updated Name',
      format: 'json-schema',
      fieldCount: 1,
      origin: 'uploaded',
      status: 'ready',
      description: 'Updated Description',
      inferred: false,
      reviewState: 'not_required',
      sourceKind: 'json_schema',
      dataFormat: 'json',
      syncStatus: 'sync-failed',
      source: { type: 'upload' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable, requestId) => ({
      statusCode,
      body: JSON.stringify({ error: { code, message, statusCode, retryable, requestId } }),
    }));
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Schema with id 'schema-1' not found", statusCode: 404, retryable: false, requestId: 'req-missing' });
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true, requestId: 'req-internal' });
  });

  it('updates metadata and content and returns normalized schema metadata', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } } as never);

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { name: string; syncStatus: string; sourceKind: string; dataFormat: string };
    expect(parsed.name).toBe('Updated Name');
    expect(parsed.syncStatus).toBe('sync-failed');
    expect(parsed.sourceKind).toBe('json_schema');
    expect(parsed.dataFormat).toBe('json');

    expect(sharedMocks.putObject).toHaveBeenCalledTimes(1);
    const putObjectCall = sharedMocks.putObject.mock.calls[0]?.[0] as { Key: string; ContentType: string };
    expect(putObjectCall.Key).toBe('schemas/schema-1/content.json');
    expect(putObjectCall.ContentType).toBe('application/json');
  });

  it('content-only update does not send undefined values in Dynamo expression attributes', async () => {
    sharedMocks.parseBody.mockReturnValueOnce({
      content: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string' },
        },
      },
      fieldCount: 1,
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } } as never);

    expect(result.statusCode).toBe(200);

    const updateCall = sharedMocks.updateItem.mock.calls[0]?.[0] as {
      UpdateExpression: string;
      ExpressionAttributeValues: Record<string, unknown>;
    };

    expect(updateCall.UpdateExpression).toContain('REMOVE #reviewedAt, #reviewedBy, #disambiguator');
    expect(updateCall.ExpressionAttributeValues).not.toHaveProperty(':reviewedAt');
    expect(updateCall.ExpressionAttributeValues).not.toHaveProperty(':reviewedBy');
    expect(updateCall.ExpressionAttributeValues).not.toHaveProperty(':disambiguator');
  });

  it('returns 404 when schema does not exist', async () => {
    sharedMocks.getItem.mockResolvedValueOnce(null);

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'missing' } } as never);

    expect(result.statusCode).toBe(404);
  });

  it('returns 400 on invalid fieldCount', async () => {
    sharedMocks.parseBody.mockReturnValueOnce({ fieldCount: -1 });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } } as never);

    expect(result.statusCode).toBe(400);
  });

  it('maps downstream service failures to structured error response', async () => {
    sharedMocks.putObject.mockRejectedValueOnce(
      new sharedMocks.S3ServiceError('S3 transient failure during putObject', {
        code: 'SERVICE_UNAVAILABLE',
        message: 'S3 transient failure during putObject',
        statusCode: 503,
        retryable: true,
        requestId: 'req-s3',
      }),
    );

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } } as never);

    expect(result.statusCode).toBe(503);
    expect(sharedMocks.errorResponse).toHaveBeenCalledWith(
      'SERVICE_UNAVAILABLE',
      'S3 transient failure during putObject',
      503,
      true,
      'req-s3',
    );
  });
});
