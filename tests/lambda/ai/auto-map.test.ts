import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent } from '../../../src/lambda/shared/index.js';

const invokeAIMock = vi.hoisted(() => vi.fn());
const validateMock = vi.hoisted(() => vi.fn());
const schemaRetrieverSearchMock = vi.hoisted(() => vi.fn());
const getSchemaMetadataMock = vi.hoisted(() => vi.fn());
const getItemMock = vi.hoisted(() => vi.fn());
const getObjectMock = vi.hoisted(() => vi.fn());
const sfnSendMock = vi.hoisted(() => vi.fn());

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

vi.mock('../../../src/engine/index.js', () => {
  return {
    validate: validateMock,
  };
});

vi.mock('../../../src/lib/schema/index.js', () => {
  return {
    getSchemaMetadata: getSchemaMetadataMock,
    getSchemaRetriever: () => ({
      searchSchemaNodes: schemaRetrieverSearchMock,
    }),
  };
});

vi.mock('../../../src/lambda/shared/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/lambda/shared/index.js')>(
    '../../../src/lambda/shared/index.js',
  );

  return {
    ...actual,
    getItem: getItemMock,
    getObject: getObjectMock,
  };
});

vi.mock('@aws-sdk/client-sfn', () => {
  class MockStartExecutionCommand {
    readonly input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  class MockSFNClient {
    send = sfnSendMock;
  }

  return {
    SFNClient: MockSFNClient,
    StartExecutionCommand: MockStartExecutionCommand,
  };
});

function createEvent(body: string | null, overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body,
    headers: {},
    ...overrides,
  };
}

