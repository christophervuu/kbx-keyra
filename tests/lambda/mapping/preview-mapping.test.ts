import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  generateRequestId: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
    NOT_DEPLOYED: 'NOT_DEPLOYED',
    SNAPSHOT_INTEGRITY_ERROR: 'SNAPSHOT_INTEGRITY_ERROR',
  },
}));

const runtimeInvokeClientMocks = vi.hoisted(() => ({
  getRuntimeInvokeClient: vi.fn(),
  client: {
    preview: vi.fn(),
  },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);
vi.mock('../../../src/lambda/deployment/runtime-invoke-client.js', () => ({
  getRuntimeInvokeClient: runtimeInvokeClientMocks.getRuntimeInvokeClient,
}));
vi.mock('../../../src/lib/persistence/types.js', async () => {
  const actual = await vi.importActual('../../../src/lib/persistence/types.js');
  return actual;
});

async function importHandler() {
  return import('../../../src/lambda/mapping/preview-mapping.js');
}

type EnvStore = Record<string, string | undefined>;

function envStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env unavailable');
  }
  return processRef.env;
}

describe('preview mapping handler', () => {
  beforeEach(() => {
    vi.resetModules();

    envStore().STORAGE_BUCKET = 'Storage';

    sharedMocks.parsePathParam.mockReset().mockImplementation((event, name: string) => event.pathParameters?.[name] ?? null);
    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-preview-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({ environment: 'DEV', sourceData: { a: 'x' } });
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable, requestId, details) => ({
      statusCode,
      body: JSON.stringify({
        error: {
          code,
          message,
          statusCode,
          retryable,
          ...(requestId ? { requestId } : {}),
          ...(details !== undefined ? { details } : {}),
        },
      }),
    }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });

    runtimeInvokeClientMocks.getRuntimeInvokeClient.mockReset().mockReturnValue(runtimeInvokeClientMocks.client);
    runtimeInvokeClientMocks.client.preview.mockReset().mockResolvedValue({
      ok: true,
      requestId: 'runtime-preview-req-1',
      data: {
        environment: 'DEV',
        mappingId: 'map-1',
        artifactId: 'artifact-dev-3',
        artifactHash: 'hash-dev-3',
        sourceType: 'version',
        sourceNumber: 3,
        engineVersion: '1.2.3',
        output: { A: 'x' },
        diagnostics: [],
      },
    });
  });

  it('executes preview against selected runtime environment and returns canonical metadata', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'PREPROD', sourceData: { a: 'x' } });
    runtimeInvokeClientMocks.client.preview.mockResolvedValueOnce({
      ok: true,
      requestId: 'runtime-preview-req-preprod',
      data: {
        environment: 'PREPROD',
        mappingId: 'map-1',
        artifactId: 'artifact-preprod-5',
        artifactHash: 'hash-preprod-5',
        sourceType: 'version',
        sourceNumber: 5,
        engineVersion: '1.2.3',
        output: { A: 'x' },
        diagnostics: [],
      },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.metadata).toEqual({
      environment: 'PREPROD',
      artifactId: 'artifact-preprod-5',
      artifactHash: 'hash-preprod-5',
      deployedAt: null,
      sourceType: 'version',
      sourceNumber: 5,
      engineVersion: '1.2.3',
    });
    expect(runtimeInvokeClientMocks.client.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingId: 'map-1',
        environment: 'PREPROD',
      }),
    );
  });

  it('forwards externalSources payload to runtime preview call', async () => {
    sharedMocks.parseBody.mockReturnValue({
      environment: 'DEV',
      sourceData: { a: 'x' },
      externalSources: { customerProfile: { id: 'c-1' } },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(runtimeInvokeClientMocks.client.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingId: 'map-1',
        environment: 'DEV',
        sourceData: { a: 'x' },
        externalSources: { customerProfile: { id: 'c-1' } },
        requestId: 'req-preview-1',
      }),
    );
  });

  it('passes generated requestId to runtime invoke client', async () => {
    sharedMocks.generateRequestId.mockReturnValueOnce('req-preview-correlation');

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(runtimeInvokeClientMocks.client.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-preview-correlation',
      }),
    );
  });

  it('returns deterministic not-deployed style error when runtime preview reports no active deployment', async () => {
    runtimeInvokeClientMocks.client.preview.mockResolvedValueOnce({
      ok: false,
      requestId: 'runtime-preview-404',
      errorCode: 'SOURCE_NOT_FOUND',
      message: 'No active deployment in runtime environment',
      statusCode: 404,
      retryable: false,
    });
    sharedMocks.parseBody.mockReturnValue({ environment: 'PROD', sourceData: { a: 'x' } });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('NOT_DEPLOYED');
    expect(body.error.message).toContain('NOT_DEPLOYED');
    expect(body.error.details).toEqual({
      environment: 'PROD',
      mappingId: 'map-1',
    });
  });

  it('rejects invalid preview request body', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'SANDBOX', sourceData: [] });
    const { handler } = await importHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
  });
});
