export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface HttpRequestConfig {
  baseUrl: string;
  path: string;
  method: HttpMethod;
  body?: unknown;
  timeout?: number;
  retry?: boolean;
}

interface ErrorDetails {
  code?: unknown;
  message?: unknown;
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

interface ErrorEnvelope {
  success: false;
  error?: ErrorDetails;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

export class HttpClientError extends Error {
  readonly statusCode?: number;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: string;
      retryable: boolean;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'HttpClientError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.retryable = options.retryable;

    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export async function httpRequest<T>(config: HttpRequestConfig): Promise<T> {
  const retryEnabled = config.retry ?? true;
  let attempt = 1;

  while (attempt <= MAX_ATTEMPTS) {
    try {
      return await sendRequest<T>(config);
    } catch (error) {
      const normalizedError = normalizeHttpError(error);

      if (!shouldRetry(normalizedError, config.method, retryEnabled, attempt)) {
        throw normalizedError;
      }

      await wait(getRetryDelayMs(attempt));
      attempt += 1;
    }
  }

  throw new HttpClientError('Request failed after all retry attempts.', {
    retryable: true,
    code: 'RETRY_EXHAUSTED',
  });
}

async function sendRequest<T>(config: HttpRequestConfig): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const url = buildUrl(config.baseUrl, config.path);
  const requestInit: RequestInit = {
    method: config.method,
    headers: {
      'Content-Type': 'application/json',
    },
    signal: controller.signal,
  };

  if (config.method !== 'GET' && config.body !== undefined) {
    requestInit.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(url, requestInit);

    if (response.ok) {
      return await parseSuccessResponse<T>(response);
    }

    throw await parseErrorResponse(response);
  } catch (error) {
    if (error instanceof HttpClientError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new HttpClientError('Request timed out before the server responded.', {
        code: 'REQUEST_TIMEOUT',
        retryable: true,
        cause: error,
      });
    }

    if (error instanceof TypeError) {
      throw new HttpClientError('Network request failed.', {
        code: 'NETWORK_ERROR',
        retryable: true,
        cause: error,
      });
    }

    if (error instanceof Error) {
      throw new HttpClientError(error.message, {
        code: 'HTTP_CLIENT_ERROR',
        retryable: true,
        cause: error,
      });
    }

    throw new HttpClientError('Unexpected HTTP client failure.', {
      code: 'HTTP_CLIENT_ERROR',
      retryable: true,
      cause: error,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseSuccessResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  let parsed: unknown;

  try {
    parsed = await response.json();
  } catch {
    throw malformedResponseError();
  }

  if (isErrorEnvelope(parsed)) {
    throw new HttpClientError(getErrorMessage(parsed.error, 'Request failed.'), {
      statusCode: response.status,
      code: getErrorCode(parsed.error),
      retryable: false,
    });
  }

  if (!isSuccessEnvelope<T>(parsed)) {
    throw malformedResponseError();
  }

  return parsed.data;
}

async function parseErrorResponse(response: Response): Promise<HttpClientError> {
  const parsed = await tryParseJson(response);

  if (isErrorEnvelope(parsed)) {
    return new HttpClientError(getErrorMessage(parsed.error, mapStatusToMessage(response.status)), {
      statusCode: response.status,
      code: getErrorCode(parsed.error),
      retryable: isRetryableStatus(response.status),
    });
  }

  return new HttpClientError(mapStatusToMessage(response.status), {
    statusCode: response.status,
    retryable: isRetryableStatus(response.status),
  });
}

function buildUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimTrailingSlash(baseUrl)}${normalizedPath}`;
}

async function tryParseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isSuccessEnvelope<T>(value: unknown): value is SuccessEnvelope<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { success?: unknown }).success === true &&
    'data' in value
  );
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { success?: unknown }).success === false
  );
}

function getErrorCode(error: ErrorDetails | undefined): string | undefined {
  return typeof error?.code === 'string' ? error.code : undefined;
}

function getErrorMessage(error: ErrorDetails | undefined, fallback: string): string {
  return typeof error?.message === 'string' ? error.message : fallback;
}

function malformedResponseError(): HttpClientError {
  return new HttpClientError('Received malformed response envelope from server.', {
    code: 'MALFORMED_RESPONSE',
    retryable: false,
  });
}

function shouldRetry(
  error: HttpClientError,
  method: HttpMethod,
  retryEnabled: boolean,
  attempt: number,
): boolean {
  if (!retryEnabled || attempt >= MAX_ATTEMPTS) {
    return false;
  }

  if (error.statusCode !== undefined) {
    return RETRYABLE_STATUS_CODES.has(error.statusCode);
  }

  if (method !== 'GET') {
    return false;
  }

  return error.code === 'NETWORK_ERROR' || error.code === 'REQUEST_TIMEOUT';
}

function isRetryableStatus(status: number): boolean {
  if (status === 429) {
    return true;
  }

  return status >= 500;
}

function mapStatusToMessage(status: number): string {
  if (status === 400) {
    return 'Bad request.';
  }

  if (status === 401) {
    return 'Unauthorized request.';
  }

  if (status === 403) {
    return 'Forbidden request.';
  }

  if (status === 404) {
    return 'Requested resource was not found.';
  }

  if (status === 409) {
    return 'Request could not be completed due to a conflict.';
  }

  if (status === 429) {
    return 'Too many requests. Please retry shortly.';
  }

  if (status === 502 || status === 503 || status === 504) {
    return 'Server is temporarily unavailable. Please retry shortly.';
  }

  if (status >= 500) {
    return 'Server encountered an error.';
  }

  return `Request failed with status ${status}.`;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function normalizeHttpError(error: unknown): HttpClientError {
  if (error instanceof HttpClientError) {
    return error;
  }

  if (isAbortError(error)) {
    return new HttpClientError('Request timed out before the server responded.', {
      code: 'REQUEST_TIMEOUT',
      retryable: true,
      cause: error,
    });
  }

  if (error instanceof TypeError) {
    return new HttpClientError('Network request failed.', {
      code: 'NETWORK_ERROR',
      retryable: true,
      cause: error,
    });
  }

  if (error instanceof Error) {
    return new HttpClientError(error.message, {
      code: 'HTTP_CLIENT_ERROR',
      retryable: true,
      cause: error,
    });
  }

  return new HttpClientError('Unexpected HTTP client failure.', {
    code: 'HTTP_CLIENT_ERROR',
    retryable: true,
    cause: error,
  });
}

function getRetryDelayMs(attempt: number): number {
  const jitterMs = Math.floor(Math.random() * 101);
  return 500 * attempt + jitterMs;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
