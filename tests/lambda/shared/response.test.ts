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

  it('errorResponse returns standardized error envelope (AE-05)', () => {
    const response = errorResponse('RESOURCE_NOT_FOUND', "Project with id 'missing' not found", 404, false);
    const parsed = JSON.parse(response.body) as {
      error: { code: string; message: string; statusCode: number; retryable: boolean };
    };

    expect(parsed.error).toEqual({
      code: 'RESOURCE_NOT_FOUND',
      message: "Project with id 'missing' not found",
      statusCode: 404,
      retryable: false,
    });
  });
});
