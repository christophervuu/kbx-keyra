import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIResponse, PromptRecord } from '../../../src/lib/ai/index.js';
import { PROMPT_IDS } from '../../../src/lib/ai/prompt-ids.js';

const modelInvokeMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/ai/model-client.js', () => {
  return {
    createModelClient: vi.fn(() => ({
      invoke: modelInvokeMock,
    })),
    ModelClient: class {},
  };
});

function createPromptRecord(overrides: Partial<PromptRecord> = {}): PromptRecord {
  return {
    promptId: 'explain-rule',
    version: 3,
    systemMessage: 'System DSL:\n{{dslReference}}',
    userMessageTemplate: 'Target={{targetPath}} Expr={{expression}}',
    model: 'openai/gpt-4.1-mini',
    temperature: 0,
    responseSchema: '{"type":"object"}',
    maxTokens: 512,
    updatedAt: '2026-05-11T00:00:00.000Z',
    updatedBy: 'tester',
    ...overrides,
  };
}

type TestEnvKey =
  | 'AI_RUNTIME_MODE'
  | 'PROMPT_REGISTRY_TABLE'
  | 'PROMPT_REGISTRY_LOCAL_DIR'
  | 'DSL_ASSET_BUCKET'
  | 'DSL_ASSET_KEY'
  | 'DSL_ASSET_LOCAL_PATH'
  | 'GITHUB_MODELS_ENDPOINT'
  | 'GITHUB_TOKEN';

const ENV_KEYS: readonly TestEnvKey[] = [
  'AI_RUNTIME_MODE',
  'PROMPT_REGISTRY_TABLE',
  'PROMPT_REGISTRY_LOCAL_DIR',
  'DSL_ASSET_BUCKET',
  'DSL_ASSET_KEY',
  'DSL_ASSET_LOCAL_PATH',
  'GITHUB_MODELS_ENDPOINT',
  'GITHUB_TOKEN',
] as const;

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

const ORIGINAL_ENV: Record<TestEnvKey, string | undefined> = {
  AI_RUNTIME_MODE: getEnvStore().AI_RUNTIME_MODE,
  PROMPT_REGISTRY_TABLE: getEnvStore().PROMPT_REGISTRY_TABLE,
  PROMPT_REGISTRY_LOCAL_DIR: getEnvStore().PROMPT_REGISTRY_LOCAL_DIR,
  DSL_ASSET_BUCKET: getEnvStore().DSL_ASSET_BUCKET,
  DSL_ASSET_KEY: getEnvStore().DSL_ASSET_KEY,
  DSL_ASSET_LOCAL_PATH: getEnvStore().DSL_ASSET_LOCAL_PATH,
  GITHUB_MODELS_ENDPOINT: getEnvStore().GITHUB_MODELS_ENDPOINT,
  GITHUB_TOKEN: getEnvStore().GITHUB_TOKEN,
};

function setEnv(key: TestEnvKey, value: string | undefined): void {
  const env = getEnvStore();
  if (value === undefined) {
    delete env[key];
    return;
  }

  env[key] = value;
}

function resetEnv(): void {
  for (const key of ENV_KEYS) {
    setEnv(key, ORIGINAL_ENV[key]);
  }
}

