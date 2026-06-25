import { normalizeAIError } from '../../lib/ai/error-normalization.js';
import { ERROR_CODES, type ErrorCode } from '../shared/index.js';

export interface SerializableErrorDetails {
  readonly name?: string;
  readonly message: string;
  readonly stack?: string;
  readonly code?: string;
  readonly statusCode?: number;
  readonly retryable?: boolean;
  readonly appErrorCode?: string;
  readonly appErrorStatusCode?: number;
  readonly appErrorRetryable?: boolean;
}

export function serializeUnknownError(error: unknown): SerializableErrorDetails {
  if (error instanceof Error) {
    const withMeta = error as Error & {
      code?: unknown;
      statusCode?: unknown;
      retryable?: unknown;
      appError?: {
        code?: unknown;
        statusCode?: unknown;
        retryable?: unknown;
      };
    };

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: typeof withMeta.code === 'string' ? withMeta.code : undefined,
      statusCode: typeof withMeta.statusCode === 'number' ? withMeta.statusCode : undefined,
      retryable: typeof withMeta.retryable === 'boolean' ? withMeta.retryable : undefined,
      appErrorCode: typeof withMeta.appError?.code === 'string' ? withMeta.appError.code : undefined,
      appErrorStatusCode:
        typeof withMeta.appError?.statusCode === 'number' ? withMeta.appError.statusCode : undefined,
      appErrorRetryable:
        typeof withMeta.appError?.retryable === 'boolean' ? withMeta.appError.retryable : undefined,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return {
    message: 'Unknown non-Error throwable',
  };
}

export function logAiHandlerError(prefix: string, requestId: string, error: unknown): void {
  console.error(`${prefix} unexpected handler error`, {
    requestId,
    error: serializeUnknownError(error),
  });
}

export interface KnownAiFailure {
  readonly code: ErrorCode;
  readonly message: string;
  readonly statusCode: number;
  readonly retryable: boolean;
}

function isKnownErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.values(ERROR_CODES).includes(value as ErrorCode);
}

function mapThrownAiEnvelope(error: {
  code?: unknown;
  message?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
  };
}): KnownAiFailure | null {
  if (typeof error.error?.code === 'string' && typeof error.error?.message === 'string') {
    const normalized = normalizeAIError({
      code: error.error.code,
      message: error.error.message,
    });

    if (isKnownErrorCode(normalized.code)) {
      return {
        code: normalized.code,
        message: normalized.message,
        statusCode: normalized.statusCode,
        retryable: normalized.retryable,
      };
    }
  }

  if (typeof error.code === 'string' && typeof error.message === 'string') {
    const normalized = normalizeAIError({
      code: error.code,
      message: error.message,
    });

    if (isKnownErrorCode(normalized.code)) {
      return {
        code: normalized.code,
        message: normalized.message,
        statusCode: normalized.statusCode,
        retryable: normalized.retryable,
      };
    }
  }

  return null;
}

export function mapKnownAiFailure(error: unknown): KnownAiFailure | null {
  if (error instanceof Error && error.message.startsWith('Missing required environment variable:')) {
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: error.message,
      statusCode: 500,
      retryable: false,
    };
  }

  if (error instanceof Error && error.message.startsWith('Missing required configuration:')) {
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: error.message,
      statusCode: 500,
      retryable: false,
    };
  }

  if (!error || typeof error !== 'object') {
    return null;
  }

  const withAppError = error as {
    code?: unknown;
    message?: unknown;
    error?: {
      code?: unknown;
      message?: unknown;
    };
    appError?: {
      code?: unknown;
      message?: unknown;
      statusCode?: unknown;
      retryable?: unknown;
    };
  };

  if (
    isKnownErrorCode(withAppError.appError?.code)
    && typeof withAppError.appError?.message === 'string'
    && typeof withAppError.appError?.statusCode === 'number'
    && typeof withAppError.appError?.retryable === 'boolean'
  ) {
    return {
      code: withAppError.appError.code,
      message: withAppError.appError.message,
      statusCode: withAppError.appError.statusCode,
      retryable: withAppError.appError.retryable,
    };
  }

  const thrownAiEnvelope = mapThrownAiEnvelope(withAppError);
  if (thrownAiEnvelope) {
    return thrownAiEnvelope;
  }

  if (withAppError.code === 'CONFIG_ERROR' && typeof withAppError.message === 'string') {
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: withAppError.message,
      statusCode: 500,
      retryable: false,
    };
  }

  if (withAppError.error?.code === 'CONFIG_ERROR' && typeof withAppError.error?.message === 'string') {
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: withAppError.error.message,
      statusCode: 500,
      retryable: false,
    };
  }

  return null;
}
