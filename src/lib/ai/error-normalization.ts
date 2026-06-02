import type { AIError, AIErrorCode } from './types.js';

export type BackendErrorCode =
  | 'VALIDATION_ERROR'
  | 'RESOURCE_NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'TIMEOUT';

export interface NormalizedAIError {
  readonly code: BackendErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly message: string;
}

interface ProviderErrorLike {
  readonly status?: unknown;
}

function getProviderStatus(details: unknown): number | undefined {
  if (typeof details !== 'object' || details === null) {
    return undefined;
  }

  const status = (details as ProviderErrorLike).status;
  return typeof status === 'number' ? status : undefined;
}

function normalizeModelError(code: AIErrorCode, message: string, details: unknown): NormalizedAIError {
  const status = getProviderStatus(details);

  if (code === 'MODEL_RATE_LIMITED') {
    return {
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      retryable: true,
      message,
    };
  }

  if (status === 413) {
    return {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      retryable: false,
      message,
    };
  }

  if (status === 429) {
    return {
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      retryable: true,
      message,
    };
  }

  if (typeof status === 'number' && status >= 500) {
    return {
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      retryable: true,
      message,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    statusCode: 500,
    retryable: false,
    message,
  };
}

export function normalizeAIError(error: AIError['error'] | AIError): NormalizedAIError {
  const aiError = 'error' in error ? error.error : error;

  switch (aiError.code) {
    case 'VALIDATION_ERROR':
    case 'LIMIT_EXCEEDED':
      return {
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        retryable: false,
        message: aiError.message,
      };

    case 'PROMPT_NOT_FOUND':
      return {
        code: 'RESOURCE_NOT_FOUND',
        statusCode: 404,
        retryable: false,
        message: aiError.message,
      };

    case 'TIMEOUT':
      return {
        code: 'TIMEOUT',
        statusCode: 504,
        retryable: true,
        message: aiError.message,
      };

    case 'MODEL_RATE_LIMITED':
    case 'MODEL_ERROR':
      return normalizeModelError(aiError.code, aiError.message, aiError.details);

    case 'REGISTRY_ERROR':
    case 'ASSET_ERROR':
      return {
        code: 'SERVICE_UNAVAILABLE',
        statusCode: 503,
        retryable: true,
        message: aiError.message,
      };

    case 'ASSET_NOT_FOUND':
    case 'CONFIG_ERROR':
    case 'PARSE_ERROR':
      return {
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        retryable: false,
        message: aiError.message,
      };

    default:
      return {
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        retryable: false,
        message: aiError.message,
      };
  }
}
