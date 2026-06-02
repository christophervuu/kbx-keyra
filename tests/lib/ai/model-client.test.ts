import { describe, expect, it, vi } from 'vitest';

import type { AIRuntimeConfig } from '../../../src/lib/ai/config.js';
import { ModelClient } from '../../../src/lib/ai/index.js';

function createConfig(overrides: Partial<AIRuntimeConfig> = {}): AIRuntimeConfig {
  return {
    mode: 'aws',
    promptRegistryTable: 'integrations-keyra-promptregistry',
    promptRegistryLocalDir: undefined,
    promptRegistryActivePointerEnv: undefined,
    dslAssetBucket: 'integrations-keyra',
    dslAssetKey: 'prompt-assets/dsl/keyra-dsl-reference.md',
    dslAssetLocalPath: undefined,
    githubModelsEndpoint: 'https://models.inference.ai.azure.com',
    githubToken: 'ghp_test_token',
    ...overrides,
  };
}

function createInvocationParams() {
  return {
    promptId: 'explain-rule',
    model: 'openai/gpt-4.1-mini',
    temperature: 0,
    maxTokens: 400,
    timeoutMs: 5_000,
    systemMessage: 'System message with {{dslReference}}',
    userMessage: 'Explain source("id") for Order.Id',
    responseSchema: {
      type: 'object',
      properties: {
        explanation: { type: 'string' },
      },
      required: ['explanation'],
      additionalProperties: false,
    },
  };
}

describe('ModelClient', () => {
  it('returns content and usage on successful invocation', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: '{"explanation":"Valid explanation"}',
          },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    });

    const client = new ModelClient(createConfig(), {
      chat: {
        completions: {
          create,
        },
      },
    });

    const result = await client.invoke(createInvocationParams());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe('{"explanation":"Valid explanation"}');
      expect(result.data.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      });
      expect(result.promptId).toBe('explain-rule');
      expect(result.model).toBe('openai/gpt-4.1-mini');
    }
  });

  it('maps 429 errors to MODEL_RATE_LIMITED', async () => {
    const create = vi.fn().mockRejectedValue({
      status: 429,
      message: 'Too many requests',
    });

    const client = new ModelClient(createConfig(), {
      chat: {
        completions: {
          create,
        },
      },
    });

    const result = await client.invoke(createInvocationParams());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MODEL_RATE_LIMITED');
      expect(result.error.message).toContain('Too many requests');
    }
  });

  it('maps 401 auth errors to MODEL_ERROR with auth context', async () => {
    const create = vi.fn().mockRejectedValue({
      status: 401,
      message: 'Unauthorized',
    });

    const client = new ModelClient(createConfig(), {
      chat: {
        completions: {
          create,
        },
      },
    });

    const result = await client.invoke(createInvocationParams());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MODEL_ERROR');
      expect(result.error.message).toContain('authentication failed');
      expect(result.error.details).toEqual({
        status: 401,
        message: 'Unauthorized',
      });
    }
  });

  it('includes raw provider payload details for 400 validation errors', async () => {
    const create = vi.fn().mockRejectedValue({
      status: 400,
      message: '400 Unknown model: openai/gpt-4.1-mini',
      request_id: 'req_12345',
      code: 'unknown_model',
      type: 'invalid_request_error',
      error: {
        code: 'unknown_model',
        message: 'Unknown model: openai/gpt-4.1-mini',
        type: 'invalid_request_error',
      },
      response: {
        status: 400,
        headers: {
          'x-request-id': 'req_12345',
          'content-type': 'application/json',
          authorization: 'redacted-not-included',
        },
        data: {
          error: {
            code: 'unknown_model',
            message: 'Unknown model: openai/gpt-4.1-mini',
            type: 'invalid_request_error',
          },
        },
      },
    });

    const client = new ModelClient(createConfig(), {
      chat: {
        completions: {
          create,
        },
      },
    });

    const result = await client.invoke(createInvocationParams());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MODEL_ERROR');
      expect(result.error.message).toContain('validation failed');
      expect(result.error.details).toMatchObject({
        status: 400,
        message: '400 Unknown model: openai/gpt-4.1-mini',
        requestId: 'req_12345',
        code: 'unknown_model',
        type: 'invalid_request_error',
        providerError: {
          code: 'unknown_model',
          message: 'Unknown model: openai/gpt-4.1-mini',
          type: 'invalid_request_error',
        },
        responseHeaders: {
          'x-request-id': 'req_12345',
          'content-type': 'application/json',
        },
        responseBody: {
          error: {
            code: 'unknown_model',
            message: 'Unknown model: openai/gpt-4.1-mini',
            type: 'invalid_request_error',
          },
        },
      });
    }
  });

  it('maps network errors to MODEL_ERROR', async () => {
    const create = vi.fn().mockRejectedValue(new Error('fetch failed'));

    const client = new ModelClient(createConfig(), {
      chat: {
        completions: {
          create,
        },
      },
    });

    const result = await client.invoke(createInvocationParams());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MODEL_ERROR');
      expect(result.error.message).toContain('fetch failed');
    }
  });

  it('returns success with null content when model content is null', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
          },
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 2,
        total_tokens: 3,
      },
    });

    const client = new ModelClient(createConfig(), {
      chat: {
        completions: {
          create,
        },
      },
    });

    const result = await client.invoke(createInvocationParams());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBeNull();
      expect(result.data.usage).toEqual({
        prompt_tokens: 1,
        completion_tokens: 2,
        total_tokens: 3,
      });
    }
  });

  it('sends correct system/user messages and structured json_schema request format', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{}' } }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    });

    const client = new ModelClient(createConfig(), {
      chat: {
        completions: {
          create,
        },
      },
    });

    const params = createInvocationParams();
    await client.invoke(params);

    expect(create).toHaveBeenCalledTimes(1);
    const request = create.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      model: params.model,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      messages: [
        { role: 'system', content: params.systemMessage },
        { role: 'user', content: params.userMessage },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: params.promptId,
          strict: true,
          schema: params.responseSchema,
        },
      },
    });
  });

  it('adds additionalProperties: false to root object response schema when omitted', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{}' } }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    });

    const client = new ModelClient(createConfig(), {
      chat: {
        completions: {
          create,
        },
      },
    });

    const params = createInvocationParams();
    await client.invoke(params);

    const request = create.mock.calls[0]?.[0] as {
      response_format: {
        json_schema: {
          schema: Record<string, unknown>;
        };
      };
    };

    expect(request.response_format.json_schema.schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
    });
  });

  it('returns CONFIG_ERROR when GITHUB_TOKEN is missing', async () => {
    const create = vi.fn();
    const client = new ModelClient(createConfig({ githubToken: undefined }), {
      chat: {
        completions: {
          create,
        },
      },
    });

    const result = await client.invoke(createInvocationParams());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CONFIG_ERROR');
      expect(result.error.message).toContain('GITHUB_TOKEN');
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('maps invocation timeout to TIMEOUT', async () => {
    const create = vi.fn().mockImplementation(
      async () =>
        await new Promise(() => {
          // intentionally unresolved to trigger timeout
        }),
    );

    const client = new ModelClient(createConfig(), {
      chat: {
        completions: {
          create,
        },
      },
    });

    const result = await client.invoke({
      ...createInvocationParams(),
      timeoutMs: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TIMEOUT');
      expect(result.error.message).toContain('timed out');
    }
  });
});
