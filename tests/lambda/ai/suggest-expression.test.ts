import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent } from '../../../src/lambda/ai/suggest-expression.js';

const invokeAIMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/ai/index.js', () => {
  return {
    invokeAI: invokeAIMock,
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

  it('returns 200 and AI result for valid request (AE-01)', async () => {
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
    expect(response.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });

    const parsedBody = JSON.parse(response.body) as {
      success: boolean;
      data: { expression: string };
      promptId: string;
      model: string;
    };

    expect(parsedBody.success).toBe(true);
    expect(parsedBody.data.expression).toContain('default(');
    expect(parsedBody.promptId).toBe('nl-to-rule');
    expect(parsedBody.model).toBeTruthy();

    expect(invokeAIMock).toHaveBeenCalledWith('nl-to-rule', {
      instruction: 'default currency to USD if missing',
      targetPath: 'Order.Header.CurrencyCode',
      targetType: 'string',
      targetDescription: 'ISO currency code for the document',
      sourceFields: '- InvoiceCurrency (string)\n- Header.Currency (string)',
    });
  });

  it('returns 400 when instruction is missing (AE-02)', async () => {
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
    expect(JSON.parse(response.body)).toEqual({
      error: 'Missing required field: instruction',
    });
  });

  it('returns 400 when targetPath is missing (AE-03)', async () => {
    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'default currency to USD if missing',
          targetType: 'string',
          sourceContext: '- InvoiceCurrency (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Missing required field: targetPath',
    });
  });

  it('returns 400 when targetType is missing (AE-04)', async () => {
    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'default currency to USD if missing',
          targetPath: 'Order.Header.CurrencyCode',
          sourceContext: '- InvoiceCurrency (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Missing required field: targetType',
    });
  });

  it('returns 400 when sourceContext is missing (AE-05)', async () => {
    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'default currency to USD if missing',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Missing required field: sourceContext',
    });
  });

  it('returns 400 when required field is empty string (AE-06)', async () => {
    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: '',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
          sourceContext: '- InvoiceCurrency (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Missing required field: instruction',
    });
  });

  it('defaults targetDescription to empty string when missing (AE-07)', async () => {
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
    expect(invokeAIMock).toHaveBeenCalledTimes(1);

    const aiVariables = invokeAIMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(aiVariables.targetDescription).toBe('');
  });

  it('maps sourceContext request field to sourceFields variable (AE-08)', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        expression: 'source("Field1")',
      },
      promptId: 'nl-to-rule',
      model: 'openai/gpt-4.1-mini',
    });

    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'copy the field',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
          sourceContext: '- Field1 (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(invokeAIMock).toHaveBeenCalledTimes(1);

    const aiVariables = invokeAIMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(aiVariables.sourceFields).toBe('- Field1 (string)');
    expect(aiVariables).not.toHaveProperty('sourceContext');
  });

  it('returns 400 when body is null (AE-09)', async () => {
    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(createEvent(null));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Invalid request body',
    });
  });

  it('returns 400 when body is invalid JSON (AE-10)', async () => {
    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(createEvent('{invalid-json'));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Invalid request body',
    });
  });

  it('maps PROMPT_NOT_FOUND to 404 (AE-11)', async () => {
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
  });

  it('maps MODEL_RATE_LIMITED to 429 (AE-12)', async () => {
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

    expect(response.statusCode).toBe(429);
  });

  it('maps unknown AI errors to 500 (AE-13)', async () => {
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
  });

  it('returns synthetic MODEL_ERROR on unexpected exception (AE-14)', async () => {
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
    expect(JSON.parse(response.body)).toEqual({
      success: false,
      error: {
        code: 'MODEL_ERROR',
        message: 'Unexpected error while handling request',
      },
      promptId: 'nl-to-rule',
    });
  });

  it('includes JSON and CORS headers on responses (AE-15)', async () => {
    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(createEvent(null));

    expect(response.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
  });
});
