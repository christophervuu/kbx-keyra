import { retryWithBackoff, type RetryConfig } from './retry';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface HttpRequestConfig {
  baseUrl: string;
  path: string;
  method: HttpMethod;
  body?: unknown;
  timeout?: number;
  retry?: boolean;
  retryConfig?: Partial<RetryConfig>;
  signal?: AbortSignal;
}

type RequestInitLike = globalThis.RequestInit;

interface ErrorDetails {
  code?: unknown;
  message?: unknown;
  statusCode?: unknown;
  retryable?: unknown;
  requestId?: unknown;
  details?: unknown;
}

interface BackendErrorEnvelope {
  error: ErrorDetails;
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
const RETRYABLE_STATUS_CODES = new Set([500, 503, 504]);

export class HttpClientError extends Error {
  readonly statusCode?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: string;
      requestId?: string;
      retryable: boolean;
      details?: unknown;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'HttpClientError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.requestId = options.requestId;
    this.retryable = options.retryable;
    this.details = options.details;

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
  const requestMethod = config.method;

  if (!retryEnabled) {
    return sendRequest<T>(config);
  }

  return retryWithBackoff(
    async () => sendRequest<T>(config),
    {
      maxAttempts: MAX_ATTEMPTS,
      signal: config.signal,
      ...config.retryConfig,
      shouldRetry: (error: unknown) => {
        const normalized = normalizeHttpError(error);
        return shouldRetry(normalized, requestMethod);
      },
    },
  );
}

async function sendRequest<T>(config: HttpRequestConfig): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const cleanupExternalAbort = wireAbortSignals(config.signal, controller);

  const url = buildUrl(config.baseUrl, config.path);
  const requestInit: RequestInitLike = {
    method: config.method,
    signal: controller.signal,
  };

  if (config.method !== 'GET' && config.body !== undefined) {
    requestInit.headers = {
      'Content-Type': 'application/json',
    };
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
      throw new HttpClientError(
        'Network request failed. This may be a CORS or API authorization/config issue (for example: missing Access-Control-Allow-Origin on 4xx/5xx responses).',
        {
          code: 'NETWORK_ERROR',
          retryable: true,
          cause: error,
        },
      );
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
    cleanupExternalAbort();
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

  if (isSuccessEnvelope<T>(parsed)) {
    return parsed.data;
  }

  // Phase 1 backend returns plain JSON success payloads (not wrapped in { success, data }).
  // Accept plain object/array/null responses for compatibility while preserving explicit
  // handling of success/error envelopes above.
  if (isPlainJsonSuccessPayload(parsed)) {
    return parsed as T;
  }

  throw malformedResponseError();
}

async function parseErrorResponse(response: Response): Promise<HttpClientError> {
  const parsed = await tryParseJson(response);

  const backendEnvelope = toBackendErrorEnvelope(parsed);
  if (backendEnvelope) {
    const envelopeStatusCode =
      typeof backendEnvelope.error.statusCode === 'number' ? backendEnvelope.error.statusCode : response.status;
    const envelopeRetryable =
      typeof backendEnvelope.error.retryable === 'boolean'
        ? backendEnvelope.error.retryable
        : isRetryableStatus(envelopeStatusCode);

    return new HttpClientError(getErrorMessage(backendEnvelope.error, mapStatusToMessage(envelopeStatusCode)), {
      statusCode: envelopeStatusCode,
      code: getErrorCode(backendEnvelope.error),
      requestId: getRequestId(backendEnvelope.error),
      retryable: envelopeRetryable,
      details: backendEnvelope.error.details,
    });
  }

  if (isErrorEnvelope(parsed)) {
    const statusCode = response.status;
    const retryable = isRetryableStatus(statusCode);
    return new HttpClientError(getErrorMessage(parsed.error, mapStatusToMessage(response.status)), {
      statusCode,
      code: getErrorCode(parsed.error),
      retryable,
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

function isPlainJsonSuccessPayload(value: unknown): boolean {
  if (value === null) {
    return true;
  }

  if (Array.isArray(value)) {
    return true;
  }

  if (typeof value === 'object') {
    // If a payload advertises an envelope marker, require envelope validation instead.
    if ('success' in (value as Record<string, unknown>)) {
      return false;
    }

    return true;
  }

  return false;
}

function getErrorCode(error: ErrorDetails | undefined): string | undefined {
  return typeof error?.code === 'string' ? error.code : undefined;
}

function getErrorMessage(error: ErrorDetails | undefined, fallback: string): string {
  return typeof error?.message === 'string' ? error.message : fallback;
}

function getRequestId(error: ErrorDetails | undefined): string | undefined {
  return typeof error?.requestId === 'string' ? error.requestId : undefined;
}

function toBackendErrorEnvelope(value: unknown): BackendErrorEnvelope | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { error?: unknown };
  if (!candidate.error || typeof candidate.error !== 'object') {
    return null;
  }

  return {
    error: candidate.error as ErrorDetails,
  };
}

function malformedResponseError(): HttpClientError {
  return new HttpClientError('Received malformed response envelope from server.', {
    code: 'MALFORMED_RESPONSE',
    retryable: false,
  });
}

function shouldRetry(error: HttpClientError, method: HttpMethod): boolean {
  if (typeof error.statusCode === 'number') {
    return RETRYABLE_STATUS_CODES.has(error.statusCode);
  }

  if (method !== 'GET') {
    return false;
  }

  if (typeof error.retryable === 'boolean') {
    return error.retryable;
  }

  return error.code === 'NETWORK_ERROR' || error.code === 'REQUEST_TIMEOUT';
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
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
    return new HttpClientError(
      'Network request failed. This may be a CORS or API authorization/config issue (for example: missing Access-Control-Allow-Origin on 4xx/5xx responses).',
      {
        code: 'NETWORK_ERROR',
        retryable: true,
        cause: error,
      },
    );
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

function wireAbortSignals(signal: AbortSignal | undefined, controller: AbortController): () => void {
  if (!signal) {
    return () => undefined;
  }

  if (signal.aborted) {
    controller.abort();
    return () => undefined;
  }

  const onAbort = () => {
    controller.abort();
  };
  signal.addEventListener('abort', onAbort, { once: true });

  return () => {
    signal.removeEventListener('abort', onAbort);
  };
}
