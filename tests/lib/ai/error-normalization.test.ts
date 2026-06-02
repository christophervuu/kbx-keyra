import { describe, expect, it } from 'vitest';

import { normalizeAIError, type AIError } from '../../../src/lib/ai/index.js';

function createAIError(code: AIError['error']['code'], message = 'test error', details?: unknown): AIError['error'] {
  return {
    code,
    message,
    details,
  };
}

describe('normalizeAIError', () => {
  it('maps VALIDATION_ERROR to canonical backend validation envelope metadata', () => {
    const normalized = normalizeAIError(createAIError('VALIDATION_ERROR', 'bad input'));
    expect(normalized).toEqual({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      retryable: false,
      message: 'bad input',
    });
  });

  it('maps LIMIT_EXCEEDED to VALIDATION_ERROR semantics (400, non-retryable)', () => {
    const normalized = normalizeAIError(createAIError('LIMIT_EXCEEDED', 'too many tokens'));
    expect(normalized).toEqual({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      retryable: false,
      message: 'too many tokens',
    });
  });

  it('maps PROMPT_NOT_FOUND to RESOURCE_NOT_FOUND (404)', () => {
    const normalized = normalizeAIError(createAIError('PROMPT_NOT_FOUND', 'missing prompt'));
    expect(normalized).toEqual({
      code: 'RESOURCE_NOT_FOUND',
      statusCode: 404,
      retryable: false,
      message: 'missing prompt',
    });
  });

  it('maps TIMEOUT to TIMEOUT (504, retryable)', () => {
    const normalized = normalizeAIError(createAIError('TIMEOUT', 'timed out'));
    expect(normalized).toEqual({
      code: 'TIMEOUT',
      statusCode: 504,
      retryable: true,
      message: 'timed out',
    });
  });

  it('maps MODEL_RATE_LIMITED to SERVICE_UNAVAILABLE (503, retryable)', () => {
    const normalized = normalizeAIError(createAIError('MODEL_RATE_LIMITED', 'rate limited'));
    expect(normalized).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      retryable: true,
      message: 'rate limited',
    });
  });

  it('maps MODEL_ERROR with provider 413 to VALIDATION_ERROR (400)', () => {
    const normalized = normalizeAIError(createAIError('MODEL_ERROR', 'payload too large', { status: 413 }));
    expect(normalized).toEqual({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      retryable: false,
      message: 'payload too large',
    });
  });

  it('maps MODEL_ERROR with provider 5xx to SERVICE_UNAVAILABLE (503)', () => {
    const normalized = normalizeAIError(createAIError('MODEL_ERROR', 'provider unavailable', { status: 502 }));
    expect(normalized).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      retryable: true,
      message: 'provider unavailable',
    });
  });

  it('maps MODEL_ERROR with provider 4xx (non-413/429) to INTERNAL_ERROR (500)', () => {
    const normalized = normalizeAIError(createAIError('MODEL_ERROR', 'bad provider request', { status: 400 }));
    expect(normalized).toEqual({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      retryable: false,
      message: 'bad provider request',
    });
  });

  it('maps REGISTRY_ERROR and ASSET_ERROR to SERVICE_UNAVAILABLE', () => {
    expect(normalizeAIError(createAIError('REGISTRY_ERROR', 'registry down'))).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      retryable: true,
      message: 'registry down',
    });

    expect(normalizeAIError(createAIError('ASSET_ERROR', 'asset retrieval failed'))).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      retryable: true,
      message: 'asset retrieval failed',
    });
  });

  it('maps INVALID_MODEL_OUTPUT to INVALID_MODEL_OUTPUT (500, non-retryable)', () => {
    const normalized = normalizeAIError(
      createAIError('INVALID_MODEL_OUTPUT', 'model response violated output contract'),
    );

    expect(normalized).toEqual({
      code: 'INVALID_MODEL_OUTPUT',
      statusCode: 500,
      retryable: false,
      message: 'model response violated output contract',
    });
  });

  it('maps PARSE_ERROR/CONFIG_ERROR/ASSET_NOT_FOUND to INTERNAL_ERROR', () => {
    expect(normalizeAIError(createAIError('PARSE_ERROR', 'invalid model json'))).toEqual({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      retryable: false,
      message: 'invalid model json',
    });

    expect(normalizeAIError(createAIError('CONFIG_ERROR', 'missing token'))).toEqual({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      retryable: false,
      message: 'missing token',
    });

    expect(normalizeAIError(createAIError('ASSET_NOT_FOUND', 'dsl missing'))).toEqual({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      retryable: false,
      message: 'dsl missing',
    });
  });
});
