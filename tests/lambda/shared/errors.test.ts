import { describe, expect, it } from 'vitest';

import {
  ERROR_CODES,
  conflict,
  internalError,
  notFound,
  serviceUnavailable,
  timeout,
  validationError,
} from '../../../src/lambda/shared/errors.js';

describe('lambda shared errors', () => {
  it('notFound includes requestId', () => {
    const error = notFound('Project', 'p-1', 'req-1');

    expect(error).toEqual({
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      message: "Project with id 'p-1' not found",
      statusCode: 404,
      retryable: false,
      requestId: 'req-1',
    });
  });

  it('conflict includes requestId', () => {
    const error = conflict('Version mismatch', 'req-2');

    expect(error).toEqual({
      code: ERROR_CODES.CONFLICT,
      message: 'Version mismatch',
      statusCode: 409,
      retryable: false,
      requestId: 'req-2',
    });
  });

  it('validationError includes requestId', () => {
    const error = validationError('Invalid input', 'req-3');

    expect(error).toEqual({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Invalid input',
      statusCode: 400,
      retryable: false,
      requestId: 'req-3',
    });
  });

  it('internalError includes requestId', () => {
    const error = internalError('Something bad happened', 'req-4');

    expect(error).toEqual({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Something bad happened',
      statusCode: 500,
      retryable: true,
      requestId: 'req-4',
    });
  });

  it('serviceUnavailable includes requestId', () => {
    const error = serviceUnavailable('Dynamo unavailable', 'req-5');

    expect(error).toEqual({
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message: 'Dynamo unavailable',
      statusCode: 503,
      retryable: true,
      requestId: 'req-5',
    });
  });

  it('timeout returns 504 and retryable true', () => {
    const error = timeout('req-6');

    expect(error).toEqual({
      code: ERROR_CODES.TIMEOUT,
      message: 'Request timed out',
      statusCode: 504,
      retryable: true,
      requestId: 'req-6',
    });
  });

  it('constructors auto-generate requestId when missing', () => {
    const error = internalError();

    expect(typeof error.requestId).toBe('string');
    expect(error.requestId).not.toBe('');
  });
});
