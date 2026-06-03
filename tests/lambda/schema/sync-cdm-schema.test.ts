import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  getItem: vi.fn(),
  updateItem: vi.fn(),
  putObject: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  validationError: vi.fn(),
  serviceUnavailable: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
  },
}));

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/sync-cdm-schema.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('sync-cdm-schema handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.GITHUB_API_BASE = 'https://api.github.com';
    env.GITHUB_TOKEN = 'ghp_test_token';
    env.CDM_REPO_OWNER = 'KBXT';
    env.CDM_REPO_NAME = 'KBX-Canonicals';
    env.CDM_REPO_BRANCH = 'main';
    env.CDM_ROOT_PATH = 'JSONSchemas/CommonDataModels';
    env.SCHEMAS_TABLE = 'Schemas';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('schema-1');
    sharedMocks.getItem.mockReset().mockResolvedValue({
      schemaId: 'schema-1',
      format: 'json-schema',
      origin: 'cdm',
      syncStatus: 'synced',
      source: {
        type: 'github',
        repo: 'KBXT/KBX-Canonicals',
        branch: 'main',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        commitSha: 'sha-old',
      },
      updatedAt: '2026-06-03T00:00:00.000Z',
    });
    sharedMocks.updateItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.jsonResponse
      .mockReset()
      .mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse
      .mockReset()
      .mockImplementation((code, message, statusCode, retryable, requestId) => ({
        statusCode,
        body: JSON.stringify({ error: { code, message, statusCode, retryable, requestId } }),
      }));

    sharedMocks.validationError
      .mockReset()
      .mockReturnValue({
        code: 'VALIDATION_ERROR',
        message: 'Validation failure',
        statusCode: 400,
        retryable: false,
        requestId: 'req-validation',
      });
    sharedMocks.serviceUnavailable
      .mockReset()
      .mockReturnValue({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service unavailable',
        statusCode: 503,
        retryable: true,
        requestId: 'req-unavailable',
      });
    sharedMocks.internalError
      .mockReset()
      .mockReturnValue({
        code: 'INTERNAL_ERROR',
        message: 'Internal failure',
        statusCode: 500,
        retryable: true,
        requestId: 'req-internal',
      });

    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('re-sync updates content and commit SHA when upstream changed (AE-03)', async () => {
    const content = JSON.stringify({ type: 'object', properties: { id: { type: 'string' } } });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-new',
        content: Buffer.from(content, 'utf8').toString('base64'),
        encoding: 'base64',
      }),
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(200);
    expect(sharedMocks.putObject).toHaveBeenCalledTimes(1);
    expect(sharedMocks.updateItem).toHaveBeenCalledTimes(1);

    const updateCall = sharedMocks.updateItem.mock.calls[0]?.[0] as { ExpressionAttributeValues?: Record<string, unknown> };
    expect(updateCall.ExpressionAttributeValues?.[':syncStatus']).toBe('synced');
    expect(updateCall.ExpressionAttributeValues?.[':commitSha']).toBe('sha-new');
  });

  it('re-sync keeps commit SHA unchanged when upstream unchanged (AE-04)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-old',
      }),
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(200);
    expect(sharedMocks.putObject).not.toHaveBeenCalled();
    expect(sharedMocks.updateItem).toHaveBeenCalledTimes(1);

    const updateCall = sharedMocks.updateItem.mock.calls[0]?.[0] as { ExpressionAttributeValues?: Record<string, unknown> };
    expect(updateCall.ExpressionAttributeValues?.[':syncStatus']).toBe('synced');
    expect(updateCall.ExpressionAttributeValues?.[':commitSha']).toBeUndefined();
  });

  it('status-refresh sets update-available without mutating content or commit (AE-05)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-new',
      }),
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'GET' } as never);

    expect(result.statusCode).toBe(200);
    expect(sharedMocks.putObject).not.toHaveBeenCalled();
    expect(sharedMocks.updateItem).toHaveBeenCalledTimes(1);

    const updateCall = sharedMocks.updateItem.mock.calls[0]?.[0] as {
      UpdateExpression?: string;
      ExpressionAttributeValues?: Record<string, unknown>;
    };
    expect(updateCall.UpdateExpression).toContain('#syncStatus');
    expect(updateCall.ExpressionAttributeValues?.[':syncStatus']).toBe('update-available');
    expect(updateCall.UpdateExpression).not.toContain('#commitSha');
  });

  it('sync read failures return actionable service unavailable and persist sync-failed (AE-06)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: {
        get: vi.fn().mockImplementation((name: string) => (name.toLowerCase() === 'x-ratelimit-remaining' ? '0' : null)),
      },
      json: vi.fn().mockResolvedValue({ message: 'API rate limit exceeded' }),
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(503);
    expect(sharedMocks.updateItem).toHaveBeenCalledTimes(1);
    const updateCall = sharedMocks.updateItem.mock.calls[0]?.[0] as { ExpressionAttributeValues?: Record<string, unknown> };
    expect(updateCall.ExpressionAttributeValues?.[':syncStatus']).toBe('sync-failed');
    expect(sharedMocks.serviceUnavailable).toHaveBeenCalledWith('GitHub rate limit reached. Please retry shortly.');
    const parsed = JSON.parse(result.body) as { error: { message: string; code: string } };
    expect(parsed.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(parsed.error.message).toBe('Service unavailable');
  });

  it('rejects malformed CDM source metadata without mutation', async () => {
    sharedMocks.getItem.mockResolvedValue({
      schemaId: 'schema-1',
      format: 'json-schema',
      origin: 'cdm',
      syncStatus: 'synced',
      source: { type: 'upload' },
      updatedAt: '2026-06-03T00:00:00.000Z',
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sharedMocks.putObject).not.toHaveBeenCalled();
    expect(sharedMocks.updateItem).not.toHaveBeenCalled();
  });

  it('uses read-only GitHub API calls only (AE-09)', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue({
          name: 'Encounter.json',
          path: 'JSONSchemas/CommonDataModels/Encounter.json',
          type: 'file',
          sha: 'sha-new',
          download_url: 'https://raw.githubusercontent.com/KBXT/KBX-Canonicals/main/JSONSchemas/CommonDataModels/Encounter.json',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('{"type":"object"}'),
      });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(200);
    for (const call of fetchMock.mock.calls) {
      const url = call[0] as string;
      const method = (call[1] as { method?: string } | undefined)?.method;
      expect(method).toBe('GET');
      expect(url).not.toContain('/git/refs');
      expect(url).not.toContain('/git/trees');
      expect(url).not.toContain('message=');
    }
  });

  it('status-refresh read failures also persist sync-failed and return actionable service unavailable', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: {
        get: vi.fn().mockImplementation((name: string) => (name.toLowerCase() === 'x-ratelimit-remaining' ? '0' : null)),
      },
      json: vi.fn().mockResolvedValue({ message: 'API rate limit exceeded' }),
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'GET' } as never);

    expect(result.statusCode).toBe(503);
    expect(sharedMocks.updateItem).toHaveBeenCalledTimes(1);
    const updateCall = sharedMocks.updateItem.mock.calls[0]?.[0] as { ExpressionAttributeValues?: Record<string, unknown> };
    expect(updateCall.ExpressionAttributeValues?.[':syncStatus']).toBe('sync-failed');
    expect(sharedMocks.serviceUnavailable).toHaveBeenCalledWith('GitHub rate limit reached. Please retry shortly.');
    const parsed = JSON.parse(result.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(parsed.error.message).toBe('Service unavailable');
  });
});
