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
  const PROMPT_IDS = {
    EXPLAIN_RULE: 'explain-rule',
    NATURAL_LANGUAGE_TO_DSL: 'natural-language-to-dsl',
    SMART_FIX: 'smart-fix',
    AI_VALIDATION: 'ai-validation',
    AUTO_MAP: 'auto-map',
    FIELD_DESCRIPTION: 'field-description',
  } as const;

  return {
    invokeAI: invokeAIMock,
    PROMPT_IDS,
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

describe('aiValidateMappings handler', () => {
  beforeEach(() => {
    invokeAIMock.mockReset();
    vi.resetModules();

    process.env.MAPPINGS_TABLE = 'Mappings';
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
          configS3Key: 'mappings/mapping-1/config.json',
        };
      }

      return null;
    });

    sharedMocks.getObject.mockReset().mockResolvedValue(
      JSON.stringify({
        rules: [
          {
            target: 'Order.Header.CurrencyCode',
            type: 'string',
            expression: 'default(source("InvoiceCurrency"), "USD")',
          },
        ],
      }),
    );

    sharedMocks.query.mockReset().mockImplementation(async (params: { ExpressionAttributeValues?: { [k: string]: string } }) => {
      const schemaId = params.ExpressionAttributeValues?.[':schemaId'];
      if (schemaId === 'schema-source-1') {
        return [
          {
            schemaId: 'schema-source-1',
            path: 'InvoiceCurrency',
            type: 'string',
          },
          {
            schemaId: 'schema-source-1',
            path: 'InvoiceAmount',
            type: 'number',
          },
        ];
      }

      return [
        {
          schemaId: 'schema-target-1',
          path: 'Order.Header.CurrencyCode',
          type: 'string',
        },
      ];
    });
  });

  it('returns 200 with structured validation report (AE-01/AE-02)', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      promptId: 'ai-validation',
      model: 'openai/gpt-4.1',
      data: {
        summary: {
          totalIssues: 1,
          bySeverity: { info: 0, warning: 1, error: 0 },
          byCategory: { correctness: 0, completeness: 1, maintainability: 0, risk: 0 },
        },
        issues: [
          {
            id: 'issue-1',
            category: 'completeness',
            severity: 'warning',
            affectedRules: [{ ruleIndex: 0, targetPath: 'Order.Header.CurrencyCode' }],
            description: 'Fallback strategy is incomplete for null source currency.',
            recommendation: 'Add explicit fallback to a default currency.',
          },
        ],
      },
    });

    const { handler } = await import('../../../src/lambda/ai/validate-mappings.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'mapping-1',
          sampleData: {
            contentType: 'application/json',
            content: JSON.stringify({ InvoiceCurrency: null }),
          },
        }),
      ),
    );

    expect(response.statusCode).toBe(200);

    const parsed = JSON.parse(response.body) as {
      success: boolean;
      data: {
        summary: { totalIssues: number };
        issues: Array<{ category: string; severity: string; recommendation: string }>;
      };
    };

    expect(parsed.success).toBe(true);
    expect(parsed.data.summary.totalIssues).toBe(1);
    expect(parsed.data.issues[0]).toMatchObject({
      category: 'completeness',
      severity: 'warning',
    });
    expect(typeof parsed.data.issues[0]?.recommendation).toBe('string');

    expect(invokeAIMock).toHaveBeenCalledTimes(1);
    const invokeArgs = invokeAIMock.mock.calls[0]?.[1] as Record<string, string>;
    const invokeOptions = invokeAIMock.mock.calls[0]?.[2] as {
      telemetry?: { requestId?: string; correlationId?: string };
    };
    expect(invokeArgs.mappingId).toBe('mapping-1');
    expect(invokeArgs.sampleDataProvided).toBe('true');
    expect(invokeArgs.sampleDataContentType).toBe('application/json');
    expect(invokeArgs.sourceSchemaContext).toContain('Source schema context');
    expect(invokeArgs.targetSchemaContext).toContain('Target schema context');
    expect(invokeOptions.telemetry).toEqual({
      requestId: 'req-123',
      correlationId: undefined,
    });
  });

  it('rejects batch payload for V1 single-mapping policy', async () => {
    const { handler } = await import('../../../src/lambda/ai/validate-mappings.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingIds: ['mapping-1', 'mapping-2'],
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
    expect(parsed.error.message).toContain('single mappingId');
    expect(invokeAIMock).not.toHaveBeenCalled();
  });

  it('rejects sample data over 1 MB with clear validation error (AE-07)', async () => {
    const oversized = 'x'.repeat(1024 * 1024 + 1);
    const { handler } = await import('../../../src/lambda/ai/validate-mappings.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'mapping-1',
          sampleData: {
            contentType: 'application/json',
            content: oversized,
          },
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
    expect(parsed.error.message).toContain('1 MB');
    expect(invokeAIMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported sample-data contentType', async () => {
    const { handler } = await import('../../../src/lambda/ai/validate-mappings.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'mapping-1',
          sampleData: {
            contentType: 'application/pdf',
            content: 'hello',
          },
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body) as { error: { code: string } };
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
    expect(invokeAIMock).not.toHaveBeenCalled();
  });

  it('maps prompt/runtime failures through canonical normalizeAIError path (AE-06)', async () => {
    invokeAIMock.mockResolvedValue({
      success: false,
      promptId: 'ai-validation',
      error: {
        code: 'PROMPT_NOT_FOUND',
        message: 'No prompt found for promptId: ai-validation',
      },
    });

    const { handler } = await import('../../../src/lambda/ai/validate-mappings.js');

    const response = await handler(createEvent(JSON.stringify({ mappingId: 'mapping-1' })));

    expect(response.statusCode).toBe(404);
    const parsed = JSON.parse(response.body) as { error: { code: string; statusCode: number; retryable: boolean } };
    expect(parsed.error).toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      statusCode: 404,
      retryable: false,
    });
  });

  it('returns INVALID_MODEL_OUTPUT when issue enums are outside canonical V1 sets (AE-08)', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      promptId: 'ai-validation',
      model: 'openai/gpt-4.1',
      data: {
        summary: {
          totalIssues: 1,
          bySeverity: { info: 0, warning: 0, error: 1 },
          byCategory: { correctness: 1, completeness: 0, maintainability: 0, risk: 0 },
        },
        issues: [
          {
            id: 'issue-1',
            category: 'performance',
            severity: 'critical',
            affectedRules: [{ ruleIndex: 0 }],
            description: 'Invalid enums',
            recommendation: 'Fix enums',
          },
        ],
      },
    });

    const { handler } = await import('../../../src/lambda/ai/validate-mappings.js');

    const response = await handler(createEvent(JSON.stringify({ mappingId: 'mapping-1' })));

    expect(response.statusCode).toBe(500);
    const parsed = JSON.parse(response.body) as { error: { code: string; retryable: boolean } };
    expect(parsed.error.code).toBe('INVALID_MODEL_OUTPUT');
    expect(parsed.error.retryable).toBe(false);
  });

  it('returns RESOURCE_NOT_FOUND when mapping does not exist', async () => {
    const { handler } = await import('../../../src/lambda/ai/validate-mappings.js');

    const response = await handler(createEvent(JSON.stringify({ mappingId: 'mapping-missing' })));

    expect(response.statusCode).toBe(404);
    const parsed = JSON.parse(response.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(parsed.error.message).toContain("Mapping with id 'mapping-missing' not found");
  });

  it('returns INTERNAL_ERROR envelope on unexpected exceptions', async () => {
    sharedMocks.getItem.mockRejectedValueOnce(new Error('boom'));
    const { handler } = await import('../../../src/lambda/ai/validate-mappings.js');

    const response = await handler(createEvent(JSON.stringify({ mappingId: 'mapping-1' })));

    expect(response.statusCode).toBe(500);
    const parsed = JSON.parse(response.body) as { error: { code: string; retryable: boolean; message: string } };
    expect(parsed.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      retryable: true,
      message: 'Unexpected error while handling request',
    });
  });
});
