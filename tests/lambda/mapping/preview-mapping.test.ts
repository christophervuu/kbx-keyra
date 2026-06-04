import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  getItem: vi.fn(),
  getObject: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
    SNAPSHOT_INTEGRITY_ERROR: 'SNAPSHOT_INTEGRITY_ERROR',
  },
}));

const deploymentMocks = vi.hoisted(() => ({
  getCurrent: vi.fn(),
}));

const engineMocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);
vi.mock('../../../src/lib/persistence/deployments.js', () => deploymentMocks);
vi.mock('../../../src/lib/persistence/types.js', async () => {
  const actual = await vi.importActual('../../../src/lib/persistence/types.js');
  return actual;
});
vi.mock('../../../src/engine/index.js', () => engineMocks);

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

    envStore().MAPPINGS_TABLE = 'Mappings';
    envStore().STORAGE_BUCKET = 'Storage';

    sharedMocks.parsePathParam.mockReset().mockImplementation((event, name: string) => event.pathParameters?.[name] ?? null);
    sharedMocks.parseBody.mockReset().mockReturnValue({ environment: 'DEV', sourceData: { a: 'x' } });
    sharedMocks.getItem.mockReset().mockResolvedValue({ mappingId: 'map-1' });
    sharedMocks.getObject.mockReset().mockResolvedValue(
      JSON.stringify({
        config: {
          name: 'Map 1',
          version: 3,
          engineVersion: '1.0.0',
          config: {},
          rules: [
            { target: 'A', type: 'string', expression: 'source("a")' },
          ],
        },
      }),
    );
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({
      statusCode,
      body: JSON.stringify({ error: { code, message, statusCode, retryable } }),
    }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });

    deploymentMocks.getCurrent.mockReset().mockResolvedValue({
      mappingId: 'map-1',
      environment: 'DEV',
      deployedAt: '2026-06-03T00:00:00.000Z',
      sourceType: 'version',
      sourceNumber: 3,
      artifactId: 'artifact-dev-3',
      artifactHash: 'hash-dev-3',
      configS3Key: 'deployments/map-1/DEV/artifact-dev-3.json',
      configHash: 'cfg-hash-dev-3',
    });

    engineMocks.execute.mockReset().mockReturnValue({
      output: { A: 'x' },
      diagnostics: [],
    });
  });

  it('executes preview against selected runtime environment and returns provenance metadata', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'PREPROD', sourceData: { a: 'x' } });
    deploymentMocks.getCurrent.mockResolvedValueOnce({
      mappingId: 'map-1',
      environment: 'PREPROD',
      deployedAt: '2026-06-03T01:00:00.000Z',
      sourceType: 'version',
      sourceNumber: 5,
      artifactId: 'artifact-preprod-5',
      artifactHash: 'hash-preprod-5',
      configS3Key: 'deployments/map-1/PREPROD/artifact-preprod-5.json',
      configHash: 'cfg-hash-preprod-5',
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.metadata).toEqual({
      environment: 'PREPROD',
      artifactId: 'artifact-preprod-5',
      artifactHash: 'hash-preprod-5',
      deployedAt: '2026-06-03T01:00:00.000Z',
      sourceType: 'version',
      sourceNumber: 5,
      engineVersion: '1.0.0',
    });
    expect(deploymentMocks.getCurrent).toHaveBeenCalledWith('map-1', 'PREPROD');
  });

  it('returns deterministic not-deployed style error when no active deployment exists', async () => {
    deploymentMocks.getCurrent.mockResolvedValueOnce(null);
    sharedMocks.parseBody.mockReturnValue({ environment: 'PROD', sourceData: { a: 'x' } });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error.code).toBe('SOURCE_NOT_FOUND');
    expect(engineMocks.execute).not.toHaveBeenCalled();
  });

  it('rejects invalid preview request body', async () => {
    sharedMocks.parseBody.mockReturnValue({ environment: 'SANDBOX', sourceData: [] });
    const { handler } = await importHandler();

    const result = await handler({ body: '{}', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
  });
});
