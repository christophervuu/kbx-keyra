import { ERROR_CODES, type ErrorCode } from '../shared/index.js';

export type CdmFailureClass =
  | 'rate-limited'
  | 'unauthorized-forbidden'
  | 'not-found-path-mismatch'
  | 'timeout-transient';

interface GitHubReadRetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterMs: number;
}

export interface CdmReadFailure {
  readonly code: ErrorCode;
  readonly message: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly failureClass: CdmFailureClass;
  readonly retryAfterSeconds?: number;
  readonly retryCount: number;
}

interface ExecuteGitHubReadInput {
  readonly url: string;
  readonly init: RequestInit;
  readonly operation: 'browse' | 'link' | 'sync';
  readonly repo: string;
  readonly sourcePath: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly fetchImpl?: typeof fetch;
}

export interface ExecuteGitHubReadResult {
  readonly response: Response;
  readonly retryCount: number;
}

class CdmGitHubReadError extends Error {
  readonly failure: CdmReadFailure;

  constructor(failure: CdmReadFailure) {
    super(failure.message);
    this.name = 'CdmGitHubReadError';
    this.failure = failure;
  }
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

function parseEnvNumber(key: string): number | null {
  const raw = getEnvValue(key)?.trim();
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

function resolveRetryPolicy(): GitHubReadRetryPolicy {
  return {
    maxAttempts: parseEnvNumber('CDM_GITHUB_READ_MAX_ATTEMPTS') ?? 3,
    baseDelayMs: parseEnvNumber('CDM_GITHUB_READ_BASE_DELAY_MS') ?? 250,
    maxDelayMs: parseEnvNumber('CDM_GITHUB_READ_MAX_DELAY_MS') ?? 2_500,
    jitterMs: parseEnvNumber('CDM_GITHUB_READ_JITTER_MS') ?? 250,
  };
}

const RETRY_POLICY = resolveRetryPolicy();

type TerminalOutcome = 'success' | 'failed' | 'pass-through';

function logAttempt(input: ExecuteGitHubReadInput, payload: {
  readonly attempt: number;
  readonly retryCount: number;
  readonly statusCode?: number;
  readonly failureClass?: CdmFailureClass;
  readonly retryAfterSeconds?: number;
  readonly decision: 'retry' | 'fail' | 'success' | 'pass-through';
  readonly reason: 'http-status' | 'transport-error' | 'ok';
}): void {
  const event = {
    event: 'cdm-github-read-attempt',
    operation: input.operation,
    repo: input.repo,
    path: input.sourcePath,
    requestId: input.requestId,
    correlationId: input.correlationId,
    maxAttempts: RETRY_POLICY.maxAttempts,
    ...payload,
  };

  if (payload.decision === 'retry' || payload.decision === 'fail') {
    console.warn('[cdm-github-read] attempt', event);
    return;
  }

  console.info('[cdm-github-read] attempt', event);
}

function logTerminal(input: ExecuteGitHubReadInput, payload: {
  readonly outcome: TerminalOutcome;
  readonly retryCount: number;
  readonly statusCode?: number;
  readonly failureClass?: CdmFailureClass;
  readonly retryAfterSeconds?: number;
}): void {
  const event = {
    event: 'cdm-github-read-terminal',
    operation: input.operation,
    repo: input.repo,
    path: input.sourcePath,
    requestId: input.requestId,
    correlationId: input.correlationId,
    ...payload,
  };

  if (payload.outcome === 'failed') {
    console.error('[cdm-github-read] terminal', event);
    return;
  }

  console.info('[cdm-github-read] terminal', event);
}

function isRateLimited(response: Response): boolean {
  if (response.status === 429) {
    return true;
  }

  return response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
}

function parseRetryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers.get('retry-after')?.trim();
  if (!raw) {
    return undefined;
  }

  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.floor(asSeconds);
  }

  const timestamp = Date.parse(raw);
  if (!Number.isNaN(timestamp)) {
    const deltaMs = timestamp - Date.now();
    if (deltaMs <= 0) {
      return 0;
    }

    return Math.ceil(deltaMs / 1000);
  }

  return undefined;
}

function classifyResponseFailure(response: Response, retryCount: number): CdmReadFailure | null {
  if (isRateLimited(response)) {
    const retryAfterSeconds = parseRetryAfterSeconds(response);
    return {
      code: ERROR_CODES.CDM_RATE_LIMITED,
      message: 'GitHub rate limit reached. Please retry shortly.',
      statusCode: 503,
      retryable: true,
      failureClass: 'rate-limited',
      ...(typeof retryAfterSeconds === 'number' ? { retryAfterSeconds } : {}),
      retryCount,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      code: ERROR_CODES.CDM_UNAUTHORIZED_FORBIDDEN,
      message: 'GitHub access is unauthorized or forbidden for the requested CDM resource.',
      statusCode: 403,
      retryable: false,
      failureClass: 'unauthorized-forbidden',
      retryCount,
    };
  }

  if (response.status === 404) {
    return {
      code: ERROR_CODES.CDM_NOT_FOUND_PATH_MISMATCH,
      message: 'CDM source path was not found. Verify repository path and branch.',
      statusCode: 404,
      retryable: false,
      failureClass: 'not-found-path-mismatch',
      retryCount,
    };
  }

  if (response.status >= 500) {
    return {
      code: ERROR_CODES.CDM_TIMEOUT_TRANSIENT,
      message: 'GitHub service is temporarily unavailable. Please retry shortly.',
      statusCode: 503,
      retryable: true,
      failureClass: 'timeout-transient',
      retryCount,
    };
  }

  return null;
}

