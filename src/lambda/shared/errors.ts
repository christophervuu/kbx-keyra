export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  INVALID_MODEL_OUTPUT: 'INVALID_MODEL_OUTPUT',
  CONTENT_UNAVAILABLE: 'CONTENT_UNAVAILABLE',
  CONFLICT: 'CONFLICT',
  DEPLOY_BLOCKED_CDM_SCHEMA_STATE: 'DEPLOY_BLOCKED_CDM_SCHEMA_STATE',
  SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
  REVISION_NOT_DEPLOYABLE_TO_ENV: 'REVISION_NOT_DEPLOYABLE_TO_ENV',
  PROMOTION_REQUIRES_VERSION: 'PROMOTION_REQUIRES_VERSION',
  SNAPSHOT_INTEGRITY_ERROR: 'SNAPSHOT_INTEGRITY_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface AppErrorDetails {
  readonly code: ErrorCode;
  readonly message: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly requestId: string;
}

export interface AppErrorResponse {
  readonly error: AppErrorDetails;
}

function resolveRequestId(requestId?: string): string {
  if (typeof requestId === 'string' && requestId.trim() !== '') {
    return requestId;
  }

  return globalThis.crypto.randomUUID();
}

export function notFound(resource: string, id: string, requestId?: string): AppErrorDetails {
  return {
    code: ERROR_CODES.RESOURCE_NOT_FOUND,
    message: `${resource} with id '${id}' not found`,
    statusCode: 404,
    retryable: false,
    requestId: resolveRequestId(requestId),
  };
}

export function conflict(message: string, requestId?: string): AppErrorDetails {
  return {
    code: ERROR_CODES.CONFLICT,
    message,
    statusCode: 409,
    retryable: false,
    requestId: resolveRequestId(requestId),
  };
}

export function contentUnavailable(message: string, requestId?: string): AppErrorDetails {
  return {
    code: ERROR_CODES.CONTENT_UNAVAILABLE,
    message,
    statusCode: 500,
    retryable: false,
    requestId: resolveRequestId(requestId),
  };
}

export function validationError(message: string, requestId?: string): AppErrorDetails {
  return {
    code: ERROR_CODES.VALIDATION_ERROR,
    message,
    statusCode: 400,
    retryable: false,
    requestId: resolveRequestId(requestId),
  };
}

export function internalError(message = 'An unexpected error occurred', requestId?: string): AppErrorDetails {
  return {
    code: ERROR_CODES.INTERNAL_ERROR,
    message,
    statusCode: 500,
    retryable: true,
    requestId: resolveRequestId(requestId),
  };
}

export function serviceUnavailable(message = 'Service temporarily unavailable', requestId?: string): AppErrorDetails {
  return {
    code: ERROR_CODES.SERVICE_UNAVAILABLE,
    message,
    statusCode: 503,
    retryable: true,
    requestId: resolveRequestId(requestId),
  };
}

export function timeout(requestId?: string, message = 'Request timed out'): AppErrorDetails {
  return {
    code: ERROR_CODES.TIMEOUT,
    message,
    statusCode: 504,
    retryable: true,
    requestId: resolveRequestId(requestId),
  };
}
