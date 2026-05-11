import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LocalDslAssetLoader,
  LocalPromptRegistryAdapter,
  type AIResponse,
} from '../../../src/lib/ai/index.js';

const modelInvokeMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/ai/model-client.js', () => {
  return {
    createModelClient: vi.fn(() => ({
      invoke: modelInvokeMock,
    })),
    ModelClient: class {},
  };
});

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

describe('invokeAI integration (local mode adapters + mocked model client)', () => {
  const fixturePromptDir = './tests/lib/ai/fixtures/local-runtime';
  const fixtureDslPath = './tests/lib/ai/fixtures/local-runtime/dsl-reference.md';
  const fixturePromptPath = `${fixturePromptDir}/explain-rule.json`;

  const promptRecord = {
    promptId: 'explain-rule',
    version: 5,
    systemMessage: 'You are DSL expert.\n{{dslReference}}',
    userMessageTemplate: 'Explain target={{targetPath}} expr={{expression}}',
    model: 'openai/gpt-4.1-mini',
    temperature: 0,
    responseSchema: '{"type":"object","properties":{"explanation":{"type":"string"}},"required":["explanation"]}',
    maxTokens: 500,
    updatedAt: '2026-05-11T00:00:00.000Z',
    updatedBy: 'integration-test',
  };

  beforeEach(() => {
    vi.resetModules();
    modelInvokeMock.mockReset();
    setEnv('AI_RUNTIME_MODE', 'aws');
    setEnv('PROMPT_REGISTRY_LOCAL_DIR', undefined);
    setEnv('DSL_ASSET_LOCAL_PATH', undefined);
    setEnv('GITHUB_TOKEN', 'ghp_test_token');
  });

  afterEach(() => {
    resetEnv();
  });

  it('runs full local pipeline and returns parsed AIResult', async () => {
    modelInvokeMock.mockResolvedValue({
      success: true,
      data: {
        content: '{"explanation":"Integration explanation"}',
        usage: {
          prompt_tokens: 22,
          completion_tokens: 8,
          total_tokens: 30,
        },
      },
      promptId: 'explain-rule',
      model: 'openai/gpt-4.1-mini',
    } as AIResponse<unknown>);

    const { invokeAI } = await import('../../../src/lib/ai/invoke-ai.js');

    const promptRegistry = new LocalPromptRegistryAdapter(
      fixturePromptDir,
      async (filePath: string): Promise<string> => {
        if (filePath === fixturePromptPath) {
          return JSON.stringify(promptRecord);
        }

        const notFound = Object.assign(new Error('not found'), {
          code: 'ENOENT',
        });
        throw notFound;
      },
    );

    const dslAssetLoader = new LocalDslAssetLoader(fixtureDslPath, async (filePath: string): Promise<string> => {
      if (filePath === fixtureDslPath) {
        return '# KeyRa DSL\n- source(path)';
      }

      const notFound = Object.assign(new Error('not found'), {
        code: 'ENOENT',
      });
      throw notFound;
    });

    const result = await invokeAI<{ explanation: string }>('explain-rule', {
      targetPath: 'Order.Header.DocumentType',
      expression: 'if(lt(source("InvoiceAmount"), 0), "CreditMemo", "Invoice")',
    }, {
      promptRegistry,
      dslAssetLoader,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        explanation: 'Integration explanation',
      });
      expect(result.promptId).toBe('explain-rule');
      expect(result.model).toBe('openai/gpt-4.1-mini');
      expect(result.usage).toEqual({
        promptTokens: 22,
        completionTokens: 8,
        totalTokens: 30,
      });
    }

    expect(modelInvokeMock).toHaveBeenCalledTimes(1);
    const call = modelInvokeMock.mock.calls[0]?.[0] as {
      promptId: string;
      systemMessage: string;
      userMessage: string;
      model: string;
    };
    expect(call.promptId).toBe('explain-rule');
    expect(call.model).toBe('openai/gpt-4.1-mini');
    expect(call.systemMessage).toContain('# KeyRa DSL');
    expect(call.userMessage).toContain('Order.Header.DocumentType');
    expect(call.userMessage).toContain('InvoiceAmount');
  });
});
