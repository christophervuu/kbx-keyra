import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent } from '../../../src/lambda/ai/explain-rule.js';

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

describe('aiExplainRule handler', () => {
  beforeEach(() => {
    invokeAIMock.mockReset();
    vi.resetModules();
  });

  it('returns 200 and AI result for valid request (AE-11)', async () => {
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
    expect(response.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });

    const parsedBody = JSON.parse(response.body) as { success: boolean; data: { explanation: string } };
    expect(parsedBody.success).toBe(true);
    expect(parsedBody.data.explanation).toContain('maps the source id');
    expect(invokeAIMock).toHaveBeenCalledWith('explain-rule', {
      targetPath: 'Order.Id',
      expression: 'source("id")',
    });
  });

  it('returns 400 when body is missing (AE-12)', async () => {
    const { handler } = await import('../../../src/lambda/ai/explain-rule.js');

    const response = await handler(createEvent(null));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Invalid request body',
    });
  });

  it('returns 400 when body is invalid JSON', async () => {
    const { handler } = await import('../../../src/lambda/ai/explain-rule.js');

    const response = await handler(createEvent('{invalid-json'));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Invalid request body',
    });
  });

  it('returns 400 when targetPath is missing', async () => {
    const { handler } = await import('../../../src/lambda/ai/explain-rule.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          expression: 'source("id")',
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Missing required field: targetPath',
    });
  });

  it('returns 400 when expression is missing', async () => {
    const { handler } = await import('../../../src/lambda/ai/explain-rule.js');

    const response = await handler(
      createEvent(
        JSON.stringify({
          targetPath: 'Order.Id',
        }),
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Missing required field: expression',
    });
  });

  it('maps PROMPT_NOT_FOUND to 404', async () => {
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
  });

  it('maps MODEL_RATE_LIMITED to 429', async () => {
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

    expect(response.statusCode).toBe(429);
  });

  it('maps unknown AI errors to 500', async () => {
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
  });

  it('includes JSON and CORS headers on all responses', async () => {
    const { handler } = await import('../../../src/lambda/ai/explain-rule.js');

    const response = await handler(createEvent(null));

    expect(response.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
  });
});
