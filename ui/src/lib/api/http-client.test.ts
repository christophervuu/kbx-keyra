import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpClientError, httpRequest } from './http-client';

import { toAppError } from '@/lib/state/app-error';

type EnvelopeSuccess<T> = { success: true; data: T };
type EnvelopeError = { success: false; error?: { code?: string; message?: string } };

function jsonResponse(body: EnvelopeSuccess<unknown> | EnvelopeError, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
}

function textResponse(body: string, init?: ResponseInit): Response {
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

  it.each([429, 502, 503, 504])(
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

  it('500 response is retryable but does not retry', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ success: false, error: { code: 'SERVER_ERROR', message: 'boom' } }, { status: 500 }),
      );

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      httpRequest({
        baseUrl: 'http://localhost:3001/api',
        path: '/projects',
        method: 'GET',
      }),
    ).rejects.toMatchObject<HttpClientError>({
      statusCode: 500,
      retryable: true,
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

  it('network failure on GET retries then throws retryable error', async () => {
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
    expect(fetchMock).toHaveBeenCalledTimes(3);
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

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
          { success: false, error: { code: 'RATE_LIMITED', message: 'Busy' } },
          { status: 429 },
        ),
        expected: { code: 'RATE_LIMITED', statusCode: 429, retryable: true },
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
      vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ nope: true }), { status: 200 })),
    );
    const malformedError = await httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/projects/p-1',
      method: 'GET',
    }).catch((err: unknown) => err);

    expect(toAppError(malformedError)).toMatchObject({ code: 'MALFORMED_RESPONSE', retryable: false });
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
        jsonResponse({ success: false, error: { code: 'RATE_LIMIT', message: 'wait' } }, { status: 429 }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const requestPromise = httpRequest({
      baseUrl: 'http://localhost:3001/api',
      path: '/projects',
      method: 'GET',
    });

    const errorPromise = requestPromise.catch((err: unknown) => err as HttpClientError);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1042);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const error = await errorPromise;
    expect(error).toMatchObject<HttpClientError>({
      statusCode: 429,
      retryable: true,
    });

    expect(randomSpy).toHaveBeenCalledTimes(2);
  });
});
