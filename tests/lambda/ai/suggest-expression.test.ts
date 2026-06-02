import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent } from '../../../src/lambda/shared/index.js';

const invokeAIMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/ai/index.js', () => {
  return {
    invokeAI: invokeAIMock,
    normalizeAIError: (error: { code: string; message: string; details?: unknown }) => {
      switch (error.code) {
        case 'PROMPT_NOT_FOUND':
          return { code: 'RESOURCE_NOT_FOUND', statusCode: 404, retryable: false, message: error.message };
        case 'MODEL_RATE_LIMITED':
          return { code: 'SERVICE_UNAVAILABLE', statusCode: 503, retryable: true, message: error.message };
        case 'VALIDATION_ERROR':
          return { code: 'VALIDATION_ERROR', statusCode: 400, retryable: false, message: error.message };
        case 'INVALID_MODEL_OUTPUT':
          return { code: 'INVALID_MODEL_OUTPUT', statusCode: 500, retryable: false, message: error.message };
        default:
          return { code: 'INTERNAL_ERROR', statusCode: 500, retryable: false, message: error.message };
      }
    },
  };
});

function createEvent(body: string | null): APIGatewayProxyEvent {
  return {
    body,
    headers: {},
  };
}

describe('aiSuggestExpression handler', () => {
  beforeEach(() => {
    invokeAIMock.mockReset();
    vi.resetModules();
  });

  it('returns 200 and AI result for valid request', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        expression: 'default(source("InvoiceCurrency"), "USD")',
        explanation: 'Uses source currency when available, otherwise USD',
      },
      promptId: 'nl-to-rule',
      model: 'openai/gpt-4.1-mini',
    });

    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'default currency to USD if missing',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
          targetDescription: 'ISO currency code for the document',
          sourceContext: '- InvoiceCurrency (string)\n- Header.Currency (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    expect(response.headers?.['x-request-id']).toBeTruthy();

    const parsedBody = JSON.parse(response.body) as {
      success: boolean;
      data: { expression: string };
      promptId: string;
      model: string;
    };

    expect(parsedBody.success).toBe(true);
    expect(parsedBody.data.expression).toContain('default(');
    expect(parsedBody.promptId).toBe('nl-to-rule');

    expect(invokeAIMock).toHaveBeenCalledWith('nl-to-rule', {
      instruction: 'default currency to USD if missing',
      targetPath: 'Order.Header.CurrencyCode',
      targetType: 'string',
      targetDescription: 'ISO currency code for the document',
      sourceFields: '- InvoiceCurrency (string)\n- Header.Currency (string)',
    });
  });

  it('returns canonical VALIDATION_ERROR envelope when instruction is missing', async () => {
    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
          sourceContext: '- InvoiceCurrency (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body) as { error: { code: string; retryable: boolean; requestId: string } };
    expect(parsed.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      retryable: false,
    });
    expect(parsed.error.requestId).toBeTruthy();
  });

  it('defaults targetDescription to empty string when missing', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        expression: 'source("InvoiceCurrency")',
      },
      promptId: 'nl-to-rule',
      model: 'openai/gpt-4.1-mini',
    });

    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'use invoice currency',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
          sourceContext: '- InvoiceCurrency (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    const aiVariables = invokeAIMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(aiVariables.targetDescription).toBe('');
  });

  it('maps PROMPT_NOT_FOUND to canonical RESOURCE_NOT_FOUND envelope (AE-06)', async () => {
    invokeAIMock.mockResolvedValue({
      success: false,
      error: {
        code: 'PROMPT_NOT_FOUND',
        message: 'No prompt found for promptId: nl-to-rule',
      },
      promptId: 'nl-to-rule',
    });

    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'copy field',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
          sourceContext: '- Field1 (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(404);
    const parsed = JSON.parse(response.body) as { error: { code: string; statusCode: number; retryable: boolean } };
    expect(parsed.error).toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      statusCode: 404,
      retryable: false,
    });
  });

  it('maps MODEL_RATE_LIMITED to canonical SERVICE_UNAVAILABLE envelope', async () => {
    invokeAIMock.mockResolvedValue({
      success: false,
      error: {
        code: 'MODEL_RATE_LIMITED',
        message: 'Rate limited',
      },
      promptId: 'nl-to-rule',
    });

    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'copy field',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
          sourceContext: '- Field1 (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(503);
    const parsed = JSON.parse(response.body) as { error: { code: string; statusCode: number; retryable: boolean } };
    expect(parsed.error).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      retryable: true,
    });
  });

  it('maps INVALID_MODEL_OUTPUT to canonical INVALID_MODEL_OUTPUT envelope on HTTP 500 (AE-05)', async () => {
    invokeAIMock.mockResolvedValue({
      success: false,
      error: {
        code: 'INVALID_MODEL_OUTPUT',
        message: 'Model response failed schema validation',
      },
      promptId: 'nl-to-rule',
    });

    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'copy field',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
          sourceContext: '- Field1 (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(500);
    const parsed = JSON.parse(response.body) as {
      error: { code: string; statusCode: number; retryable: boolean; message: string };
    };
    expect(parsed.error).toMatchObject({
      code: 'INVALID_MODEL_OUTPUT',
      statusCode: 500,
      retryable: false,
    });
    expect(parsed.error.message).toContain('schema validation');
  });

  it('maps unknown AI errors to canonical INTERNAL_ERROR envelope', async () => {
    invokeAIMock.mockResolvedValue({
      success: false,
      error: {
        code: 'MODEL_ERROR',
        message: 'Model unavailable',
      },
      promptId: 'nl-to-rule',
    });

    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'copy field',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
          sourceContext: '- Field1 (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(500);
    const parsed = JSON.parse(response.body) as { error: { code: string; statusCode: number; retryable: boolean } };
    expect(parsed.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      retryable: false,
    });
  });

  it('returns canonical INTERNAL_ERROR envelope on unexpected exception', async () => {
    invokeAIMock.mockRejectedValue(new Error('unexpected failure'));

    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'copy field',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
          sourceContext: '- Field1 (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(500);
    const parsed = JSON.parse(response.body) as { error: { code: string; retryable: boolean; message: string } };
    expect(parsed.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      retryable: true,
      message: 'Unexpected error while handling request',
    });
  });
});