describe('invokeAI', () => {
  beforeEach(() => {
    modelInvokeMock.mockReset();
    setEnv('GITHUB_TOKEN', 'ghp_test_token');
    vi.resetModules();
  });

  afterEach(() => {
    resetEnv();
  });

  it('returns successful parsed AIResult for full pipeline with schema-valid output (AE-01, AE-04)', async () => {
    modelInvokeMock.mockResolvedValue({
      success: true,
      data: {
        content: '{"explanation":"Rule explanation"}',
        usage: {
          prompt_tokens: 11,
          completion_tokens: 7,
          total_tokens: 18,
        },
      },
      promptId: 'explain-rule',
      model: 'openai/gpt-4.1-mini',
    } as AIResponse<unknown>);

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI<{ explanation: string }>(
      'explain-rule',
      { targetPath: 'Order.Id', expression: 'source("id")' },
      {
        promptRegistry: {
          getLatestPrompt: async () => createPromptRecord(),
        },
        dslAssetLoader: {
          loadDslReference: async () => '# KeyRa DSL Reference',
        },
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ explanation: 'Rule explanation' });
      expect(result.promptId).toBe('explain-rule');
      expect(result.model).toBe('openai/gpt-4.1-mini');
      expect(result.usage).toEqual({
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
      });
      expect(result.invocation).toEqual({
        feature: 'explain-rule',
        promptId: 'explain-rule',
        promptVersion: 3,
        promptSelectionSource: undefined,
        promptSelectionEnvironment: undefined,
        tier: 'tier1',
        model: 'openai/gpt-4.1-mini',
        timeoutMs: 20_000,
        maxOutputTokens: 512,
      });
    }

    const modelInvocation = modelInvokeMock.mock.calls[0]?.[0] as { maxTokens: number; model: string };
    expect(modelInvocation.maxTokens).toBe(512);
    expect(modelInvocation.model).toBe('openai/gpt-4.1-mini');
  });

  it('falls back to code-default model/tokens when registry override values are invalid (AE-09)', async () => {
    modelInvokeMock.mockResolvedValue({
      success: true,
      data: {
        content: '{"explanation":"fallback ok"}',
      },
      promptId: 'explain-rule',
      model: 'openai/gpt-4.1-mini',
    } as AIResponse<unknown>);

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI('explain-rule', {}, {
      promptRegistry: {
        getLatestPrompt: async () =>
          createPromptRecord({
            model: '   ',
            maxTokens: Number.NaN,
          }),
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.invocation.model).toBe('openai/gpt-4.1-mini');
      expect(result.invocation.maxOutputTokens).toBe(1_200);
      expect(result.invocation.timeoutMs).toBe(20_000);
    }

    const modelInvocation = modelInvokeMock.mock.calls[0]?.[0] as { maxTokens: number; model: string };
    expect(modelInvocation.maxTokens).toBe(1_200);
    expect(modelInvocation.model).toBe('openai/gpt-4.1-mini');
  });

  it('returns PROMPT_NOT_FOUND when prompt does not exist (AE-02)', async () => {
    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI('missing-prompt', {}, {
      promptRegistry: {
        getLatestPrompt: async () => null,
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PROMPT_NOT_FOUND');
    }
  });

  it('resolves nl-to-rule alias to natural-language-to-dsl before registry lookup (AE-02)', async () => {
    modelInvokeMock.mockResolvedValue({
      success: true,
      data: {
        content: '{"expression":"source(\\"InvoiceCurrency\\")"}',
      },
      promptId: PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL,
      model: 'openai/gpt-4.1-mini',
    } as AIResponse<unknown>);

    const getLatestPrompt = vi.fn().mockResolvedValue(
      createPromptRecord({
        promptId: PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL,
      }),
    );

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI('nl-to-rule', { instruction: 'map field' }, {
      promptRegistry: {
        getLatestPrompt,
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(true);
    expect(getLatestPrompt).toHaveBeenCalledWith(PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL);
    expect(getLatestPrompt).toHaveBeenCalledTimes(1);
  });

  it('falls back to legacy prompt key when canonical natural-language-to-dsl record is missing', async () => {
    modelInvokeMock.mockResolvedValue({
      success: true,
      data: {
        content: '{"expression":"source(\\"InvoiceCurrency\\")"}',
      },
      promptId: PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL,
      model: 'openai/gpt-4.1-mini',
    } as AIResponse<unknown>);

    const getLatestPrompt = vi.fn(async (promptId: string) => {
      if (promptId === PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL) {
        return null;
      }

      if (promptId === 'nl-to-rule') {
        return createPromptRecord({
          promptId: 'nl-to-rule' as PromptRecord['promptId'],
        });
      }

      return null;
    });

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI(PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL, { instruction: 'map field' }, {
      promptRegistry: {
        getLatestPrompt,
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(true);
    expect(getLatestPrompt).toHaveBeenNthCalledWith(1, PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL);
    expect(getLatestPrompt).toHaveBeenNthCalledWith(2, 'nl-to-rule');
  });

  it('returns PROMPT_NOT_FOUND when canonical and legacy alias prompt keys are both missing', async () => {
    const getLatestPrompt = vi.fn(async () => null);

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI(PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL, { instruction: 'map field' }, {
      promptRegistry: {
        getLatestPrompt,
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PROMPT_NOT_FOUND');
      expect(result.error.message).toBe('No prompt found for promptId: natural-language-to-dsl');
    }

    expect(getLatestPrompt).toHaveBeenNthCalledWith(1, PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL);
    expect(getLatestPrompt).toHaveBeenNthCalledWith(2, 'nl-to-rule');
  });

  it('propagates prompt selection metadata into invocation diagnostics context', async () => {
    modelInvokeMock.mockResolvedValue({
      success: true,
      data: {
        content: '{"explanation":"selection metadata"}',
      },
      promptId: 'explain-rule',
      model: 'openai/gpt-4.1-mini',
    } as AIResponse<unknown>);

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI('explain-rule', {}, {
      promptRegistry: {
        getLatestPrompt: async () =>
          createPromptRecord({
            version: 7,
            selectionSource: 'active-pointer',
            selectionEnvironment: 'prod',
          }),
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.invocation.promptVersion).toBe(7);
      expect(result.invocation.promptSelectionSource).toBe('active-pointer');
      expect(result.invocation.promptSelectionEnvironment).toBe('prod');
    }
  });

  it('returns REGISTRY_ERROR when prompt registry throws', async () => {
    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI('explain-rule', {}, {
      promptRegistry: {
        getLatestPrompt: async () => {
          throw new Error('registry unavailable');
        },
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('REGISTRY_ERROR');
      expect(result.error.message).toContain('registry unavailable');
    }
  });

  it('returns ASSET_ERROR when DSL asset loader throws', async () => {
    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI('explain-rule', {}, {
      promptRegistry: {
        getLatestPrompt: async () => createPromptRecord(),
      },
      dslAssetLoader: {
        loadDslReference: async () => {
          throw new Error('s3 timeout');
        },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ASSET_ERROR');
      expect(result.error.message).toContain('s3 timeout');
    }
  });

  it('propagates model client AIError response', async () => {
    modelInvokeMock.mockResolvedValue({
      success: false,
      error: {
        code: 'MODEL_ERROR',
        message: 'model failed',
      },
      promptId: 'explain-rule',
    } as AIResponse<unknown>);

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI('explain-rule', {}, {
      promptRegistry: {
        getLatestPrompt: async () => createPromptRecord(),
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MODEL_ERROR');
      expect(result.error.message).toContain('model failed');
    }
  });

  it('returns INVALID_MODEL_OUTPUT when model content is invalid JSON (AE-05)', async () => {
    modelInvokeMock.mockResolvedValue({
      success: true,
      data: {
        content: '{not-json',
      },
      promptId: 'explain-rule',
      model: 'openai/gpt-4.1-mini',
    } as AIResponse<unknown>);

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI('explain-rule', {}, {
      promptRegistry: {
        getLatestPrompt: async () => createPromptRecord(),
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_MODEL_OUTPUT');
    }
  });

  it('returns INVALID_MODEL_OUTPUT when model payload violates centralized schema contract (AE-04, AE-05)', async () => {
    modelInvokeMock.mockResolvedValue({
      success: true,
      data: {
        content: '{"explanation":42}',
      },
      promptId: 'explain-rule',
      model: 'openai/gpt-4.1-mini',
    } as AIResponse<unknown>);

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI('explain-rule', {}, {
      promptRegistry: {
        getLatestPrompt: async () => createPromptRecord(),
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_MODEL_OUTPUT');
      expect(result.error.message).toContain('schema validation');
    }
  });

  it('returns CONFIG_ERROR when GITHUB_TOKEN is missing', async () => {
    setEnv('GITHUB_TOKEN', undefined);
    modelInvokeMock.mockResolvedValue({
      success: true,
      data: {
        content: '{"ok":true}',
      },
      promptId: 'explain-rule',
      model: 'openai/gpt-4.1-mini',
    } as AIResponse<unknown>);

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI('explain-rule', {}, {
      promptRegistry: {
        getLatestPrompt: async () => createPromptRecord(),
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CONFIG_ERROR');
    }
  });

  it('supports dependency injection and injects dslReference into rendered system message (AE-13)', async () => {
    modelInvokeMock.mockResolvedValue({
      success: true,
      data: {
        content: '{"ok":true}',
      },
      promptId: 'explain-rule',
      model: 'openai/gpt-4.1-mini',
    } as AIResponse<unknown>);

    const promptRegistry = {
      getLatestPrompt: vi.fn(async () =>
        createPromptRecord({
          systemMessage: 'DSL={{dslReference}}',
          userMessageTemplate: 'T={{targetPath}} E={{expression}}',
        }),
      ),
    };
    const dslAssetLoader = {
      loadDslReference: vi.fn(async () => 'DSL_REFERENCE_TEXT'),
    };

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    await invokeAI('explain-rule', { targetPath: 'Order.Id', expression: 'source("id")' }, { promptRegistry, dslAssetLoader });

    expect(promptRegistry.getLatestPrompt).toHaveBeenCalledWith('explain-rule');
    expect(dslAssetLoader.loadDslReference).toHaveBeenCalledTimes(1);
    const call = modelInvokeMock.mock.calls[0]?.[0] as { systemMessage: string; userMessage: string };
    expect(call.systemMessage).toContain('DSL_REFERENCE_TEXT');
    expect(call.userMessage).toContain('Order.Id');
    expect(call.userMessage).toContain('source("id")');
  });

  it('returns VALIDATION_ERROR for non-string variable values', async () => {
    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI('explain-rule', { targetPath: 'Order.Id', expression: 123 as unknown as string }, {
      promptRegistry: {
        getLatestPrompt: async () => createPromptRecord(),
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('must be a string');
    }
  });

  it('returns LIMIT_EXCEEDED when prompt maxTokens exceeds resolved limits', async () => {
    modelInvokeMock.mockResolvedValue({
      success: true,
      data: {
        content: '{"ok":true}',
      },
      promptId: 'explain-rule',
      model: 'openai/gpt-4.1-mini',
    } as AIResponse<unknown>);

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI('explain-rule', { targetPath: 'Order.Id', expression: 'source("id")' }, {
      promptRegistry: {
        getLatestPrompt: async () =>
          createPromptRecord({
            maxTokens: 5000,
          }),
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('LIMIT_EXCEEDED');
      expect(result.error.message).toContain('Prompt maxTokens');
    }

    expect(modelInvokeMock).not.toHaveBeenCalled();
  });

  it('returns LIMIT_EXCEEDED when completion tokens exceed configured maxOutputTokens', async () => {
    modelInvokeMock.mockResolvedValue({
      success: true,
      data: {
        content: '{"explanation":"too long"}',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 1300,
          total_tokens: 1310,
        },
      },
      promptId: 'explain-rule',
      model: 'openai/gpt-4.1-mini',
    } as AIResponse<unknown>);

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI('explain-rule', { targetPath: 'Order.Id', expression: 'source("id")' }, {
      promptRegistry: {
        getLatestPrompt: async () => createPromptRecord(),
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('LIMIT_EXCEEDED');
      expect(result.error.message).toContain('exceeded configured maxOutputTokens');
    }
  });

  it('normalizes provider 413 responses to LIMIT_EXCEEDED', async () => {
    modelInvokeMock.mockResolvedValue({
      success: false,
      error: {
        code: 'MODEL_ERROR',
        message: 'payload too large',
        details: {
          status: 413,
        },
      },
      promptId: 'explain-rule',
    } as AIResponse<unknown>);

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const result = await invokeAI('explain-rule', { targetPath: 'Order.Id', expression: 'source("id")' }, {
      promptRegistry: {
        getLatestPrompt: async () => createPromptRecord(),
      },
      dslAssetLoader: {
        loadDslReference: async () => '# DSL',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('LIMIT_EXCEEDED');
      expect(result.error.message).toContain('exceeded configured token or payload limits');
    }
  });

  it('emits structured telemetry for success and failure with context metadata', async () => {
    const telemetryEvents: unknown[] = [];
    const telemetryLogger = {
      emit(event: unknown) {
        telemetryEvents.push(event);
      },
    };

    modelInvokeMock.mockResolvedValueOnce({
      success: true,
      data: {
        content: '{"explanation":"ok"}',
        usage: {
          prompt_tokens: 8,
          completion_tokens: 6,
          total_tokens: 14,
        },
      },
      promptId: 'explain-rule',
      model: 'openai/gpt-4.1-mini',
    } as AIResponse<unknown>);

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const successResult = await invokeAI(
      'explain-rule',
      { targetPath: 'Order.Id', expression: 'source("id")' },
      {
        promptRegistry: {
          getLatestPrompt: async () => createPromptRecord(),
        },
        dslAssetLoader: {
          loadDslReference: async () => '# DSL',
        },
        telemetry: {
          requestId: 'req-123',
          correlationId: 'corr-abc',
          logger: telemetryLogger,
        },
      },
    );

    expect(successResult.success).toBe(true);

    modelInvokeMock.mockResolvedValueOnce({
      success: false,
      error: {
        code: 'MODEL_ERROR',
        message: 'model failed',
      },
      promptId: 'explain-rule',
    } as AIResponse<unknown>);

    const failureResult = await invokeAI(
      'explain-rule',
      { targetPath: 'Order.Id', expression: 'source("id")' },
      {
        promptRegistry: {
          getLatestPrompt: async () => createPromptRecord(),
        },
        dslAssetLoader: {
          loadDslReference: async () => '# DSL',
        },
        telemetry: {
          requestId: 'req-123',
          correlationId: 'corr-abc',
          logger: telemetryLogger,
        },
      },
    );

    expect(failureResult.success).toBe(false);

    const typedEvents = telemetryEvents as Array<{
      eventType: string;
      outcome: string;
      promptId: string;
      requestId?: string;
      correlationId?: string;
      durationMs?: number;
      errorCode?: string;
      feature?: string;
      tier?: string;
      model?: string;
      timeoutMs?: number;
      maxOutputTokens?: number;
      invocationId: string;
      timestamp: string;
    }>;

    expect(typedEvents.length).toBeGreaterThanOrEqual(4);

    const startEvent = typedEvents.find((event) => event.eventType === 'ai.invoke.start');
    expect(startEvent).toBeDefined();
    expect(startEvent?.promptId).toBe('explain-rule');
    expect(startEvent?.requestId).toBe('req-123');
    expect(startEvent?.correlationId).toBe('corr-abc');

    const successEvent = typedEvents.find((event) => event.eventType === 'ai.invoke.success');
    expect(successEvent).toBeDefined();
    expect(successEvent?.outcome).toBe('success');
    expect(successEvent?.feature).toBe('explain-rule');
    expect(successEvent?.tier).toBe('tier1');
    expect(successEvent?.model).toBe('openai/gpt-4.1-mini');
    expect(typeof successEvent?.durationMs).toBe('number');

    const failureEvent = typedEvents.find((event) => event.eventType === 'ai.invoke.failure');
    expect(failureEvent).toBeDefined();
    expect(failureEvent?.outcome).toBe('failure');
    expect(failureEvent?.errorCode).toBe('MODEL_ERROR');
    expect(failureEvent?.feature).toBe('explain-rule');
    expect(failureEvent?.tier).toBe('tier1');
  });
});
