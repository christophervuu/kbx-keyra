import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const AI_HANDLER_PATHS = [
  resolve(TEST_DIR, '../../../src/lambda/ai/explain-rule.ts'),
  resolve(TEST_DIR, '../../../src/lambda/ai/suggest-expression.ts'),
  resolve(TEST_DIR, '../../../src/lambda/ai/auto-map.ts'),
] as const;

describe('aiExplainRule handler', () => {
  beforeEach(() => {
    invokeAIMock.mockReset();
    vi.resetModules();
  });

  it('returns 200 and AI result for valid request', async () => {
    invokeAIMock.mockResolvedValue({
      success: true,
      data: {
        explanation: 'This rule maps the source id to target order id',
      },
      promptId: 'explain-rule',
      model: 'openai/gpt-4.1-mini',
    });

    const { handler } = await import('../../../src/lambda/ai/explain-rule.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetPath: 'Order.Id',
          expression: 'source("id")',
        }),
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    expect(response.headers?.['x-request-id']).toBeTruthy();

    const parsedBody = JSON.parse(response.body) as { success: boolean; data: { explanation: string } };
    expect(parsedBody.success).toBe(true);
    expect(parsedBody.data.explanation).toContain('maps the source id');
    expect(invokeAIMock).toHaveBeenCalledWith('explain-rule', {
      targetPath: 'Order.Id',
      expression: 'source("id")',
    });
  });

  it('returns canonical VALIDATION_ERROR envelope when body is missing', async () => {
    const { handler } = await import('../../../src/lambda/ai/explain-rule.js');

    const response = await handler(createEvent(null));

    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body) as { error: { code: string; retryable: boolean; requestId: string } };
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
    expect(parsed.error.retryable).toBe(false);
    expect(parsed.error.requestId).toBeTruthy();
  });

  it('maps PROMPT_NOT_FOUND to canonical RESOURCE_NOT_FOUND envelope', async () => {
    invokeAIMock.mockResolvedValue({
      success: false,
      error: {
        code: 'PROMPT_NOT_FOUND',
        message: 'No prompt found for promptId: explain-rule',
      },
      promptId: 'explain-rule',
    });

    const { handler } = await import('../../../src/lambda/ai/explain-rule.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetPath: 'Order.Id',
          expression: 'source("id")',
        }),
      ),
    );

    expect(response.statusCode).toBe(404);
    const parsed = JSON.parse(response.body) as {
      error: { code: string; statusCode: number; retryable: boolean; message: string };
    };
    expect(parsed.error).toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      statusCode: 404,
      retryable: false,
    });
    expect(parsed.error.message).toContain('No prompt found');
  });

  it('maps MODEL_RATE_LIMITED to canonical SERVICE_UNAVAILABLE envelope', async () => {
    invokeAIMock.mockResolvedValue({
      success: false,
      error: {
        code: 'MODEL_RATE_LIMITED',
        message: 'Rate limited',
      },
      promptId: 'explain-rule',
    });

    const { handler } = await import('../../../src/lambda/ai/explain-rule.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetPath: 'Order.Id',
          expression: 'source("id")',
        }),
      ),
    );

    expect(response.statusCode).toBe(503);
    const parsed = JSON.parse(response.body) as { error: { code: string; retryable: boolean; statusCode: number } };
    expect(parsed.error).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      retryable: true,
    });
  });

  it('maps unknown AI errors to canonical INTERNAL_ERROR envelope', async () => {
    invokeAIMock.mockResolvedValue({
      success: false,
      error: {
        code: 'MODEL_ERROR',
        message: 'Model unavailable',
      },
      promptId: 'explain-rule',
    });

    const { handler } = await import('../../../src/lambda/ai/explain-rule.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetPath: 'Order.Id',
          expression: 'source("id")',
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

  it('enforces prompt-source policy and thin handler invocation path (AE-04)', async () => {
    for (const filePath of AI_HANDLER_PATHS) {
      const source = await readFile(filePath, 'utf8');

      expect(source).toContain('invokeAI(');
      expect(source).not.toMatch(/\{\{[^}]+\}\}/g);
      expect(source).not.toMatch(/new\s+OpenAI\s*\(/);
      expect(source).not.toMatch(/chat\.completions\.create\s*\(/);
      expect(source).not.toMatch(/systemMessage\s*:/);
      expect(source).not.toMatch(/userMessageTemplate\s*:/);
    }
  });
});
