export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  jitter: true,
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const merged = mergeConfig(config);
  const shouldRetry = merged.shouldRetry ?? defaultShouldRetry;

  assertNotAborted(merged.signal);

  let attempt = 1;
  let lastError: unknown;

  while (attempt <= merged.maxAttempts) {
    assertNotAborted(merged.signal);

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= merged.maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      const delayMs = getDelayMs({
        attempt,
        baseDelayMs: merged.baseDelayMs,
        maxDelayMs: merged.maxDelayMs,
        jitter: merged.jitter,
      });
      await wait(delayMs, merged.signal);
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Retry attempts exhausted');
}

interface DelayInput {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

function getDelayMs(input: DelayInput): number {
  const exponential = input.baseDelayMs * 2 ** input.attempt;
  const jitter = input.jitter ? Math.random() * input.baseDelayMs * 0.5 : 0;
  return Math.min(exponential + jitter, input.maxDelayMs);
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  assertNotAborted(signal);

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      cleanup();
      reject(createAbortError());
    };

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function defaultShouldRetry(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const withRetryable = error as { retryable?: unknown; statusCode?: unknown };

    if (typeof withRetryable.retryable === 'boolean') {
      return withRetryable.retryable;
    }

    if (typeof withRetryable.statusCode === 'number') {
      return withRetryable.statusCode >= 500 && withRetryable.statusCode <= 599;
    }
  }

  return error instanceof TypeError;
}

function mergeConfig(config: Partial<RetryConfig>): RetryConfig {
  return {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function createAbortError(): Error {
  try {
    return new DOMException('The operation was aborted.', 'AbortError');
  } catch {
    const error = new Error('The operation was aborted.');
    Object.defineProperty(error, 'name', { value: 'AbortError' });
    return error;
  }
}
