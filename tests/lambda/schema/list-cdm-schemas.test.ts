import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parseQueryParam: vi.fn(),
  generateRequestId: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  validationError: vi.fn(),
  serviceUnavailable: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
    CDM_RATE_LIMITED: 'CDM_RATE_LIMITED',
    CDM_UNAUTHORIZED_FORBIDDEN: 'CDM_UNAUTHORIZED_FORBIDDEN',
    CDM_NOT_FOUND_PATH_MISMATCH: 'CDM_NOT_FOUND_PATH_MISMATCH',
    CDM_TIMEOUT_TRANSIENT: 'CDM_TIMEOUT_TRANSIENT',
  },
}));

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/list-cdm-schemas.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

function mockGitHubResponse(input: {
  ok: boolean;
  status: number;
  payload?: unknown;
  headers?: Record<string, string | null>;
}): Response {
  return {
    ok: input.ok,
    status: input.status,
    headers: {
      get: vi.fn().mockImplementation((name: string) => input.headers?.[name.toLowerCase()] ?? null),
    },
    json: vi.fn().mockResolvedValue(input.payload ?? {}),
  } as unknown as Response;
}

describe('list-cdm-schemas handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.GITHUB_API_BASE = 'https://api.github.com';
    env.GITHUB_TOKEN = 'ghp_test_token';
    env.CDM_REPO_OWNER = 'KBXT';
    env.CDM_REPO_NAME = 'KBX-Canonicals';
    env.CDM_REPO_BRANCH = 'main';
    env.CDM_ROOT_PATH = 'JSONSchemas/CommonDataModels';
    env.CDM_LIST_CACHE_TTL_MS = '60000';
    env.CDM_LIST_CACHE_STALE_GRACE_MS = '900000';
    env.CDM_GITHUB_READ_MAX_ATTEMPTS = '3';
    env.CDM_GITHUB_READ_BASE_DELAY_MS = '1';
    env.CDM_GITHUB_READ_MAX_DELAY_MS = '1';
    env.CDM_GITHUB_READ_JITTER_MS = '1';

    sharedMocks.parseQueryParam.mockReset().mockReturnValue(null);
    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-list-1');
    sharedMocks.jsonResponse
      .mockReset()
      .mockImplementation((statusCode, body, requestId, additionalHeaders) => ({
        statusCode,
        headers: {
          ...(typeof requestId === 'string' && requestId.trim() !== '' ? { 'x-request-id': requestId } : {}),
          ...((additionalHeaders as Record<string, string> | undefined) ?? {}),
        },
        body: JSON.stringify(body),
      }));
    sharedMocks.errorResponse
      .mockReset()
      .mockImplementation((code, message, statusCode, retryable, requestId, details, additionalHeaders) => ({
        statusCode,
        headers: {
          ...(typeof requestId === 'string' && requestId.trim() !== '' ? { 'x-request-id': requestId } : {}),
          ...((additionalHeaders as Record<string, string> | undefined) ?? {}),
        },
        body: JSON.stringify({ error: { code, message, statusCode, retryable, requestId, ...(details !== undefined ? { details } : {}) } }),
      }));

    sharedMocks.validationError
      .mockReset()
      .mockImplementation((message: string) => ({
        code: 'VALIDATION_ERROR',
        message,
        statusCode: 400,
        retryable: false,
        requestId: 'req-validation',
      }));
    sharedMocks.serviceUnavailable
      .mockReset()
      .mockImplementation((message: string) => ({
        code: 'SERVICE_UNAVAILABLE',
        message,
        statusCode: 503,
        retryable: true,
        requestId: 'req-unavailable',
      }));
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists one-level CDM directory entries and marks response as fresh cache source (AE-01)', async () => {
    fetchMock.mockResolvedValue(
      mockGitHubResponse({
        ok: true,
        status: 200,
        payload: [
          {
            name: 'Patient',
            path: 'JSONSchemas/CommonDataModels/Patient',
            type: 'dir',
            sha: 'sha-dir-1',
            html_url: 'https://github.com/KBXT/KBX-Canonicals/tree/main/JSONSchemas/CommonDataModels/Patient',
          },
          {
            name: 'Encounter.json',
            path: 'JSONSchemas/CommonDataModels/Encounter.json',
            type: 'file',
            sha: 'sha-file-1',
            size: 321,
            download_url:
              'https://raw.githubusercontent.com/KBXT/KBX-Canonicals/main/JSONSchemas/CommonDataModels/Encounter.json',
          },
        ],
      }),
    );

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: null } as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/repos/KBXT/KBX-Canonicals/contents/JSONSchemas/CommonDataModels?ref=main');

    expect(result.statusCode).toBe(200);
    expect(result.headers).toMatchObject({
      'x-cdm-cache-source': 'fresh',
      'x-cdm-cache-degraded': 'false',
      'x-cdm-cache-stale': 'false',
      'x-cdm-cache-age-ms': '0',
      'x-cdm-cache-ttl-ms': '60000',
      'x-cdm-cache-stale-grace-ms': '900000',
    });
    expect(JSON.parse(result.body)).toEqual([
      {
        name: 'Patient',
        path: 'JSONSchemas/CommonDataModels/Patient',
        type: 'dir',
        sha: 'sha-dir-1',
        htmlUrl: 'https://github.com/KBXT/KBX-Canonicals/tree/main/JSONSchemas/CommonDataModels/Patient',
      },
      {
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-file-1',
        size: 321,
        downloadUrl: 'https://raw.githubusercontent.com/KBXT/KBX-Canonicals/main/JSONSchemas/CommonDataModels/Encounter.json',
      },
    ]);
  });

  it('supports client-driven navigation by requested child path', async () => {
    sharedMocks.parseQueryParam.mockReturnValue('Patient');
    fetchMock.mockResolvedValue(mockGitHubResponse({ ok: true, status: 200, payload: [] }));

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: { path: 'Patient' } } as never);

    expect(result.statusCode).toBe(200);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/contents/JSONSchemas/CommonDataModels/Patient?ref=main');
  });

  it('falls back to cached listing with degraded markers on transient GitHub failure (AE-01)', async () => {
    let nowMs = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    fetchMock
      .mockResolvedValueOnce(
        mockGitHubResponse({
          ok: true,
          status: 200,
          payload: [
            {
              name: 'Patient',
              path: 'JSONSchemas/CommonDataModels/Patient',
              type: 'dir',
              sha: 'sha-dir-1',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        mockGitHubResponse({
          ok: false,
          status: 503,
          payload: { message: 'Service unavailable' },
        }),
      );

    const { handler } = await importHandler();
    const first = await handler({ queryStringParameters: null } as never);
    nowMs = 1_015_000; // fallback (15s later)
    const second = await handler({ queryStringParameters: null } as never);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.headers).toMatchObject({
      'x-cdm-cache-source': 'cache',
      'x-cdm-cache-degraded': 'true',
      'x-cdm-cache-stale': 'false',
      'x-cdm-cache-age-ms': '15000',
      'x-cdm-cache-ttl-ms': '60000',
      'x-cdm-cache-stale-grace-ms': '900000',
    });
    expect(JSON.parse(second.body)).toEqual([
      {
        name: 'Patient',
        path: 'JSONSchemas/CommonDataModels/Patient',
        type: 'dir',
        sha: 'sha-dir-1',
      },
    ]);
  });

  it('does not use fallback cache beyond stale grace window', async () => {
    let nowMs = 2_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

    fetchMock
      .mockResolvedValueOnce(
        mockGitHubResponse({
          ok: true,
          status: 200,
          payload: [
            {
              name: 'Patient',
              path: 'JSONSchemas/CommonDataModels/Patient',
              type: 'dir',
              sha: 'sha-dir-1',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        mockGitHubResponse({
          ok: false,
          status: 503,
          payload: { message: 'Service unavailable' },
        }),
      );

    const { handler } = await importHandler();
    await handler({ queryStringParameters: null } as never);
    nowMs = 2_980_001; // age = 980001 (> ttl+grace 960000)
    const result = await handler({ queryStringParameters: null } as never);

    expect(result.statusCode).toBe(503);
    expect(result.headers).not.toHaveProperty('x-cdm-cache-source');
  });

  it('returns explicit service unavailable on transient failure when cache is missing (AE-04)', async () => {
    fetchMock.mockResolvedValue(
      mockGitHubResponse({
        ok: false,
        status: 503,
        payload: { message: 'service unavailable' },
      }),
    );

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: null } as never);

    expect(result.statusCode).toBe(503);
    const parsed = JSON.parse(result.body) as {
      error: { code: string; details?: { failureClass?: string; retryCount?: number } };
    };
    expect(parsed.error.code).toBe('CDM_TIMEOUT_TRANSIENT');
    expect(parsed.error.details).toMatchObject({
      failureClass: 'timeout-transient',
      retryCount: 2,
    });
  });

  it('rejects out-of-root path traversal with deterministic validation error', async () => {
    sharedMocks.parseQueryParam.mockReturnValue('../outside');

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: { path: '../outside' } } as never);

    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sharedMocks.validationError).toHaveBeenCalledWith('Invalid path. Only JSONSchemas/CommonDataModels/* is allowed.');
  });

  it('rejects nested traversal attempts that try to escape CDM root', async () => {
    sharedMocks.parseQueryParam.mockReturnValue('Patient/../../outside');

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: { path: 'Patient/../../outside' } } as never);

    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sharedMocks.validationError).toHaveBeenCalledWith('Invalid path. Only JSONSchemas/CommonDataModels/* is allowed.');
  });

  it('returns canonical not-found-path-mismatch classification for missing CDM path', async () => {
    sharedMocks.parseQueryParam.mockReturnValue('UnknownFolder');
    fetchMock.mockResolvedValue(
      mockGitHubResponse({
        ok: false,
        status: 404,
        payload: { message: 'Not Found' },
      }),
    );

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: { path: 'UnknownFolder' } } as never);

    expect(result.statusCode).toBe(404);
    const parsed = JSON.parse(result.body) as {
      error: { code: string; details?: { failureClass?: string; retryCount?: number } };
    };
    expect(parsed.error.code).toBe('CDM_NOT_FOUND_PATH_MISMATCH');
    expect(parsed.error.details).toMatchObject({
      failureClass: 'not-found-path-mismatch',
      retryCount: 0,
    });
  });

  it('maps rate-limit responses to service unavailable when no cache fallback exists', async () => {
    fetchMock.mockResolvedValue(
      mockGitHubResponse({
        ok: false,
        status: 403,
        payload: { message: 'API rate limit exceeded' },
        headers: {
          'x-ratelimit-remaining': '0',
        },
      }),
    );

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: null } as never);

    expect(result.statusCode).toBe(503);
    expect(sharedMocks.errorResponse).toHaveBeenCalledWith(
      'CDM_RATE_LIMITED',
      'GitHub rate limit reached. Please retry shortly.',
      503,
      true,
      'req-list-1',
      {
        failureClass: 'rate-limited',
        retryCount: 2,
      },
      undefined,
    );
  });

  it('maps unauthorized GitHub responses to deterministic unauthorized-forbidden class without retry', async () => {
    fetchMock.mockResolvedValue(
      mockGitHubResponse({
        ok: false,
        status: 403,
        payload: { message: 'Forbidden' },
        headers: {
          'x-ratelimit-remaining': '10',
        },
      }),
    );

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: null } as never);

    expect(result.statusCode).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sharedMocks.errorResponse).toHaveBeenCalledWith(
      'CDM_UNAUTHORIZED_FORBIDDEN',
      'GitHub access is unauthorized or forbidden for the requested CDM resource.',
      403,
      false,
      'req-list-1',
      {
        failureClass: 'unauthorized-forbidden',
        retryCount: 0,
      },
      undefined,
    );
  });

  it('emits per-attempt and terminal telemetry with request lineage fields', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    fetchMock.mockResolvedValue(
      mockGitHubResponse({
        ok: false,
        status: 503,
        payload: { message: 'Service unavailable' },
      }),
    );

    const { handler } = await importHandler();
    await handler({ queryStringParameters: null, headers: { 'x-correlation-id': 'corr-list-1' } } as never);

    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '[cdm-github-read] terminal',
      expect.objectContaining({
        event: 'cdm-github-read-terminal',
        operation: 'browse',
        repo: 'KBXT/KBX-Canonicals',
        path: 'JSONSchemas/CommonDataModels',
        requestId: 'req-list-1',
        correlationId: 'corr-list-1',
        outcome: 'failed',
        failureClass: 'timeout-transient',
      }),
    );

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('maps not-found responses to deterministic not-found-path-mismatch class without retry', async () => {
    fetchMock.mockResolvedValue(
      mockGitHubResponse({
        ok: false,
        status: 404,
        payload: { message: 'Not Found' },
      }),
    );

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: null } as never);

    expect(result.statusCode).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sharedMocks.errorResponse).toHaveBeenCalledWith(
      'CDM_NOT_FOUND_PATH_MISMATCH',
      'CDM source path was not found. Verify repository path and branch.',
      404,
      false,
      'req-list-1',
      {
        failureClass: 'not-found-path-mismatch',
        retryCount: 0,
      },
      undefined,
    );
  });

  it('uses read-only GitHub content listing call only (no write endpoint usage)', async () => {
    fetchMock.mockResolvedValue(mockGitHubResponse({ ok: true, status: 200, payload: [] }));

    const { handler } = await importHandler();
    await handler({ queryStringParameters: null } as never);

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    const method = (fetchMock.mock.calls[0]?.[1] as { method?: string } | undefined)?.method;

    expect(method).toBe('GET');
    expect(calledUrl).toContain('/repos/KBXT/KBX-Canonicals/contents/');
    expect(calledUrl).not.toContain('/git/refs');
    expect(calledUrl).not.toContain('/git/trees');
    expect(calledUrl).not.toContain('/contents/JSONSchemas/CommonDataModels?ref=main&message=');
  });
});
