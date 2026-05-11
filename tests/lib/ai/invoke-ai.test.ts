import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIResponse, PromptRecord } from '../../../src/lib/ai/index.js';

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

  it('returns successful parsed AIResult for full pipeline (AE-01)', async () => {
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
    }
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

  it('returns PARSE_ERROR when model content is invalid JSON', async () => {
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
      expect(result.error.code).toBe('PARSE_ERROR');
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
});
