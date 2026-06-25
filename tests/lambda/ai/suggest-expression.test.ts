import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent } from '../../../src/lambda/shared/index.js';

const invokeAIMock = vi.hoisted(() => vi.fn());

const sharedMocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  getObject: vi.fn(),
  query: vi.fn(),
  parseBody: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  notFound: vi.fn(),
  generateRequestId: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
  },
}));

vi.mock('../../../src/lib/ai/index.js', () => {
  return {
    invokeAI: invokeAIMock,
    normalizeAIError: (error: { code: string; message: string }) => {
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

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

function createEvent(body: string | null): APIGatewayProxyEvent {
  return {
    body,
    headers: {},
  };
}

function createSourceSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      InvoiceCurrency: { type: 'string' },
      TotalAmount: { type: 'number' },
    },
  };
}

function createTargetSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      Order: {
        type: 'object',
        properties: {
          Header: {
            type: 'object',
            properties: {
              CurrencyCode: { type: 'string' },
              TotalAmount: { type: 'number' },
            },
          },
        },
      },
    },
  };
}

describe('aiSuggestExpression handler', () => {
  beforeEach(() => {
    invokeAIMock.mockReset();
    vi.resetModules();

    process.env.MAPPINGS_TABLE = 'Mappings';
    process.env.SCHEMAS_TABLE = 'Schemas';
    process.env.SCHEMA_NODES_TABLE = 'SchemaNodes';
    process.env.CONTENT_BUCKET = 'ContentBucket';

    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-123');

    sharedMocks.parseBody.mockReset().mockImplementation((event: APIGatewayProxyEvent) => {
      if (!event.body) {
        return null;
      }

      try {
        const parsed = JSON.parse(event.body) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return null;
        }

        return parsed as Record<string, unknown>;
      } catch {
        return null;
      }
    });

    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode: number, body: unknown, requestId?: string) => ({
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
      body: JSON.stringify(body),
    }));

    sharedMocks.errorResponse.mockReset().mockImplementation(
      (
        code: string,
        message: string,
        statusCode: number,
        retryable: boolean,
        requestId?: string,
      ) => ({
        statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          ...(requestId ? { 'x-request-id': requestId } : {}),
        },
        body: JSON.stringify({
          error: {
            code,
            message,
            statusCode,
            retryable,
            requestId: requestId ?? 'req-fallback',
          },
        }),
      }),
    );

    sharedMocks.notFound.mockReset().mockImplementation((resource: string, id: string, requestId?: string) => ({
      code: 'RESOURCE_NOT_FOUND',
      message: `${resource} with id '${id}' not found`,
      statusCode: 404,
      retryable: false,
      requestId: requestId ?? 'req-fallback',
    }));

    sharedMocks.getItem.mockReset().mockImplementation(async (params: { TableName: string; Key: { [k: string]: string } }) => {
      if (params.TableName === 'Mappings') {
        if (params.Key.mappingId === 'mapping-missing') {
          return null;
        }

        return {
          mappingId: params.Key.mappingId,
          sourceSchemaId: 'schema-source-1',
          targetSchemaId: 'schema-target-1',
        };
      }

      if (params.TableName === 'Schemas') {
        const schemaId = params.Key.schemaId;
        if (schemaId === 'schema-source-1' || schemaId === 'schema-target-1') {
          return {
            schemaId,
            format: 'json-schema',
          };
        }
      }

      return null;
    });

    sharedMocks.query.mockReset().mockResolvedValue([
      {
        schemaId: 'schema-source-1',
        path: 'InvoiceCurrency',
        fieldName: 'InvoiceCurrency',
        type: 'string',
      },
      {
        schemaId: 'schema-source-1',
        path: 'TotalAmount',
        fieldName: 'TotalAmount',
        type: 'number',
      },
    ]);

    sharedMocks.getObject.mockReset().mockImplementation(async (params: { Key: string }) => {
      if (params.Key.includes('schema-source-1')) {
        return JSON.stringify(createSourceSchema());
      }
      return JSON.stringify(createTargetSchema());
    });
  });

  it('returns 200 with backend-built context and validation metadata for valid request (AE-01/AE-02)', async () => {
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
          mappingId: 'mapping-1',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
          targetDescription: 'ISO currency code for the document',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers?.['x-request-id']).toBe('req-123');

    const parsedBody = JSON.parse(response.body) as {
      success: boolean;
      data: {
        expression: string;
        validation: { valid: boolean; diagnostics: Array<{ severity: string }> };
        readyToApply: boolean;
        context: { sourceNodeCount: number; includedNodeCount: number; truncated: boolean };
      };
      promptId: string;
    };

    expect(parsedBody.success).toBe(true);
    expect(parsedBody.promptId).toBe('nl-to-rule');
    expect(parsedBody.data.expression).toContain('default(');
    expect(parsedBody.data.validation.valid).toBe(true);
    expect(parsedBody.data.readyToApply).toBe(true);
    expect(parsedBody.data.context).toMatchObject({
      sourceNodeCount: 2,
      includedNodeCount: 2,
      truncated: false,
    });

    expect(invokeAIMock).toHaveBeenCalledWith('nl-to-rule', {
      instruction: 'default currency to USD if missing',
      targetPath: 'Order.Header.CurrencyCode',
      targetType: 'string',
      targetDescription: 'ISO currency code for the document',
      sourceFields: '- InvoiceCurrency (string)\n- TotalAmount (number)',
    }, {
      telemetry: {
        requestId: 'req-123',
        correlationId: undefined,
      },
    });
  });

  it('handles OPTIONS preflight with AI CORS headers', async () => {
    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler({
      body: null,
      headers: {},
      httpMethod: 'OPTIONS',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS,POST',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
  });

  it('returns VALIDATION_ERROR when mappingId is missing', async () => {
    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'copy field',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
    expect(parsed.error.message).toContain('mappingId');
    expect(invokeAIMock).not.toHaveBeenCalled();
  });

  it('returns RESOURCE_NOT_FOUND when mapping does not exist', async () => {
    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'copy field',
          mappingId: 'mapping-missing',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
        }),
      ),
    );

    expect(response.statusCode).toBe(404);
    const parsed = JSON.parse(response.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(parsed.error.message).toContain("Mapping with id 'mapping-missing' not found");
    expect(invokeAIMock).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_ERROR when source schema context is empty', async () => {
    sharedMocks.query.mockResolvedValueOnce([]);

    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'copy field',
          mappingId: 'mapping-1',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
    expect(parsed.error.message).toContain('has no retrievable context');
    expect(invokeAIMock).not.toHaveBeenCalled();
  });

  it('enforces context truncation bounds deterministically', async () => {
    const hugeNodes = Array.from({ length: 5000 }, (_, idx) => ({
      schemaId: 'schema-source-1',
      path: `Very.Long.Path.Field${idx.toString().padStart(4, '0')}`,
      fieldName: `Field${idx.toString().padStart(4, '0')}`,
      type: 'string',
      description: 'x'.repeat(120),
    }));
    sharedMocks.query.mockResolvedValueOnce(hugeNodes);

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
          instruction: 'copy currency',
          mappingId: 'mapping-1',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);

    const parsedBody = JSON.parse(response.body) as {
      data: {
        context: {
          truncated: boolean;
          sourceNodeCount: number;
          includedNodeCount: number;
          byteLength: number;
          approxTokenCount: number;
        };
      };
    };

    expect(parsedBody.data.context.truncated).toBe(true);
    expect(parsedBody.data.context.sourceNodeCount).toBe(5000);
    expect(parsedBody.data.context.includedNodeCount).toBeLessThan(5000);
    expect(parsedBody.data.context.byteLength).toBeLessThanOrEqual(64 * 1024);
    expect(parsedBody.data.context.approxTokenCount).toBeLessThanOrEqual(8000);

    const invokeArgs = invokeAIMock.mock.calls[0]?.[1] as { sourceFields: string };
    expect(new TextEncoder().encode(invokeArgs.sourceFields).length).toBeLessThanOrEqual(64 * 1024);
    expect(Math.ceil(invokeArgs.sourceFields.length / 4)).toBeLessThanOrEqual(8000);
  });

  it('returns invalid suggestion payload with diagnostics when validation fails target-type compatibility (AE-03)', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        expression: '"not-a-number"',
        explanation: 'Sets a static value',
      },
      promptId: 'nl-to-rule',
      model: 'openai/gpt-4.1-mini',
    });

    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'set amount',
          mappingId: 'mapping-1',
          targetPath: 'Order.Header.TotalAmount',
          targetType: 'number',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body) as {
      data: {
        validation: {
          valid: boolean;
          diagnostics: Array<{ code: string; severity: string; message: string }>;
        };
        readyToApply: boolean;
      };
    };

    expect(parsed.data.validation.valid).toBe(false);
    expect(parsed.data.readyToApply).toBe(false);
    expect(parsed.data.validation.diagnostics.some((d) => d.severity === 'error')).toBe(true);
    expect(parsed.data.validation.diagnostics.some((d) => d.code === 'KEYRA-E005')).toBe(true);
  });

  it('returns INVALID_MODEL_OUTPUT when AI success payload misses expression', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        explanation: 'No expression included',
      },
      promptId: 'nl-to-rule',
      model: 'openai/gpt-4.1-mini',
    });

    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'copy currency',
          mappingId: 'mapping-1',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
        }),
      ),
    );

    expect(response.statusCode).toBe(500);
    const parsed = JSON.parse(response.body) as { error: { code: string; retryable: boolean } };
    expect(parsed.error.code).toBe('INVALID_MODEL_OUTPUT');
    expect(parsed.error.retryable).toBe(false);
  });

  it('maps PROMPT_NOT_FOUND to canonical RESOURCE_NOT_FOUND envelope', async () => {
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
          instruction: 'copy currency',
          mappingId: 'mapping-1',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
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

  it('returns INTERNAL_ERROR envelope on unexpected exception', async () => {
    sharedMocks.getItem.mockRejectedValueOnce(new Error('boom'));

    const { handler } = await import('../../../src/lambda/ai/suggest-expression.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          instruction: 'copy currency',
          mappingId: 'mapping-1',
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
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
