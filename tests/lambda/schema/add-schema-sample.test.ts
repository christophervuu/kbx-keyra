import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  getItem: vi.fn(),
  query: vi.fn(),
  putObject: vi.fn(),
  updateItem: vi.fn(),
  getObject: vi.fn(),
  deleteItem: vi.fn(),
  putItem: vi.fn(),
  validationError: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/add-schema-sample.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('add-schema-sample handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.SCHEMAS_TABLE = 'Schemas';
    env.SCHEMA_NODES_TABLE = 'SchemaNodes';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('schema-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({
      sampleName: 'Customer sample',
      sampleContent: {
        invoiceId: 'INV-1',
        amount: 12,
      },
      applySuggestedUpdates: false,
    });
    sharedMocks.getItem.mockReset().mockResolvedValue({
      schemaId: 'schema-1',
      format: 'json-schema',
      dataFormat: 'json',
      status: 'ready',
      samplePayloadCount: 1,
      samplePayloads: [
        {
          sampleId: 's0',
          schemaId: 'schema-1',
          name: 'Initial upload',
          dataFormat: 'json',
          contentRef: 'schemas/schema-1/samples/s0/payload.json',
          usedForInference: true,
          source: 'initial_upload',
          createdAt: '2026-06-08T00:00:00.000Z',
        },
      ],
    });
    sharedMocks.query.mockReset().mockResolvedValue([
      {
        schemaId: 'schema-1',
        path: 'invoiceId',
        fieldName: 'invoiceId',
        type: 'string',
        depth: 1,
        isArray: false,
        isRequired: false,
        childCount: 0,
      },
    ]);
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.updateItem.mockReset().mockResolvedValue({
      schemaId: 'schema-1',
      status: 'ready',
    });
    sharedMocks.getObject.mockReset().mockResolvedValue(JSON.stringify({
      type: 'object',
      properties: {
        invoiceId: { type: 'string' },
      },
    }));
    sharedMocks.deleteItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.putItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.validationError.mockReset().mockImplementation((message: string) => ({
      code: 'VALIDATION_ERROR',
      message,
      statusCode: 400,
      retryable: false,
    }));
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({
      statusCode,
      body: JSON.stringify({ error: { code, message, statusCode, retryable } }),
    }));
    sharedMocks.internalError.mockReset().mockReturnValue({
      code: 'INTERNAL_ERROR',
      message: 'err',
      statusCode: 500,
      retryable: true,
    });
  });

  it('returns 400 when sample payload format mismatches schema data format', async () => {
    sharedMocks.parseBody.mockReturnValueOnce({
      sampleContent: '<root><id>1</id></root>',
      applySuggestedUpdates: false,
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } } as never);

    expect(result.statusCode).toBe(400);
    expect(sharedMocks.putObject).not.toHaveBeenCalled();
    expect(sharedMocks.updateItem).not.toHaveBeenCalled();
  });

  it('save-sample-only persists sample and leaves schema content unchanged', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } } as never);

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as {
      schemaUpdated: boolean;
      mode: string;
      diff: { additions: string[]; typeConflicts: unknown[]; requiredOptionalEvidence: unknown[] };
    };

    expect(parsed.schemaUpdated).toBe(false);
    expect(parsed.mode).toBe('save_only');
    expect(parsed.diff.additions).toContain('amount');
    expect(Array.isArray(parsed.diff.typeConflicts)).toBe(true);
    expect(Array.isArray(parsed.diff.requiredOptionalEvidence)).toBe(true);

    expect(sharedMocks.putObject).toHaveBeenCalledTimes(1);
    expect(sharedMocks.getObject).not.toHaveBeenCalled();
    expect(sharedMocks.deleteItem).not.toHaveBeenCalled();
    expect(sharedMocks.putItem).not.toHaveBeenCalled();
  });

  it('apply-all mutates schema only after explicit confirmation flag', async () => {
    sharedMocks.parseBody.mockReturnValueOnce({
      sampleContent: {
        invoiceId: 'INV-1',
        amount: 12,
      },
      applySuggestedUpdates: true,
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'schema-1' } } as never);

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { schemaUpdated: boolean; mode: string };
    expect(parsed.schemaUpdated).toBe(true);
    expect(parsed.mode).toBe('apply_all');

    expect(sharedMocks.getObject).toHaveBeenCalledTimes(1);
    expect(sharedMocks.putObject).toHaveBeenCalledTimes(2);
    expect(sharedMocks.deleteItem).toHaveBeenCalledTimes(1);
    expect(sharedMocks.putItem).toHaveBeenCalled();

    const updateCall = sharedMocks.updateItem.mock.calls[0]?.[0] as { ExpressionAttributeValues?: Record<string, unknown> };
    expect(updateCall.ExpressionAttributeValues?.[':status']).toBe('needs_review');
  });
});