describe('aiAutoMap handler', () => {
  beforeEach(() => {
    process.env.MAPPINGS_TABLE = 'KeyRa-Mappings';
    process.env.SCHEMAS_TABLE = 'KeyRa-Schemas';
    process.env.CONTENT_BUCKET = 'keyra-content';
    delete process.env.AUTO_MAP_CHUNK_TARGET;
    delete process.env.AUTO_MAP_MAX_CONCURRENCY;
    delete process.env.AUTO_MAP_STEP_FUNCTIONS_ARN;
    delete process.env.AUTO_MAP_STEP_FUNCTIONS_TARGET_THRESHOLD;
    delete process.env.AUTO_MAP_STEP_FUNCTIONS_CHUNK_THRESHOLD;
    invokeAIMock.mockReset();
    validateMock.mockReset();
    schemaRetrieverSearchMock.mockReset();
    getItemMock.mockReset();
    getObjectMock.mockReset();
    getSchemaMetadataMock.mockReset().mockResolvedValue({ fieldCount: 320 });
    sfnSendMock.mockReset();
    vi.resetModules();

    validateMock.mockReturnValue({
      valid: true,
      diagnostics: [],
    });
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
          suggestionId?: string;
          lifecycleStatus?: string;
          reviewStatus?: string;
          actionEligibility?: {
            canAccept: boolean;
            canBatchAccept: boolean;
            blockReasons: string[];
          };
          validation: {
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
    expect(parsedBody.data.suggestions[0]?.validation).toEqual({
      valid: true,
      diagnostics: [],
    });
    expect(parsedBody.data.suggestions[0]).toMatchObject({
      lifecycleStatus: 'suggested',
      reviewStatus: 'pending',
      actionEligibility: {
        canAccept: true,
        canBatchAccept: true,
        blockReasons: [],
      },
    });
    expect(parsedBody.data.suggestions[0]?.suggestionId).toEqual(expect.any(String));

    expect(invokeAIMock).toHaveBeenCalledWith('auto-map', {
      targetSection:
        '- Order.Header.DocumentType (string)\n- Order.Header.DocumentDate (string)\n- Order.Header.CurrencyCode (string)',
      sourceContext:
        '- InvoiceAmount (number)\n- InvDate (string, MM/DD/YYYY)\n- InvoiceCurrency (string)\n- Header.Currency (string)',
      businessContext: 'AP invoice to ShipmentOrder mapping',
      mode: 'whole',
      chunkId: 'chunk-1',
      chunkCount: '1',
    }, {
      telemetry: {
        requestId: expect.any(String),
        correlationId: undefined,
      },
    });
  });

  it('handles OPTIONS preflight with AI CORS headers', async () => {
    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(createEvent(null, { httpMethod: 'OPTIONS' }));

    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS,POST',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
  });

  it('assembles retrieval-backed source context for section mode (AE-01)', async () => {
    getItemMock.mockResolvedValueOnce({
      mappingId: 'm-1',
      sourceSchemaId: 'schema-source-1',
    });

    schemaRetrieverSearchMock
      .mockResolvedValueOnce([
        {
          path: 'Invoice.DocumentType',
          fieldName: 'DocumentType',
          type: 'string',
          depth: 1,
          isArray: false,
          embeddingText: 'Invoice document type field',
          score: 8,
        },
      ])
      .mockResolvedValueOnce([
        {
          path: 'Invoice.CurrencyCode',
          fieldName: 'CurrencyCode',
          type: 'string',
          depth: 1,
          isArray: false,
          embeddingText: 'Invoice currency code',
          score: 7,
        },
      ])
      .mockResolvedValue([]);

    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        rules: [
          {
            target: 'Order.Header.DocumentType',
            expression: 'source("Invoice.DocumentType")',
            explanation: 'Map document type',
            confidence: 'high',
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
          mappingId: 'm-1',
          mode: 'section',
          sectionPath: 'Order.Header',
          targetSection:
            '- Order.Header.DocumentType (string)\n- Order.Header.CurrencyCode (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(schemaRetrieverSearchMock).toHaveBeenCalled();
    expect(schemaRetrieverSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaId: 'schema-source-1',
        includeContextExpansion: true,
      }),
    );

    const invokeVars = invokeAIMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(invokeVars.mode).toBe('section');
    expect(typeof invokeVars.sourceContext).toBe('string');
    expect((invokeVars.sourceContext as string).length).toBeGreaterThan(0);

    const parsed = JSON.parse(response.body) as {
      data: { retrievalMeta: { mappingId: string; mode: string; retrievalSelectedCount: number } };
    };

    expect(parsed.data.retrievalMeta.mappingId).toBe('m-1');
    expect(parsed.data.retrievalMeta.mode).toBe('section');
    expect(parsed.data.retrievalMeta.retrievalSelectedCount).toBeGreaterThan(0);
  });

  it('returns deterministic no-context success response (AE-06)', async () => {
    getItemMock.mockResolvedValueOnce({
      mappingId: 'm-1',
      sourceSchemaId: 'schema-source-1',
    });
    schemaRetrieverSearchMock.mockResolvedValue([]);

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'm-1',
          mode: 'whole',
          targetSection:
            '- Order.Header.DocumentType (string)\n- Order.Header.CurrencyCode (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(invokeAIMock).not.toHaveBeenCalled();

    const parsed = JSON.parse(response.body) as {
      success: boolean;
      data: {
        rules: unknown[];
        suggestions: unknown[];
        retrievalMeta: { noContext: boolean; noContextReason?: string; mode: string };
      };
    };

    expect(parsed.success).toBe(true);
    expect(parsed.data.rules).toEqual([]);
    expect(parsed.data.suggestions).toEqual([]);
    expect(parsed.data.retrievalMeta.noContext).toBe(true);
    expect(parsed.data.retrievalMeta.mode).toBe('whole');
    expect(parsed.data.retrievalMeta.noContextReason).toContain('No relevant source context');
  });

  it('returns RESOURCE_NOT_FOUND when mapping cannot be resolved for retrieval', async () => {
    getItemMock.mockResolvedValueOnce(null);

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'missing-mapping',
          mode: 'section',
          sectionPath: 'Order.Header',
          targetSection: '- Order.Header.DocumentType (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(404);
    const parsed = JSON.parse(response.body) as { error: { code: string } };
    expect(parsed.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(invokeAIMock).not.toHaveBeenCalled();
  });

  it('chunks broad target scopes and enforces concurrency cap (AE-02)', async () => {
    const lines = Array.from({ length: 320 }, (_, index) => `- Order.Field${index + 1} (string)`);
    const targetSection = lines.join('\n');

    let inFlight = 0;
    let maxInFlight = 0;

    invokeAIMock.mockImplementation(async (_promptId: string, variables: Record<string, unknown>) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;

      return {
        success: true,
        data: {
          rules: [
            {
              target: `Order.Generated.${String(variables.chunkId ?? 'chunk')}`,
              expression: 'source("Invoice.Amount")',
              explanation: 'generated',
              confidence: 'medium',
            },
          ],
        },
        promptId: 'auto-map',
        model: 'openai/gpt-4.1',
      };
    });

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mode: 'whole',
          targetSection,
          sourceContext: '- Invoice.Amount (number)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(invokeAIMock.mock.calls.length).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(4);

    const parsed = JSON.parse(response.body) as {
      data: { retrievalMeta: { chunkCount: number; maxConcurrency: number; chunkTarget: number } };
    };

    expect(parsed.data.retrievalMeta.chunkCount).toBeGreaterThan(1);
    expect(parsed.data.retrievalMeta.maxConcurrency).toBe(4);
    expect(parsed.data.retrievalMeta.chunkTarget).toBeGreaterThanOrEqual(50);
    expect(parsed.data.retrievalMeta.chunkTarget).toBeLessThanOrEqual(100);
  });

  it('routes over-budget whole-mode requests to Step Functions handoff (AE-02)', async () => {
    process.env.AUTO_MAP_STEP_FUNCTIONS_ARN = 'arn:aws:states:us-east-1:111111111111:stateMachine:AutoMap';
    process.env.AUTO_MAP_STEP_FUNCTIONS_TARGET_THRESHOLD = '10';
    process.env.AUTO_MAP_STEP_FUNCTIONS_CHUNK_THRESHOLD = '2';

    sfnSendMock.mockResolvedValue({
      executionArn: 'arn:aws:states:us-east-1:111111111111:execution:AutoMap:exec-1',
    });

    const lines = Array.from({ length: 12 }, (_, index) => `- Order.Field${index + 1} (string)`);
    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mode: 'whole',
          mappingId: 'm-1',
          sourceSchemaId: 'schema-source-1',
          targetSection: lines.join('\n'),
          sourceContext: '- Invoice.Amount (number)',
        }),
      ),
    );

    expect(response.statusCode).toBe(202);
    expect(sfnSendMock).toHaveBeenCalledTimes(1);
    expect(invokeAIMock).not.toHaveBeenCalled();

    const parsed = JSON.parse(response.body) as {
      data: {
        orchestration: { queued: boolean; executionArn: string };
      };
    };

    expect(parsed.data.orchestration.queued).toBe(true);
    expect(parsed.data.orchestration.executionArn).toContain(':execution:');
  });

  it('deduplicates conflicting targets deterministically and records dedup decisions (AE-03)', async () => {
    invokeAIMock
      .mockResolvedValueOnce({
        success: true,
        data: {
          rules: [
            {
              target: 'Order.Header.DocumentType',
              expression: 'source("Invoice.DocType")',
              explanation: 'first candidate',
              confidence: 'high',
            },
          ],
        },
        promptId: 'auto-map',
        model: 'openai/gpt-4.1',
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          rules: [
            {
              target: 'Order.Header.DocumentType',
              expression: 'source("Invoice.DocumentType")',
              explanation: 'second candidate',
              confidence: 'high',
            },
          ],
        },
        promptId: 'auto-map',
        model: 'openai/gpt-4.1',
      });

    validateMock
      .mockReturnValueOnce({
        valid: false,
        diagnostics: [
          {
            code: 'KEYRA-E001',
            severity: 'error',
            message: 'invalid expr',
          },
        ],
      })
      .mockReturnValueOnce({
        valid: true,
        diagnostics: [],
      });

    process.env.AUTO_MAP_CHUNK_TARGET = '50';

    const lines = Array.from({ length: 60 }, (_, index) => `- Order.Header.Field${index + 1} (string)`);
    lines[0] = '- Order.Header.DocumentType (string)';

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mode: 'whole',
          targetSection: lines.join('\n'),
          sourceContext: '- Invoice.DocumentType (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body) as {
      data: {
        rules: Array<{ target: string; expression: string; validation?: { valid: boolean } }>;
        dedupMeta: {
          duplicatesCollapsed: number;
          outputRuleCount: number;
          dedupDecisions: Array<{ target: string; reason: string }>;
        };
      };
    };

    const dedupedRule = parsed.data.rules.find((rule) => rule.target === 'Order.Header.DocumentType');
    expect(dedupedRule?.expression).toBe('source("Invoice.DocumentType")');
    expect(dedupedRule?.validation?.valid).toBe(true);

    expect(parsed.data.dedupMeta.duplicatesCollapsed).toBeGreaterThanOrEqual(1);
    expect(parsed.data.dedupMeta.outputRuleCount).toBe(parsed.data.rules.length);
    expect(parsed.data.dedupMeta.dedupDecisions.some((decision) => decision.target === 'Order.Header.DocumentType')).toBe(true);
    expect(parsed.data.dedupMeta.dedupDecisions.some((decision) => decision.reason === 'validation')).toBe(true);
  });

  it('normalizes invalid expression diagnostics and tracks validation telemetry (AE-04)', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        rules: [
          {
            target: 'Order.Header.DocumentType',
            expression: 'if(source("Invoice.DocumentType"',
            explanation: 'invalid candidate',
            confidence: 'low',
          },
        ],
      },
      promptId: 'auto-map',
      model: 'openai/gpt-4.1',
    });

    validateMock.mockReturnValue({
      valid: false,
      diagnostics: [
        {
          code: 'KEYRA-E001',
          severity: 'error',
          message: 'Unexpected token',
        },
      ],
    });

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetSection: '- Order.Header.DocumentType (string)',
          sourceContext: '- Invoice.DocumentType (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);

    const parsed = JSON.parse(response.body) as {
      data: {
        suggestions: Array<{
          validation: {
            valid: boolean;
            diagnostics: Array<{
              code: string;
              severity: 'error' | 'warning' | 'info';
              message: string;
            }>;
          };
        }>;
        validationMeta: {
          validationPassCount: number;
          validationFailCount: number;
          outcomes: Array<{ target: string | null; valid: boolean; sourceChunkRef: string | null }>;
        };
      };
    };

    expect(parsed.data.suggestions).toHaveLength(1);
    expect(parsed.data.suggestions[0]?.validation.valid).toBe(false);
    expect(parsed.data.suggestions[0]?.validation.diagnostics).toEqual([
      {
        code: 'KEYRA-E001',
        severity: 'error',
        message: 'Unexpected token',
      },
    ]);

    expect(parsed.data.validationMeta.validationPassCount).toBe(0);
    expect(parsed.data.validationMeta.validationFailCount).toBe(1);
    expect(parsed.data.validationMeta.outcomes).toHaveLength(1);
    expect(parsed.data.validationMeta.outcomes[0]).toMatchObject({
      target: 'Order.Header.DocumentType',
      valid: false,
      sourceChunkRef: 'chunk-1',
    });
  });

  it('returns mixed valid/invalid validation outcomes with matching telemetry counts (AE-04)', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        rules: [
          {
            target: 'Order.Header.DocumentType',
            expression: 'source("Invoice.DocumentType")',
            explanation: 'valid candidate',
            confidence: 'high',
          },
          {
            target: 'Order.Header.CurrencyCode',
            expression: 'if(source("Invoice.CurrencyCode"',
            explanation: 'invalid candidate',
            confidence: 'low',
          },
        ],
      },
      promptId: 'auto-map',
      model: 'openai/gpt-4.1',
    });

    validateMock
      .mockReturnValueOnce({
        valid: true,
        diagnostics: [],
      })
      .mockReturnValueOnce({
        valid: false,
        diagnostics: [
          {
            code: 'KEYRA-E001',
            severity: 'error',
            message: 'Unexpected token',
          },
        ],
      });

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetSection:
            '- Order.Header.DocumentType (string)\n- Order.Header.CurrencyCode (string)',
          sourceContext: '- Invoice.DocumentType (string)\n- Invoice.CurrencyCode (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);

    const parsed = JSON.parse(response.body) as {
      data: {
        suggestions: Array<{
          target: string;
          validation: {
            valid: boolean;
            diagnostics: Array<{
              code: string;
              severity: 'error' | 'warning' | 'info';
              message: string;
            }>;
          };
        }>;
        validationMeta: {
          validationPassCount: number;
          validationFailCount: number;
          outcomes: Array<{ target: string | null; valid: boolean; sourceChunkRef: string | null }>;
        };
      };
    };

    expect(parsed.data.suggestions).toHaveLength(2);
    expect(parsed.data.suggestions.find((item) => item.target === 'Order.Header.DocumentType')?.validation).toEqual({
      valid: true,
      diagnostics: [],
    });
    expect(parsed.data.suggestions.find((item) => item.target === 'Order.Header.CurrencyCode')?.validation).toEqual({
      valid: false,
      diagnostics: [
        {
          code: 'KEYRA-E001',
          severity: 'error',
          message: 'Unexpected token',
        },
      ],
    });

    expect(parsed.data.validationMeta.validationPassCount).toBe(1);
    expect(parsed.data.validationMeta.validationFailCount).toBe(1);
    expect(parsed.data.validationMeta.outcomes).toHaveLength(2);
    expect(parsed.data.validationMeta.outcomes.every((outcome) => outcome.sourceChunkRef === 'chunk-1')).toBe(true);
  });

  it('maps warning diagnostics to warning readiness while keeping accept eligibility', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        rules: [
          {
            target: 'Order.Header.DocumentType',
            expression: 'source("Invoice.DocumentType")',
            explanation: 'candidate',
            confidence: 'high',
          },
        ],
      },
      promptId: 'auto-map',
      model: 'openai/gpt-4.1',
    });

    validateMock.mockReturnValue({
      valid: true,
      diagnostics: [
        {
          code: 'KEYRA-W001',
          severity: 'warning',
          message: 'nullable source access',
        },
      ],
    });

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetSection: '- Order.Header.DocumentType (string)',
          sourceContext: '- Invoice.DocumentType (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body) as {
      data: {
        suggestions: Array<{
          validationState: 'ready' | 'warning' | 'invalid';
          actionEligibility: { canAccept: boolean; canBatchAccept: boolean; blockReasons: string[] };
          validation: { valid: boolean; diagnostics: Array<{ code: string; severity: string; message: string }> };
        }>;
      };
    };

    expect(parsed.data.suggestions[0]?.validationState).toBe('warning');
    expect(parsed.data.suggestions[0]?.actionEligibility).toEqual({
      canAccept: true,
      canBatchAccept: true,
      blockReasons: [],
    });
    expect(parsed.data.suggestions[0]?.validation.valid).toBe(true);
  });

  it('validates grouped array candidates as one candidate config', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        rules: [
          {
            target: 'Order.Header.DocumentType',
            expression: 'source("Invoice.DocumentType")',
            explanation: 'header',
            confidence: 'high',
          },
          {
            target: 'Order.Items',
            expression: 'map(source("Invoice.Items"), object("Id", item("Id")))',
            explanation: 'items parent',
            confidence: 'high',
          },
          {
            target: 'Order.Items.Id',
            expression: 'item("Id")',
            explanation: 'items child',
            confidence: 'high',
          },
        ],
      },
      promptId: 'auto-map',
      model: 'openai/gpt-4.1',
    });

    validateMock
      .mockReturnValueOnce({ valid: true, diagnostics: [] })
      .mockReturnValueOnce({ valid: true, diagnostics: [] });

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetSection:
            '- Order.Header.DocumentType (string)\n- Order.Items (array)\n- Order.Items.Id (string)',
          sourceContext: '- Invoice.DocumentType (string)\n- Invoice.Items (array)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(validateMock).toHaveBeenCalledTimes(2);

    const firstCallConfig = validateMock.mock.calls[0]?.[0] as { rules: Array<{ target: string }> };
    const secondCallConfig = validateMock.mock.calls[1]?.[0] as { rules: Array<{ target: string }> };

    expect(firstCallConfig.rules.map((rule) => rule.target)).toEqual(['Order.Header.DocumentType']);
    expect(secondCallConfig.rules.map((rule) => rule.target)).toEqual(['Order.Items', 'Order.Items.Id']);
  });

  it('hydrates candidate validation from base mapping context and enrichment aliases', async () => {
    getItemMock
      .mockResolvedValueOnce({
        mappingId: 'm-1',
        sourceSchemaId: 'src-1',
        targetSchemaId: 'tgt-1',
        configS3Key: 'mappings/m-1/config.json',
      })
      .mockResolvedValueOnce({ schemaId: 'src-1', format: 'json-schema' })
      .mockResolvedValueOnce({ schemaId: 'tgt-1', format: 'json-schema' });

    getObjectMock
      .mockResolvedValueOnce(JSON.stringify({
        name: 'Base',
        version: 3,
        engineVersion: '1.0.0',
        sourceSchemaRef: { schemaId: 'src-1', type: 'local' },
        targetSchemaRef: { schemaId: 'tgt-1', type: 'local' },
        enrichmentSources: [{ alias: 'taxLookup' }],
        config: {
          externalSources: ['legacyAlias'],
          constants: { currency: 'USD' },
          nullSubtrees: [],
          unmappedTargets: 'omit',
        },
        rules: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({ type: 'object', properties: {} }))
      .mockResolvedValueOnce(JSON.stringify({ type: 'object', properties: {} }));

    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        rules: [
          {
            target: 'Order.Header.DocumentType',
            expression: 'external("taxLookup")',
            confidence: 'high',
          },
        ],
      },
      promptId: 'auto-map',
      model: 'openai/gpt-4.1',
    });

    validateMock.mockReturnValue({ valid: true, diagnostics: [] });

    const { handler } = await import('../../../src/lambda/ai/auto-map.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          mappingId: 'm-1',
          targetSection: '- Order.Header.DocumentType (string)',
          sourceContext: '- Invoice.DocumentType (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    const validationConfig = validateMock.mock.calls[0]?.[0] as {
      config: { externalSources: string[] };
      sourceSchemaRef: { schemaId: string };
      targetSchemaRef: { schemaId: string };
    };

    expect(validationConfig.sourceSchemaRef.schemaId).toBe('src-1');
    expect(validationConfig.targetSchemaRef.schemaId).toBe('tgt-1');
    expect(validationConfig.config.externalSources).toEqual(['taxLookup', 'legacyAlias']);
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
      error: 'Missing required field: targetSection, visibleTargetPaths, or sectionPath',
    });
  });

  it('accepts visibleTargetPaths-only scope and echoes scope metadata', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        rules: [
          {
            target: 'Order.Header.DocumentType',
            expression: 'source("Invoice.DocumentType")',
            explanation: 'Map document type',
            confidence: 'high',
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
          projectId: 'p-1',
          mappingId: 'm-1',
          visibleTargetPaths: ['Order.Header.DocumentType', 'Order.Header.CurrencyCode'],
          sourceContext: '- Invoice.DocumentType (string)\n- Invoice.CurrencyCode (string)',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(invokeAIMock).toHaveBeenCalledWith(
      'auto-map',
      expect.objectContaining({
        targetSection:
          '- Order.Header.DocumentType (unknown)\n- Order.Header.CurrencyCode (unknown)',
      }),
      expect.any(Object),
    );

    const parsed = JSON.parse(response.body) as {
      data: {
        scopeMeta: { visibleTargetPaths: string[]; mode: 'section' | 'whole'; sectionPath?: string };
        retrievalMeta: { visibleTargetPaths: string[] };
      };
    };

    expect(parsed.data.scopeMeta).toMatchObject({
      visibleTargetPaths: ['Order.Header.DocumentType', 'Order.Header.CurrencyCode'],
      mode: 'whole',
    });
    expect(parsed.data.retrievalMeta.visibleTargetPaths).toEqual([
      'Order.Header.DocumentType',
      'Order.Header.CurrencyCode',
    ]);
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
      data: {
        rules: Array<{
          validation: {
            valid: boolean;
            diagnostics: Array<{ code: string; severity: 'error' | 'warning' | 'info'; message: string }>;
          };
        }>;
      };
    };

    expect(parsedBody.data.rules[0]?.validation).toEqual({
      valid: false,
      diagnostics: [
        {
          code: 'CANDIDATE_CONFIG_INVALID',
          severity: 'error',
          message: 'Missing required candidate fields: target and expression',
        },
      ],
    });
  });
});
