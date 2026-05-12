import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent } from '../../../src/lambda/ai/auto-map.js';

const invokeAIMock = vi.hoisted(() => vi.fn());
const parseMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/ai/index.js', () => {
  return {
    invokeAI: invokeAIMock,
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

  it('returns 200 and enriched AI result for valid request (AE-01)', async () => {
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
    expect(response.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS,POST',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });

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
    expect(parsedBody.data.rules).toHaveLength(1);
    expect(parsedBody.data.rules[0]?.validation).toEqual({
      valid: true,
      diagnostics: [],
    });
    expect(parsedBody.data.suggestions).toHaveLength(1);
    expect(parsedBody.data.suggestions[0]?.target).toBe('Order.Header.DocumentType');
    expect(parsedBody.data.suggestions[0]?.expression).toBe(
      'if(lt(source("InvoiceAmount"), 0), "CreditMemo", "Invoice")',
    );
    expect(parsedBody.data.suggestions[0]?.validation).toEqual({
      valid: true,
      diagnostics: [],
    });

    expect(invokeAIMock).toHaveBeenCalledWith('auto-map', {
      targetSection:
        '- Order.Header.DocumentType (string)\n- Order.Header.DocumentDate (string)\n- Order.Header.CurrencyCode (string)',
      sourceContext:
        '- InvoiceAmount (number)\n- InvDate (string, MM/DD/YYYY)\n- InvoiceCurrency (string)\n- Header.Currency (string)',
      businessContext: 'AP invoice to ShipmentOrder mapping',
    });
  });

  it('returns 400 when targetSection is missing (AE-02)', async () => {
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

  it('returns 400 when sourceContext is missing (AE-03)', async () => {
    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetSection: '- Order.Header.DocumentType (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Missing required field: sourceContext',
    });
  });

  it('returns 400 when targetSection is empty (AE-04)', async () => {
    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetSection: '',
          sourceContext: '- InvoiceAmount (number)',
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Missing required field: targetSection or sectionPath',
    });
  });

  it('returns 400 when sourceContext is empty (AE-05)', async () => {
    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetSection: '- Order.Header.DocumentType (string)',
          sourceContext: '',
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Missing required field: sourceContext',
    });
  });

  it('defaults businessContext to empty string when missing (AE-06)', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        rules: [],
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
    expect(invokeAIMock).toHaveBeenCalledTimes(1);

    const aiVariables = invokeAIMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(aiVariables.businessContext).toBe('');
  });

  it('returns 400 when body is null (AE-07)', async () => {
    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(createEvent(null));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Invalid request body',
    });
  });

  it('returns 400 when body is invalid JSON (AE-08)', async () => {
    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(createEvent('{invalid-json'));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Invalid request body',
    });
  });

  it('maps PROMPT_NOT_FOUND to 404 (AE-09)', async () => {
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
  });

  it('maps MODEL_RATE_LIMITED to 429 (AE-10)', async () => {
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

    expect(response.statusCode).toBe(429);
  });

  it('maps unknown AI errors to 500 (AE-11)', async () => {
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
  });

  it('returns synthetic MODEL_ERROR on unexpected exception (AE-12)', async () => {
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
    expect(JSON.parse(response.body)).toEqual({
      success: false,
      error: {
        code: 'MODEL_ERROR',
        message: 'Unexpected error while handling request',
      },
      promptId: 'auto-map',
    });
  });

  it('marks rule validation false when parse has error diagnostics (AE-13)', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        rules: [
          {
            target: 'Order.Header.DocumentType',
            expression: 'unknownFunc(source("InvoiceAmount"))',
            explanation: 'test',
            confidence: 'low',
          },
        ],
      },
      promptId: 'auto-map',
      model: 'openai/gpt-4.1',
    });

    parseMock.mockReturnValue({
      ast: null,
      diagnostics: [
        {
          severity: 'error',
          message: 'Unknown function: unknownFunc',
        },
      ],
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
      diagnostics: ['Unknown function: unknownFunc'],
    });
  });

  it('marks all rules valid when parse has no error diagnostics (AE-14)', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        rules: [
          {
            target: 'Order.Header.DocumentType',
            expression: 'if(lt(source("InvoiceAmount"), 0), "CreditMemo", "Invoice")',
            explanation: 'test',
            confidence: 'high',
          },
          {
            target: 'Order.Header.CurrencyCode',
            expression: 'coalesce(source("InvoiceCurrency"), source("Header.Currency"))',
            explanation: 'test',
            confidence: 'medium',
          },
        ],
      },
      promptId: 'auto-map',
      model: 'openai/gpt-4.1',
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
            '- Order.Header.DocumentType (string)\n- Order.Header.CurrencyCode (string)',
          sourceContext: '- InvoiceAmount (number)\n- InvoiceCurrency (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);

    const parsedBody = JSON.parse(response.body) as {
      data: { rules: Array<{ validation: { valid: boolean; diagnostics: string[] } }> };
    };

    for (const rule of parsedBody.data.rules) {
      expect(rule.validation).toEqual({
        valid: true,
        diagnostics: [],
      });
    }
  });

  it('includes JSON and CORS headers on responses (AE-15)', async () => {
    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(createEvent(null));

    expect(response.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS,POST',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
  });

  describe('target listing filter', () => {
    it('filters section suggestions to targets listed in targetSection', async () => {
      invokeAIMock.mockResolvedValue({
        success: true,
        data: {
          rules: [
            {
              target: 'Order.Header.DocumentType',
              expression: 'source("InvoiceType")',
              explanation: 'test',
              confidence: 'high',
            },
            {
              target: 'Order.Header',
              expression: 'source("Header")',
              explanation: 'test',
              confidence: 'low',
            },
            {
              target: 'Order.Header.LineItems',
              expression: 'map(source("Lines"), item)',
              explanation: 'test',
              confidence: 'medium',
            },
          ],
        },
        promptId: 'auto-map',
        model: 'openai/gpt-4.1',
      });

      parseMock.mockReturnValue({ ast: {}, diagnostics: [] });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { handler } = await import('../../../src/lambda/ai/auto-map.js');
      const response = await handler(
        createEvent(
          JSON.stringify({
            targetSection:
              '- Order.Header.DocumentType (string)\n- Order.Header.LineItems (array)',
            sectionPath: 'Order.Header',
            sourceContext: '- InvoiceType (string)\n- Lines (array)',
          }),
        ),
      );

      expect(response.statusCode).toBe(200);
      const parsedBody = JSON.parse(response.body) as {
        data: { suggestions: Array<{ target: string }> };
      };

      expect(parsedBody.data.suggestions.map((suggestion) => suggestion.target)).toEqual([
        'Order.Header.DocumentType',
        'Order.Header.LineItems',
      ]);
      expect(warnSpy).toHaveBeenCalledWith(
        '[auto-map] Suggestion target not in listing, filtered: Order.Header',
      );

      warnSpy.mockRestore();
    });

    it('keeps 5 listed suggestions and filters one unlisted suggestion', async () => {
      invokeAIMock.mockResolvedValue({
        success: true,
        data: {
          rules: [
            { target: 'Order.Header.DocumentType', expression: 'source("DocType")', explanation: 'test', confidence: 'high' },
            { target: 'Order.Header.Currency', expression: 'source("Currency")', explanation: 'test', confidence: 'medium' },
            { target: 'Order.Header.OrderDate', expression: 'source("OrderDate")', explanation: 'test', confidence: 'high' },
            { target: 'Order.Header.TotalAmount', expression: 'source("Total")', explanation: 'test', confidence: 'medium' },
            { target: 'Order.Header.LineItems', expression: 'map(source("Lines"), item)', explanation: 'test', confidence: 'low' },
            { target: 'Order.Header', expression: 'source("Header")', explanation: 'test', confidence: 'low' },
          ],
        },
        promptId: 'auto-map',
        model: 'openai/gpt-4.1',
      });

      parseMock.mockReturnValue({ ast: {}, diagnostics: [] });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { handler } = await import('../../../src/lambda/ai/auto-map.js');
      const response = await handler(
        createEvent(
          JSON.stringify({
            targetSection: [
              '- Order.Header.DocumentType (string)',
              '- Order.Header.Currency (string)',
              '- Order.Header.OrderDate (string)',
              '- Order.Header.TotalAmount (number)',
              '- Order.Header.LineItems (array)',
            ].join('\n'),
            sectionPath: 'Order.Header',
            sourceContext: '- DocType (string)\n- Currency (string)\n- OrderDate (string)\n- Total (number)\n- Lines (array)',
          }),
        ),
      );

      expect(response.statusCode).toBe(200);
      const parsedBody = JSON.parse(response.body) as {
        data: { suggestions: Array<{ target: string }> };
      };

      expect(parsedBody.data.suggestions.map((suggestion) => suggestion.target)).toEqual([
        'Order.Header.DocumentType',
        'Order.Header.Currency',
        'Order.Header.OrderDate',
        'Order.Header.TotalAmount',
        'Order.Header.LineItems',
      ]);
      expect(parsedBody.data.suggestions).toHaveLength(5);
      expect(warnSpy).toHaveBeenCalledWith(
        '[auto-map] Suggestion target not in listing, filtered: Order.Header',
      );

      warnSpy.mockRestore();
    });

    it('does not filter suggestions when targetSection is plain path (non-listing)', async () => {
      invokeAIMock.mockResolvedValue({
        success: true,
        data: {
          rules: [
            {
              target: 'Order.Header',
              expression: 'source("Header")',
              explanation: 'test',
              confidence: 'low',
            },
            {
              target: 'Order.Header.DocumentType',
              expression: 'source("InvoiceType")',
              explanation: 'test',
              confidence: 'high',
            },
          ],
        },
        promptId: 'auto-map',
        model: 'openai/gpt-4.1',
      });

      parseMock.mockReturnValue({ ast: {}, diagnostics: [] });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { handler } = await import('../../../src/lambda/ai/auto-map.js');
      const response = await handler(
        createEvent(
          JSON.stringify({
            targetSection: 'Order.Header',
            sectionPath: 'Order.Header',
            sourceContext: '- InvoiceType (string)',
          }),
        ),
      );

      expect(response.statusCode).toBe(200);
      const parsedBody = JSON.parse(response.body) as {
        data: { suggestions: Array<{ target: string }> };
      };

      expect(parsedBody.data.suggestions.map((suggestion) => suggestion.target)).toEqual([
        'Order.Header',
        'Order.Header.DocumentType',
      ]);
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
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

  it('returns success unchanged when rules is not an array', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        rules: 'unexpected-shape',
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
      success: boolean;
      data: { rules: string };
    };

    expect(parsedBody.success).toBe(true);
    expect(parsedBody.data.rules).toBe('unexpected-shape');
  });
});
