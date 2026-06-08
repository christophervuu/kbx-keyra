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
    getItem: vi.fn(),
    putItem: vi.fn(),
    putObject: vi.fn(),
    updateItem: vi.fn(),
    notFound: vi.fn(),
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
    env.PROJECTS_TABLE = 'Projects';

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
    sharedMocks.getItem.mockReset().mockResolvedValue(null);
    sharedMocks.putItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.updateItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: 'missing', statusCode: 404, retryable: false, requestId: 'req-missing' });
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
    expect((parsed as { origin?: string }).origin).toBe('uploaded');
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

  it('accepts FS-076 canonical sync statuses and github repoId in source', async () => {
    sharedMocks.parseBody.mockReturnValue({
      name: 'CDM Schema',
      format: 'json-schema',
      origin: 'cdm',
      syncStatus: 'update-available',
      source: {
        type: 'github',
        repo: 'KBXT/KBX-Canonicals',
        repoId: 1052821334,
        branch: 'main',
        path: 'JSONSchemas/CommonDataModels/Patient.json',
        commitSha: 'deadbeef',
      },
      content: {
        type: 'object',
        properties: {
          patientId: { type: 'string' },
        },
      },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(201);

    const metadataPutCall = sharedMocks.putItem.mock.calls.find((call) => {
      const arg = call[0] as { Item?: Record<string, unknown> } | undefined;
      return typeof arg?.Item?.schemaId === 'string' && typeof arg?.Item?.name === 'string';
    });
    const metadataItem = metadataPutCall?.[0] as { Item: Record<string, unknown> };

    expect(metadataItem.Item.syncStatus).toBe('update-available');
    expect(metadataItem.Item.source).toEqual({
      type: 'github',
      repo: 'KBXT/KBX-Canonicals',
      repoId: 1052821334,
      branch: 'main',
      path: 'JSONSchemas/CommonDataModels/Patient.json',
      commitSha: 'deadbeef',
    });
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

  it('upload with projectId links schema to project linkage fields', async () => {
    sharedMocks.parseBody.mockReturnValue({
      name: 'Project Upload',
      format: 'json-schema',
      origin: 'local',
      projectId: 'proj-1',
      content: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    });
    sharedMocks.getItem.mockResolvedValue({
      projectId: 'proj-1',
      schemaRefs: [],
      linkedSchemaIds: [],
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(201);
    expect(sharedMocks.updateItem).toHaveBeenCalledTimes(1);
    const updateCall = sharedMocks.updateItem.mock.calls[0]?.[0] as {
      ExpressionAttributeValues?: Record<string, unknown>;
    };
    expect(Array.isArray(updateCall.ExpressionAttributeValues?.[':schemaRefs'])).toBe(true);
    expect(Array.isArray(updateCall.ExpressionAttributeValues?.[':linkedSchemaIds'])).toBe(true);

    const refs = updateCall.ExpressionAttributeValues?.[':schemaRefs'] as Array<{ type: string }>;
    expect(refs.at(-1)?.type).toBe('published');
  });
});
