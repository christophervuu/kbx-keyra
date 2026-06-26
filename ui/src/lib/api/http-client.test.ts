import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpClientError, httpRequest } from './http-client';

import { toAppError } from '@/lib/state/app-error';

type EnvelopeSuccess<T> = { success: true; data: T };
type EnvelopeError = { success: false; error?: { code?: string; message?: string } };
type ResponseInitLike = globalThis.ResponseInit;
type BackendErrorEnvelope = {
  error: {
    code?: string;
    message?: string;
    statusCode?: number;
    retryable?: boolean;
    requestId?: string;
  };
};

function jsonResponse(body: EnvelopeSuccess<unknown> | EnvelopeError, init?: ResponseInitLike): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
}

function backendErrorResponse(body: BackendErrorEnvelope, init?: ResponseInitLike): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 500,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
}

function textResponse(body: string, init?: ResponseInitLike): Response {
  return new Response(body, {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'text/plain', ...(init?.headers ?? {}) },
  });
}

function abortError(): Error {
  try {
    return new DOMException('Aborted', 'AbortError');
  } catch {
    const err = new Error('Aborted');
    Object.defineProperty(err, 'name', { value: 'AbortError' });
    return err;
  }
}

describe('httpRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('successful GET parses envelope and returns data', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 'p-1' } }));

    vi.stubGlobal('fetch', fetchMock);

    const result = await httpRequest<{ id: string }>({
      baseUrl: 'http://localhost:3001/api/',
      path: '/projects/p-1',
      method: 'GET',
    });

    expect(result).toEqual({ id: 'p-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/projects/p-1',
      expect.objectContaining({ method: 'GET' }),
    );

    const [, requestInit] = fetchMock.mock.calls[0];
    expect((requestInit as globalThis.RequestInit).headers).toBeUndefined();
  });

  it('successful GET parses plain object JSON response', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ projectId: 'p-plain', name: 'Plain Project' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const result = await httpRequest<{ projectId: string; name: string }>({
      baseUrl: 'http://localhost:3001/api/',
      path: '/projects/p-plain',
      method: 'GET',
    });

    expect(result).toEqual({ projectId: 'p-plain', name: 'Plain Project' });
  });

  it('successful GET parses plain array JSON response', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ projectId: 'p-1' }, { projectId: 'p-2' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const result = await httpRequest<Array<{ projectId: string }>>({
      baseUrl: 'http://localhost:3001/api/',
      path: '/projects',
      method: 'GET',
    });

    expect(result).toEqual([{ projectId: 'p-1' }, { projectId: 'p-2' }]);
  });

  it.each([
    ['POST' as const, '/projects', { name: 'New project' }],
    ['PUT' as const, '/projects/p-1', { name: 'Updated project' }],
    ['DELETE' as const, '/projects/p-1', { reason: 'cleanup' }],
  ])('successful %s with body serializes JSON', async (method, path, body) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { ok: true } }));

    vi.stubGlobal('fetch', fetchMock);

    await httpRequest<{ ok: boolean }>({
      baseUrl: 'http://localhost:3001/api',
      path,
      method,
      body,
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit).toMatchObject({
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  });

  it('DELETE without body does not send Content-Type header', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    vi.stubGlobal('fetch', fetchMock);

    await httpRequest<void>({
      baseUrl: 'http://localhost:3001/api',
      path: '/projects/p-1',
      method: 'DELETE',
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    expect((requestInit as globalThis.RequestInit).headers).toBeUndefined();
  });

  it('success envelope with success=false throws extracted code/message', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          jsonResponse(
            {
              success: false,
              error: { code: 'PROJECT_CONFLICT', message: 'Project already exists' },
            },
            { status: 200 },
          ),
        ),
    );

    await expect(
      httpRequest({
        baseUrl: 'http://localhost:3001/api',
        path: '/projects',
        method: 'POST',
        body: { name: 'duplicate' },
      }),
    ).rejects.toMatchObject<HttpClientError>({
      name: 'HttpClientError',
      code: 'PROJECT_CONFLICT',
      message: 'Project already exists',
      retryable: false,
      statusCode: 200,
    });
  });

  it.each([
    [400, false],
    [401, false],
    [403, false],
    [404, false],
    [409, false],
  ])('%i response is non-retryable with status code', async (status, retryable) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          jsonResponse(
            { success: false, error: { code: 'CLIENT_ERROR', message: `status ${status}` } },
            { status },
          ),
        ),
    );

    await expect(
      httpRequest({
        baseUrl: 'http://localhost:3001/api',
        path: '/projects/p-1',
        method: 'GET',
      }),
    ).rejects.toMatchObject<HttpClientError>({
      statusCode: status,
      retryable,
    });
  });

  it.each([500, 503, 504])(
    '%i retries to max attempts then throws retryable error',
    async (status) => {
      vi.useFakeTimers();

      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(
            {
              success: false,
              error: { code: 'TRANSIENT', message: `temporary ${status}` },
            },
            { status },
          ),
        );

      vi.stubGlobal('fetch', fetchMock);

      const requestPromise = httpRequest({
        baseUrl: 'http://localhost:3001/api',
        path: '/projects',
        method: 'GET',
      });

      const errorPromise = requestPromise.catch((err: unknown) => err as HttpClientError);

      await vi.runAllTimersAsync();

      const error = await errorPromise;
      expect(error).toMatchObject<HttpClientError>({
        statusCode: status,
        retryable: true,
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
  );

  it.each([429, 502])('%i response is non-retryable and does not retry', async (status) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ success: false, error: { code: 'SERVER_ERROR', message: 'boom' } }, { status }),
      );

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      httpRequest({
        baseUrl: 'http://localhost:3001/api',
        path: '/projects',
        method: 'GET',
      }),
    ).rejects.toMatchObject<HttpClientError>({
      statusCode: status,
      retryable: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('204 response returns undefined for void-style endpoints', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 204 })));

    await expect(
      httpRequest<void>({
        baseUrl: 'http://localhost:3001/api',
        path: '/projects/p-1',
        method: 'DELETE',
      }),
    ).resolves.toBeUndefined();
  });

  it('network failure on GET retries then throws retryable error with CORS guidance', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const requestPromise = httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/projects',
      method: 'GET',
    });

    const errorPromise = requestPromise.catch((err: unknown) => err as HttpClientError);

    await vi.runAllTimersAsync();

    const error = await errorPromise;
    expect(error).toMatchObject<HttpClientError>({
      code: 'NETWORK_ERROR',
      retryable: true,
    });
    expect(error.message).toContain('CORS');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('parses backend error envelope and preserves requestId/details for UI normalization', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: 'RESOURCE_NOT_FOUND',
              message: 'Deploy context missing',
              statusCode: 404,
              retryable: false,
              requestId: 'req-deploy-context-1',
              details: {
                route: '/mappings/map-1/deploy-context',
              },
            },
          },
          { status: 404 },
        ),
      ),
    );

    await expect(
      httpRequest({
        baseUrl: 'http://localhost:3001/api',
        path: '/mappings/map-1/deploy-context',
        method: 'GET',
      }),
    ).rejects.toMatchObject<HttpClientError>({
      code: 'RESOURCE_NOT_FOUND',
      statusCode: 404,
      retryable: false,
      requestId: 'req-deploy-context-1',
      details: {
        route: '/mappings/map-1/deploy-context',
      },
    });
  });

  it('network failure on POST throws immediately with no retry', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      httpRequest({
        baseUrl: 'http://localhost:3001/api',
        path: '/projects',
        method: 'POST',
        body: { name: 'no-retry' },
      }),
    ).rejects.toMatchObject<HttpClientError>({
      code: 'NETWORK_ERROR',
      retryable: true,
    });

    await expect(
      httpRequest({
        baseUrl: 'http://localhost:3001/api',
        path: '/projects',
        method: 'POST',
        body: { name: 'no-retry' },
      }),
    ).rejects.toThrow(/CORS/i);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('timeout on GET retries then throws retryable timeout error', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(abortError());
          });
        }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const requestPromise = httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/projects',
      method: 'GET',
      timeout: 10,
    });

    const errorPromise = requestPromise.catch((err: unknown) => err as HttpClientError);

    await vi.runAllTimersAsync();

    const error = await errorPromise;
    expect(error).toMatchObject<HttpClientError>({
      code: 'REQUEST_TIMEOUT',
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('timeout on POST throws immediately with no retry', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(abortError());
          });
        }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const requestPromise = httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/projects',
      method: 'POST',
      body: { name: 'post-timeout' },
      timeout: 10,
    });

    const errorPromise = requestPromise.catch((err: unknown) => err as HttpClientError);

    await vi.runAllTimersAsync();

    const error = await errorPromise;
    expect(error).toMatchObject<HttpClientError>({
      code: 'REQUEST_TIMEOUT',
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('malformed response (non-json) throws non-retryable error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValueOnce(textResponse('not json', { status: 200 })),
    );

    await expect(
      httpRequest({
        baseUrl: 'http://localhost:3001/api',
        path: '/projects',
        method: 'GET',
      }),
    ).rejects.toMatchObject<HttpClientError>({
      code: 'MALFORMED_RESPONSE',
      retryable: false,
    });
  });

  it('malformed response (invalid success envelope) throws non-retryable error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 })),
    );

    await expect(
      httpRequest({
        baseUrl: 'http://localhost:3001/api',
        path: '/projects',
        method: 'GET',
      }),
    ).rejects.toMatchObject<HttpClientError>({
      code: 'MALFORMED_RESPONSE',
      retryable: false,
    });
  });

  it('toAppError compatibility for representative error categories', async () => {
    const cases = [
      {
        response: jsonResponse(
          { success: false, error: { code: 'NOT_FOUND', message: 'Missing project' } },
          { status: 404 },
        ),
        expected: { code: 'NOT_FOUND', statusCode: 404, retryable: false },
      },
      {
        response: jsonResponse(
          { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Busy' } },
          { status: 503 },
        ),
        expected: { code: 'SERVICE_UNAVAILABLE', statusCode: 503, retryable: true },
      },
      {
        response: jsonResponse(
          { success: false, error: { code: 'SERVER_ERROR', message: 'Server down' } },
          { status: 500 },
        ),
        expected: { code: 'SERVER_ERROR', statusCode: 500, retryable: true },
      },
    ] as const;

    for (const testCase of cases) {
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(testCase.response));

      const error = await httpRequest({
        baseUrl: 'http://localhost:3001/api',
        path: '/projects/p-1',
        method: 'GET',
        retry: false,
      }).catch((err: unknown) => err);

      const appError = toAppError(error);
      expect(appError).toMatchObject(testCase.expected);
    }

    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('Failed to fetch')));
    const networkError = await httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/projects/p-1',
      method: 'POST',
      body: { x: 1 },
    }).catch((err: unknown) => err);

    expect(toAppError(networkError)).toMatchObject({ code: 'NETWORK_ERROR', retryable: true });

    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(
        (_input, init) =>
          new Promise((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(abortError()));
          }),
      ),
    );
    const timeoutPromise = httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/projects/p-1',
      method: 'POST',
      body: { x: 1 },
      timeout: 10,
    });
    const timeoutErrorPromise = timeoutPromise.catch((err: unknown) => err);
    await vi.runAllTimersAsync();
    const timeoutError = await timeoutErrorPromise;
    expect(toAppError(timeoutError)).toMatchObject({ code: 'REQUEST_TIMEOUT', retryable: true });

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify('unexpected'), { status: 200 })),
    );
    const malformedError = await httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/projects/p-1',
      method: 'GET',
    }).catch((err: unknown) => err);

    expect(toAppError(malformedError)).toMatchObject({ code: 'MALFORMED_RESPONSE', retryable: false });
  });

  it('parses backend error envelope with requestId', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          backendErrorResponse(
            {
              error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'DynamoDB throttled',
                statusCode: 503,
                retryable: true,
                requestId: 'req-abc123',
              },
            },
            { status: 503 },
          ),
        ),
    );

    const error = await httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/projects/p-1',
      method: 'GET',
      retry: false,
    }).catch((err: unknown) => err as HttpClientError);

    expect(error).toMatchObject<HttpClientError>({
      code: 'SERVICE_UNAVAILABLE',
      message: 'DynamoDB throttled',
      statusCode: 503,
      retryable: true,
      requestId: 'req-abc123',
    });

    expect(toAppError(error)).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      retryable: true,
      requestId: 'req-abc123',
    });
  });

  it('preserves backend correlation lineage fields from error envelope (requestId/code/status/retryable)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          backendErrorResponse(
            {
              error: {
                code: 'CONFLICT',
                message: 'Rule snapshot is stale. Re-run fix on latest rule before applying.',
                statusCode: 409,
                retryable: false,
                requestId: 'req-corr-409',
              },
            },
            { status: 409 },
          ),
        ),
    );

    const error = await httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/ai/smart-fix',
      method: 'POST',
      body: {
        mappingId: 'mapping-1',
        ruleIndex: 0,
      },
      retry: false,
    }).catch((err: unknown) => err as HttpClientError);

    expect(error).toMatchObject<HttpClientError>({
      code: 'CONFLICT',
      statusCode: 409,
      retryable: false,
      requestId: 'req-corr-409',
    });
    expect(error.message).toContain('stale');

    // AppError normalization retains request lineage fields for UI↔API correlation.
    expect(toAppError(error)).toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
      retryable: false,
      requestId: 'req-corr-409',
    });
  });

  it('preserves backend error details payload on HttpClientError and AppError', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          backendErrorResponse(
            {
              error: {
                code: 'DEPLOY_BLOCKED_CDM_SCHEMA_STATE',
                message: 'Deployment blocked: referenced CDM schema state is not deployable',
                statusCode: 409,
                retryable: false,
                details: {
                  issues: [
                    {
                      schemaId: 'schema-source',
                      referenceRole: 'source',
                      reason: 'unsynced',
                      remediationKey: 're-sync-schema',
                    },
                  ],
                },
              },
            },
            { status: 409 },
          ),
        ),
    );

    const error = await httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/mappings/map-1/deploy',
      method: 'POST',
      body: {
        environment: 'DEV',
        sourceType: 'revision',
        sourceNumber: 3,
      },
      retry: false,
    }).catch((err: unknown) => err as HttpClientError);

    expect(error).toMatchObject<HttpClientError>({
      code: 'DEPLOY_BLOCKED_CDM_SCHEMA_STATE',
      statusCode: 409,
      retryable: false,
    });
    expect(error.details).toEqual({
      issues: [
        {
          schemaId: 'schema-source',
          referenceRole: 'source',
          reason: 'unsynced',
          remediationKey: 're-sync-schema',
        },
      ],
    });

    expect(toAppError(error).details).toEqual({
      issues: [
        {
          schemaId: 'schema-source',
          referenceRole: 'source',
          reason: 'unsynced',
          remediationKey: 're-sync-schema',
        },
      ],
    });
  });

  it('parses backend error envelope when requestId is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          backendErrorResponse(
            {
              error: {
                code: 'RESOURCE_NOT_FOUND',
                message: 'Mapping not found',
                statusCode: 404,
                retryable: false,
              },
            },
            { status: 404 },
          ),
        ),
    );

    const error = await httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/mappings/missing',
      method: 'GET',
      retry: false,
    }).catch((err: unknown) => err as HttpClientError);

    expect(error).toMatchObject<HttpClientError>({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Mapping not found',
      statusCode: 404,
      retryable: false,
    });
    expect(error.requestId).toBeUndefined();
  });

  it('fallback classification still works for non-JSON error responses', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(textResponse('service unavailable', { status: 503 })));

    const error = await httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/projects',
      method: 'GET',
      retry: false,
    }).catch((err: unknown) => err as HttpClientError);

    expect(error).toMatchObject<HttpClientError>({
      statusCode: 503,
      retryable: true,
      message: 'Server is temporarily unavailable. Please retry shortly.',
    });
    expect(error.code).toBeUndefined();
    expect(error.requestId).toBeUndefined();
  });

  it('toAppError preserves requestId from enriched Error', () => {
    const error = new Error('failed') as Error & {
      code?: string;
      statusCode?: number;
      retryable?: boolean;
      requestId?: string;
    };
    error.code = 'SERVICE_UNAVAILABLE';
    error.statusCode = 503;
    error.retryable = true;
    error.requestId = 'req-inline-1';

    expect(toAppError(error)).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      retryable: true,
      requestId: 'req-inline-1',
    });
  });

  it('retry backoff uses attempt-based delay plus jitter', async () => {
    vi.useFakeTimers();

    const randomSpy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.42);

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ success: false, error: { code: 'RATE_LIMIT', message: 'wait' } }, { status: 503 }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const requestPromise = httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/projects',
      method: 'GET',
    });

    const errorPromise = requestPromise.catch((err: unknown) => err as HttpClientError);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2105);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const error = await errorPromise;
    expect(error).toMatchObject<HttpClientError>({
      statusCode: 503,
      retryable: true,
    });

    expect(randomSpy).toHaveBeenCalledTimes(2);
  });

  it('503 retries and succeeds on second attempt', async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'try again' } }, { status: 503 }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 'p-2' } }, { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    const promise = httpRequest<{ id: string }>({
      baseUrl: 'http://localhost:3001/api',
      path: '/projects/p-2',
      method: 'GET',
      retryConfig: { jitter: false },
    });

    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toEqual({ id: 'p-2' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('supports per-request retry maxAttempts override', async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ success: false, error: { code: 'SERVER_ERROR', message: 'boom' } }, { status: 500 }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const requestPromise = httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/projects',
      method: 'GET',
      retryConfig: { maxAttempts: 2, jitter: false },
    });

    const errorPromise = requestPromise.catch((err: unknown) => err as HttpClientError);
    await vi.runAllTimersAsync();
    await errorPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
