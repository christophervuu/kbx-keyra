import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent } from '../../../src/lambda/shared/index.js';

const invokeAIMock = vi.hoisted(() => vi.fn());
const parseMock = vi.hoisted(() => vi.fn());

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

vi.mock('../../../src/engine/dsl/index.js', () => {
  return {
    parse: parseMock,
  };
});

vi.mock('../../../src/engine/registry/function-registry.js', () => {
  return {
    defaultRegistry: {},
  };
});

function createEvent(body: string | null): APIGatewayProxyEvent {
  return {
    body,
    headers: {},
  };
}

describe('aiAutoMap handler', () => {
  beforeEach(() => {
    invokeAIMock.mockReset();
    parseMock.mockReset();
    vi.resetModules();
  });

  it('returns 200 and enriched AI result for valid request', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        rules: [
          {
            target: 'Order.Header.DocumentType',
            expression: 'if(lt(source("InvoiceAmount"), 0), "CreditMemo", "Invoice")',
            explanation: 'Sets document type based on amount sign',
            confidence: 'high',
          },
        ],
      },
      promptId: 'auto-map',
      model: 'openai/gpt-4.1',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    });

    parseMock.mockReturnValue({
      ast: {},
      diagnostics: [],
    });

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetSection:
            '- Order.Header.DocumentType (string)\n- Order.Header.DocumentDate (string)\n- Order.Header.CurrencyCode (string)',
          sourceContext:
            '- InvoiceAmount (number)\n- InvDate (string, MM/DD/YYYY)\n- InvoiceCurrency (string)\n- Header.Currency (string)',
          businessContext: 'AP invoice to ShipmentOrder mapping',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS,POST',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
    expect(response.headers?.['x-request-id']).toBeTruthy();

    const parsedBody = JSON.parse(response.body) as {
      success: boolean;
      data: {
        rules: Array<{
          target: string;
          expression: string;
          validation: { valid: boolean; diagnostics: string[] };
        }>;
        suggestions: Array<{
          target: string;
          expression: string;
          validation?: {
            valid: boolean;
            diagnostics: Array<{
              code: string;
              severity: 'error' | 'warning' | 'info';
              message: string;
            }>;
          };
        }>;
      };
      promptId: string;
      model: string;
    };

    expect(parsedBody.success).toBe(true);
    expect(parsedBody.promptId).toBe('auto-map');
    expect(parsedBody.model).toBe('openai/gpt-4.1');
    expect(parsedBody.data.rules[0]?.validation).toEqual({
      valid: true,
      diagnostics: [],
    });
    expect(parsedBody.data.suggestions[0]?.target).toBe('Order.Header.DocumentType');

    expect(invokeAIMock).toHaveBeenCalledWith('auto-map', {
      targetSection:
        '- Order.Header.DocumentType (string)\n- Order.Header.DocumentDate (string)\n- Order.Header.CurrencyCode (string)',
      sourceContext:
        '- InvoiceAmount (number)\n- InvDate (string, MM/DD/YYYY)\n- InvoiceCurrency (string)\n- Header.Currency (string)',
      businessContext: 'AP invoice to ShipmentOrder mapping',
    });
  });

  it('returns plain 400 body for missing targetSection as existing contract', async () => {
    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          sourceContext: '- InvoiceAmount (number)',
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Missing required field: targetSection or sectionPath',
    });
  });

  it('maps PROMPT_NOT_FOUND to canonical RESOURCE_NOT_FOUND envelope (AE-06)', async () => {
    invokeAIMock.mockResolvedValue({
      success: false,
      error: {
        code: 'PROMPT_NOT_FOUND',
        message: 'No prompt found for promptId: auto-map',
      },
      promptId: 'auto-map',
    });

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetSection: '- Order.Header.DocumentType (string)',
          sourceContext: '- InvoiceAmount (number)',
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
      promptId: 'auto-map',
    });

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetSection: '- Order.Header.DocumentType (string)',
          sourceContext: '- InvoiceAmount (number)',
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
      promptId: 'auto-map',
    });

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetSection: '- Order.Header.DocumentType (string)',
          sourceContext: '- InvoiceAmount (number)',
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
      promptId: 'auto-map',
    });

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetSection: '- Order.Header.DocumentType (string)',
          sourceContext: '- InvoiceAmount (number)',
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

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetSection: '- Order.Header.DocumentType (string)',
          sourceContext: '- InvoiceAmount (number)',
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

  it('handles non-string expression defensively with validation error', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        rules: [
          {
            target: 'Order.Header.DocumentType',
            expression: null,
            explanation: 'test',
            confidence: 'low',
          },
        ],
      },
      promptId: 'auto-map',
      model: 'openai/gpt-4.1',
    });

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetSection: '- Order.Header.DocumentType (string)',
          sourceContext: '- InvoiceAmount (number)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);

    const parsedBody = JSON.parse(response.body) as {
      data: { rules: Array<{ validation: { valid: boolean; diagnostics: string[] } }> };
    };

    expect(parsedBody.data.rules[0]?.validation).toEqual({
      valid: false,
      diagnostics: ['No expression to validate'],
    });
  });
});