function classifyTransportFailure(retryCount: number): CdmReadFailure {
  return {
    code: ERROR_CODES.CDM_TIMEOUT_TRANSIENT,
    message: 'Unable to reach GitHub right now. Please retry shortly.',
    statusCode: 503,
    retryable: true,
    failureClass: 'timeout-transient',
    retryCount,
  };
}

function toRetryDelayMs(attempt: number, retryAfterSeconds?: number): number {
  const exponentialDelay = Math.min(RETRY_POLICY.maxDelayMs, RETRY_POLICY.baseDelayMs * (2 ** Math.max(0, attempt - 1)));
  const jitterOffset = Math.floor(Math.random() * RETRY_POLICY.jitterMs);
  const planned = Math.min(RETRY_POLICY.maxDelayMs, exponentialDelay + jitterOffset);

  if (typeof retryAfterSeconds === 'number') {
    return Math.min(RETRY_POLICY.maxDelayMs, Math.max(planned, retryAfterSeconds * 1000));
  }

  return planned;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

export function isCdmGitHubReadError(error: unknown): error is CdmGitHubReadError {
  return error instanceof CdmGitHubReadError;
}

export async function executeGitHubReadWithRetry(input: ExecuteGitHubReadInput): Promise<ExecuteGitHubReadResult> {
  const runner = input.fetchImpl ?? fetch;
  let lastFailure: CdmReadFailure | null = null;

  for (let attempt = 1; attempt <= RETRY_POLICY.maxAttempts; attempt += 1) {
    const retryCount = attempt - 1;
    try {
      const response = await runner(input.url, input.init);
      if (response.ok) {
        logAttempt(input, {
          attempt,
          retryCount,
          statusCode: response.status,
          decision: 'success',
          reason: 'ok',
        });
        logTerminal(input, {
          outcome: 'success',
          retryCount,
          statusCode: response.status,
        });

        return {
          response,
          retryCount,
        };
      }

      const failure = classifyResponseFailure(response, retryCount);
      if (!failure) {
        logAttempt(input, {
          attempt,
          retryCount,
          statusCode: response.status,
          decision: 'pass-through',
          reason: 'http-status',
        });
        logTerminal(input, {
          outcome: 'pass-through',
          retryCount,
          statusCode: response.status,
        });

        return {
          response,
          retryCount,
        };
      }

      lastFailure = failure;
      const decision: 'retry' | 'fail' = !failure.retryable || attempt >= RETRY_POLICY.maxAttempts ? 'fail' : 'retry';
      logAttempt(input, {
        attempt,
        retryCount,
        statusCode: response.status,
        failureClass: failure.failureClass,
        ...(typeof failure.retryAfterSeconds === 'number' ? { retryAfterSeconds: failure.retryAfterSeconds } : {}),
        decision,
        reason: 'http-status',
      });

      if (!failure.retryable || attempt >= RETRY_POLICY.maxAttempts) {
        logTerminal(input, {
          outcome: 'failed',
          retryCount,
          statusCode: response.status,
          failureClass: failure.failureClass,
          ...(typeof failure.retryAfterSeconds === 'number' ? { retryAfterSeconds: failure.retryAfterSeconds } : {}),
        });
        throw new CdmGitHubReadError(failure);
      }

      await sleep(toRetryDelayMs(attempt, failure.retryAfterSeconds));
    } catch (error) {
      if (isCdmGitHubReadError(error)) {
        throw error;
      }

      const failure = classifyTransportFailure(retryCount);
      lastFailure = failure;
      const decision: 'retry' | 'fail' = attempt >= RETRY_POLICY.maxAttempts ? 'fail' : 'retry';
      logAttempt(input, {
        attempt,
        retryCount,
        failureClass: failure.failureClass,
        decision,
        reason: 'transport-error',
      });

      if (attempt >= RETRY_POLICY.maxAttempts) {
        logTerminal(input, {
          outcome: 'failed',
          retryCount,
          failureClass: failure.failureClass,
        });
        throw new CdmGitHubReadError(failure);
      }

      await sleep(toRetryDelayMs(attempt));
    }
  }

  throw new CdmGitHubReadError(
    lastFailure ?? {
      code: ERROR_CODES.CDM_TIMEOUT_TRANSIENT,
      message: `CDM ${input.operation} failed for ${input.sourcePath}.`,
      statusCode: 503,
      retryable: true,
      failureClass: 'timeout-transient',
      retryCount: RETRY_POLICY.maxAttempts - 1,
    },
  );
}

export function toCdmFailureResponse(error: CdmGitHubReadError): {
  readonly code: ErrorCode;
  readonly message: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly details: { readonly failureClass: CdmFailureClass; readonly retryCount: number; readonly retryAfterSeconds?: number };
  readonly headers?: Record<string, string>;
} {
  const details = {
    failureClass: error.failure.failureClass,
    retryCount: error.failure.retryCount,
    ...(typeof error.failure.retryAfterSeconds === 'number'
      ? { retryAfterSeconds: error.failure.retryAfterSeconds }
      : {}),
  };

  if (error.failure.failureClass === 'rate-limited' && typeof error.failure.retryAfterSeconds === 'number') {
    return {
      code: error.failure.code,
      message: error.failure.message,
      statusCode: error.failure.statusCode,
      retryable: error.failure.retryable,
      details,
      headers: {
        'retry-after': String(error.failure.retryAfterSeconds),
      },
    };
  }

  return {
    code: error.failure.code,
    message: error.failure.message,
    statusCode: error.failure.statusCode,
    retryable: error.failure.retryable,
    details,
  };
}
