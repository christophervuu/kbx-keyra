export interface AppError {
  message: string;
  code?: string;
  statusCode?: number;
  requestId?: string;
  retryable: boolean;
  cause?: unknown;
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    const errorWithExtras = error as Error & {
      code?: string;
      statusCode?: number;
      requestId?: string;
      retryable?: boolean;
    };

    return {
      message: error.message,
      code: errorWithExtras.code,
      statusCode: errorWithExtras.statusCode,
      requestId: errorWithExtras.requestId,
      retryable: errorWithExtras.retryable ?? true,
      cause: error,
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      retryable: true,
      cause: error,
    };
  }

  return {
    message: 'An unknown error occurred',
    retryable: true,
    cause: error,
  };
}

function isAppError(value: unknown): value is AppError {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AppError>;
  return typeof candidate.message === 'string' && typeof candidate.retryable === 'boolean';
}
