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
  conflict: vi.fn(),
  generateRequestId: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    CONFLICT: 'CONFLICT',
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

function createEvent(body: string | null, overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body,
    headers: {},
    ...overrides,
  };
}

function createSourceSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      InvoiceAmount: { type: 'number' },
      InvoiceCurrency: { type: 'string' },
      InvoiceType: { type: 'string' },
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
            },
          },
        },
      },
    },
  };
}

function computeRuleHash(rule: { target: string; expression: string; type: string }): string {
  const text = JSON.stringify(rule);
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

const CURRENT_RULE_HASH = computeRuleHash({
  target: 'Order.Header.CurrencyCode',
  expression: 'source("InvoiceCurrency")',
  type: 'string',
});

describe('aiSmartFix handler', () => {
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

    sharedMocks.conflict.mockReset().mockImplementation((message: string, requestId?: string) => ({
      code: 'CONFLICT',
      message,
      statusCode: 409,
      retryable: false,
      requestId: requestId ?? 'req-fallback',
    }));

    sharedMocks.getItem.mockReset().mockImplementation(async (params: { TableName: string; Key: { [k: string]: string } }) => {
      if (params.TableName === 'Mappings') {
        return {
          mappingId: params.Key.mappingId,
          version: 12,
          sourceSchemaId: 'schema-source-1',
          targetSchemaId: 'schema-target-1',
          configS3Key: 'mappings/mapping-1/config.json',
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

    sharedMocks.query.mockReset().mockImplementation(async (params: { ExpressionAttributeValues?: { [k: string]: string } }) => {
      const schemaId = params.ExpressionAttributeValues?.[':schemaId'];
      if (schemaId === 'schema-source-1') {
        return [
          {
            schemaId: 'schema-source-1',
            path: 'InvoiceAmount',
            fieldName: 'InvoiceAmount',
            type: 'number',
          },
          {
            schemaId: 'schema-source-1',
            path: 'InvoiceCurrency',
            fieldName: 'InvoiceCurrency',
            type: 'string',
          },
        ];
      }

      return [
        {
          schemaId: 'schema-target-1',
          path: 'Order.Header.CurrencyCode',
          fieldName: 'CurrencyCode',
          type: 'string',
        },
      ];
    });

    sharedMocks.getObject.mockReset().mockImplementation(async (params: { Key: string }) => {
      if (params.Key === 'mappings/mapping-1/config.json') {
        return JSON.stringify({
          rules: [
            {
              target: 'Order.Header.CurrencyCode',
              type: 'string',
              expression: 'source("InvoiceCurrency")',
            },
          ],
        });
      }

      if (params.Key.includes('schema-source-1')) {
        return JSON.stringify(createSourceSchema());
      }

      return JSON.stringify(createTargetSchema());
    });
  });

  it('returns 200 with smart-fix suggestion and validation metadata (AE-01/AE-02)', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        correctedExpression: 'default(source("InvoiceCurrency"), "USD")',
        explanation: 'Uses invoice currency and defaults to USD when missing.',
      },
      promptId: 'smart-fix',
      model: 'openai/gpt-4.1',
    });

    const { handler } = await import('../../../src/lambda/ai/smart-fix.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'mapping-1',
          ruleIndex: 0,
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
          failingExpression: 'source("InvoiceCurrency")',
          diagnostics: [
            { code: 'KEYRA-W001', message: 'Null propagated', severity: 'warning' },
            { code: 'KEYRA-E005', message: 'Type mismatch', severity: 'error' },
          ],
          diagnosticScope: 'all',
          ruleVersion: 12,
          ruleHash: CURRENT_RULE_HASH,
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers?.['x-request-id']).toBe('req-123');

    const parsedBody = JSON.parse(response.body) as {
      success: boolean;
      promptId: string;
      data: {
        originalExpression: string;
        suggestedExpression: string;
        explanation: string;
        validation: { valid: boolean; diagnostics: Array<{ severity: string }> };
        readyToApply: boolean;
        diagnosticsScopeApplied: string;
        context: {
          truncated: boolean;
          totalDiagnosticCount: number;
          includedDiagnosticCount: number;
          byteLength: number;
          approxTokenCount: number;
        };
        applyGuard: { ruleVersion: number; ruleHash: string };
      };
    };

    expect(parsedBody.success).toBe(true);
    expect(parsedBody.promptId).toBe('smart-fix');
    expect(parsedBody.data.originalExpression).toBe('source("InvoiceCurrency")');
    expect(parsedBody.data.suggestedExpression).toContain('default(');
    expect(parsedBody.data.validation.valid).toBe(true);
    expect(parsedBody.data.readyToApply).toBe(true);
    expect(parsedBody.data.diagnosticsScopeApplied).toBe('all');
    expect(parsedBody.data.context).toMatchObject({
      truncated: false,
      totalDiagnosticCount: 2,
      includedDiagnosticCount: 2,
    });
    expect(parsedBody.data.context.byteLength).toBeLessThanOrEqual(64 * 1024);
    expect(parsedBody.data.context.approxTokenCount).toBeLessThanOrEqual(8000);

    expect(parsedBody.data.applyGuard).toMatchObject({
      ruleVersion: 12,
      ruleHash: CURRENT_RULE_HASH,
    });

    expect(invokeAIMock).toHaveBeenCalledTimes(1);
    const invokeArgs = invokeAIMock.mock.calls[0]?.[1] as {
      diagnosticsContext: string;
      diagnosticsScope: string;
      ruleVersion: string;
      ruleHash: string;
    };
    const invokeOptions = invokeAIMock.mock.calls[0]?.[2] as {
      telemetry?: { requestId?: string; correlationId?: string };
    };

    expect(invokeArgs.diagnosticsScope).toBe('all');
    expect(invokeArgs.ruleVersion).toBe('12');
    expect(invokeArgs.ruleHash).toBe(CURRENT_RULE_HASH);
    expect(invokeOptions.telemetry).toEqual({
      requestId: 'req-123',
      correlationId: undefined,
    });
    expect(invokeArgs.diagnosticsContext).toContain('KEYRA-E005');
    expect(invokeArgs.diagnosticsContext.indexOf('KEYRA-E005')).toBeLessThan(
      invokeArgs.diagnosticsContext.indexOf('KEYRA-W001'),
    );
  });

  it('handles OPTIONS preflight with AI CORS headers', async () => {
    const { handler } = await import('../../../src/lambda/ai/smart-fix.js');

    const response = await handler(createEvent(null, { httpMethod: 'OPTIONS' }));

    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS,POST',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
  });

  it('uses single diagnostic scope when explicitly requested', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        correctedExpression: 'default(source("InvoiceCurrency"), "USD")',
      },
      promptId: 'smart-fix',
      model: 'openai/gpt-4.1',
    });

    const { handler } = await import('../../../src/lambda/ai/smart-fix.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'mapping-1',
          ruleIndex: 0,
          targetPath: 'Order.Header.CurrencyCode',
          failingExpression: 'source("InvoiceCurrency")',
          diagnostics: [
            { code: 'KEYRA-W001', message: 'Null propagated', severity: 'warning' },
            { code: 'KEYRA-E005', message: 'Type mismatch', severity: 'error' },
          ],
          diagnosticScope: 'single',
          selectedDiagnosticIndex: 1,
          ruleVersion: 12,
          ruleHash: CURRENT_RULE_HASH,
        }),
      ),
    );

    expect(response.statusCode).toBe(200);

    const invokeArgs = invokeAIMock.mock.calls[0]?.[1] as { diagnosticsContext: string };
    expect(invokeArgs.diagnosticsContext).toContain('KEYRA-E005');
    expect(invokeArgs.diagnosticsContext).not.toContain('KEYRA-W001');

    const parsed = JSON.parse(response.body) as { data: { diagnosticsScopeApplied: string } };
    expect(parsed.data.diagnosticsScopeApplied).toBe('single');
  });

  it('returns VALIDATION_ERROR when required Smart Fix fields are missing', async () => {
    const { handler } = await import('../../../src/lambda/ai/smart-fix.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'mapping-1',
          targetPath: 'Order.Header.CurrencyCode',
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
    expect(parsed.error.message).toContain('Missing or invalid required Smart Fix fields');
    expect(invokeAIMock).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_ERROR when single scope index is invalid', async () => {
    const { handler } = await import('../../../src/lambda/ai/smart-fix.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'mapping-1',
          ruleIndex: 0,
          targetPath: 'Order.Header.CurrencyCode',
          failingExpression: 'source("InvoiceCurrency")',
          diagnostics: [{ code: 'KEYRA-E005', message: 'Type mismatch', severity: 'error' }],
          diagnosticScope: 'single',
          selectedDiagnosticIndex: 3,
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
    expect(parsed.error.message).toContain('selectedDiagnosticIndex');
    expect(invokeAIMock).not.toHaveBeenCalled();
  });

  it('enforces context guardrail and truncates deterministically with high-severity priority', async () => {
    const hugeNodes = Array.from({ length: 10_000 }, (_, idx) => ({
      schemaId: 'schema-source-1',
      path: `Source.Path.${idx.toString().padStart(5, '0')}`,
      fieldName: `Field${idx.toString().padStart(5, '0')}`,
      type: 'string',
      description: 'x'.repeat(120),
    }));

    sharedMocks.query
      .mockResolvedValueOnce(hugeNodes)
      .mockResolvedValueOnce(hugeNodes);

    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        correctedExpression: 'default(source("InvoiceCurrency"), "USD")',
      },
      promptId: 'smart-fix',
      model: 'openai/gpt-4.1',
    });

    const diagnostics = [
      { code: 'KEYRA-W100', message: 'Late warning', severity: 'warning' },
      { code: 'KEYRA-E900', message: 'Newest critical', severity: 'error' },
      { code: 'KEYRA-I100', message: 'Informational', severity: 'info' },
    ];

    const { handler } = await import('../../../src/lambda/ai/smart-fix.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'mapping-1',
          ruleIndex: 0,
          targetPath: 'Order.Header.CurrencyCode',
          failingExpression: 'source("InvoiceCurrency")',
          diagnostics,
          diagnosticScope: 'all',
          ruleVersion: 12,
          ruleHash: CURRENT_RULE_HASH,
        }),
      ),
    );

    expect(response.statusCode).toBe(200);

    const parsed = JSON.parse(response.body) as {
      data: {
        context: {
          truncated: boolean;
          byteLength: number;
          approxTokenCount: number;
          totalDiagnosticCount: number;
          includedDiagnosticCount: number;
        };
      };
    };

    expect(parsed.data.context.truncated).toBe(true);
    expect(parsed.data.context.byteLength).toBeLessThanOrEqual(64 * 1024);
    expect(parsed.data.context.approxTokenCount).toBeLessThanOrEqual(8000);
    expect(parsed.data.context.totalDiagnosticCount).toBe(3);

    const invokeArgs = invokeAIMock.mock.calls[0]?.[1] as { diagnosticsContext: string };
    expect(invokeArgs.diagnosticsContext.indexOf('KEYRA-E900')).toBeLessThan(
      invokeArgs.diagnosticsContext.indexOf('KEYRA-W100'),
    );
  });

  it('returns validation-invalid suggestion payload and marks non-apply-ready (AE-03)', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        correctedExpression: '123',
        explanation: 'Returns static number',
      },
      promptId: 'smart-fix',
      model: 'openai/gpt-4.1',
    });

    const { handler } = await import('../../../src/lambda/ai/smart-fix.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'mapping-1',
          ruleIndex: 0,
          targetPath: 'Order.Header.CurrencyCode',
          targetType: 'string',
          failingExpression: 'source("InvoiceCurrency")',
          diagnostics: [{ code: 'KEYRA-E005', message: 'Type mismatch', severity: 'error' }],
          ruleVersion: 12,
          ruleHash: CURRENT_RULE_HASH,
        }),
      ),
    );

    expect(response.statusCode).toBe(200);

    const parsed = JSON.parse(response.body) as {
      data: {
        validation: {
          valid: boolean;
          diagnostics: Array<{ code: string; severity: string }>;
        };
        readyToApply: boolean;
      };
    };

    expect(parsed.data.validation.valid).toBe(false);
    expect(parsed.data.readyToApply).toBe(false);
    expect(parsed.data.validation.diagnostics.some((d) => d.code === 'KEYRA-E005')).toBe(true);
  });

  it('returns CONFLICT when ruleVersion mismatches current mapping version (AE-06)', async () => {
    const { handler } = await import('../../../src/lambda/ai/smart-fix.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'mapping-1',
          ruleIndex: 0,
          targetPath: 'Order.Header.CurrencyCode',
          failingExpression: 'source("InvoiceCurrency")',
          diagnostics: [{ code: 'KEYRA-E005', message: 'Type mismatch', severity: 'error' }],
          ruleVersion: 11,
          ruleHash: CURRENT_RULE_HASH,
        }),
      ),
    );

    expect(response.statusCode).toBe(409);
    const parsed = JSON.parse(response.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('CONFLICT');
    expect(parsed.error.message).toContain('stale');
    expect(invokeAIMock).not.toHaveBeenCalled();
  });

  it('returns CONFLICT when ruleHash mismatches current rule hash (AE-06)', async () => {
    const { handler } = await import('../../../src/lambda/ai/smart-fix.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'mapping-1',
          ruleIndex: 0,
          targetPath: 'Order.Header.CurrencyCode',
          failingExpression: 'source("InvoiceCurrency")',
          diagnostics: [{ code: 'KEYRA-E005', message: 'Type mismatch', severity: 'error' }],
          ruleVersion: 12,
          ruleHash: 'fnv1a-deadbeef',
        }),
      ),
    );

    expect(response.statusCode).toBe(409);
    const parsed = JSON.parse(response.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('CONFLICT');
    expect(parsed.error.message).toContain('hash mismatch');
    expect(invokeAIMock).not.toHaveBeenCalled();
  });

  it('maps PROMPT_NOT_FOUND to canonical RESOURCE_NOT_FOUND envelope', async () => {
    invokeAIMock.mockResolvedValue({
      success: false,
      error: {
        code: 'PROMPT_NOT_FOUND',
        message: 'No prompt found for promptId: smart-fix',
      },
      promptId: 'smart-fix',
    });

    const { handler } = await import('../../../src/lambda/ai/smart-fix.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'mapping-1',
          ruleIndex: 0,
          targetPath: 'Order.Header.CurrencyCode',
          failingExpression: 'source("InvoiceCurrency")',
          diagnostics: [{ code: 'KEYRA-E005', message: 'Type mismatch', severity: 'error' }],
          ruleVersion: 12,
          ruleHash: CURRENT_RULE_HASH,
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

  it('returns INVALID_MODEL_OUTPUT when AI response has no corrected expression', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        explanation: 'No corrected expression included',
      },
      promptId: 'smart-fix',
      model: 'openai/gpt-4.1',
    });

    const { handler } = await import('../../../src/lambda/ai/smart-fix.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'mapping-1',
          ruleIndex: 0,
          targetPath: 'Order.Header.CurrencyCode',
          failingExpression: 'source("InvoiceCurrency")',
          diagnostics: [{ code: 'KEYRA-E005', message: 'Type mismatch', severity: 'error' }],
          ruleVersion: 12,
          ruleHash: CURRENT_RULE_HASH,
        }),
      ),
    );

    expect(response.statusCode).toBe(500);
    const parsed = JSON.parse(response.body) as { error: { code: string; retryable: boolean } };
    expect(parsed.error.code).toBe('INVALID_MODEL_OUTPUT');
    expect(parsed.error.retryable).toBe(false);
  });

  it('returns INTERNAL_ERROR envelope on unexpected exception (AE-07)', async () => {
    sharedMocks.getItem.mockRejectedValueOnce(new Error('boom'));

    const { handler } = await import('../../../src/lambda/ai/smart-fix.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'mapping-1',
          ruleIndex: 0,
          targetPath: 'Order.Header.CurrencyCode',
          failingExpression: 'source("InvoiceCurrency")',
          diagnostics: [{ code: 'KEYRA-E005', message: 'Type mismatch', severity: 'error' }],
          ruleVersion: 12,
          ruleHash: CURRENT_RULE_HASH,
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
