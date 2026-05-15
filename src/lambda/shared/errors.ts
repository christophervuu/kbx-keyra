export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface AppErrorDetails {
  readonly code: ErrorCode;
  readonly message: string;
  readonly statusCode: number;
  readonly retryable: boolean;
}

export interface AppErrorResponse {
  readonly error: AppErrorDetails;
}

export function notFound(resource: string, id: string): AppErrorDetails {
  return {
    code: ERROR_CODES.RESOURCE_NOT_FOUND,
    message: `${resource} with id '${id}' not found`,
    statusCode: 404,
    retryable: false,
  };
}

export function conflict(message: string): AppErrorDetails {
  return {
    code: ERROR_CODES.CONFLICT,
    message,
    statusCode: 409,
    retryable: false,
  };
}

export function validationError(message: string): AppErrorDetails {
  return {
    code: ERROR_CODES.VALIDATION_ERROR,
    message,
    statusCode: 400,
    retryable: false,
  };
}

export function internalError(message = 'An unexpected error occurred'): AppErrorDetails {
  return {
    code: ERROR_CODES.INTERNAL_ERROR,
    message,
    statusCode: 500,
    retryable: true,
  };
}

export function serviceUnavailable(message = 'Service temporarily unavailable'): AppErrorDetails {
  return {
    code: ERROR_CODES.SERVICE_UNAVAILABLE,
    message,
    statusCode: 503,
    retryable: true,
  };
}
