import { describe, expect, it } from 'vitest';

import { errorResponse, jsonResponse } from '../../../src/lambda/shared/response.js';

describe('lambda shared response', () => {
  it('jsonResponse returns status, cors, and JSON body (AE-11)', () => {
    const response = jsonResponse(201, { ok: true });

    expect(response.statusCode).toBe(201);
    expect(response.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    expect(response.body).toBe('{"ok":true}');
  });

  it('jsonResponse adds x-request-id when provided (FS-059 AE-07)', () => {
    const response = jsonResponse(200, { ok: true }, 'req-123');

    expect(response.headers).toMatchObject({
      'x-request-id': 'req-123',
    });
  });

  it('errorResponse returns standardized error envelope (AE-05)', () => {
    const response = errorResponse('RESOURCE_NOT_FOUND', "Project with id 'missing' not found", 404, false, 'req-abc');
    const parsed = JSON.parse(response.body) as {
      error: { code: string; message: string; statusCode: number; retryable: boolean; requestId: string };
    };

    expect(parsed.error).toEqual({
      code: 'RESOURCE_NOT_FOUND',
      message: "Project with id 'missing' not found",
      statusCode: 404,
      retryable: false,
      requestId: 'req-abc',
    });
    expect(response.headers).toMatchObject({
      'x-request-id': 'req-abc',
    });
  });

  it('errorResponse auto-generates requestId when missing', () => {
    const response = errorResponse('INTERNAL_ERROR', 'oops', 500, true);
    const parsed = JSON.parse(response.body) as { error: { requestId: string } };

    expect(typeof parsed.error.requestId).toBe('string');
    expect(parsed.error.requestId).not.toBe('');
    expect(response.headers).toMatchObject({
      'x-request-id': parsed.error.requestId,
    });
  });

  it('jsonResponse includes CORS preflight headers when provided via additional headers', () => {
    const response = jsonResponse(
      200,
      { ok: true },
      'req-options-1',
      {
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
    );

    expect(response.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'x-request-id': 'req-options-1',
    });
  });
});
