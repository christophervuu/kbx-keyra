import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig, type AIRuntimeConfig } from '../../../src/lib/ai/index.js';

const AI_ENV_KEYS = [
  'AI_RUNTIME_MODE',
  'PROMPT_REGISTRY_TABLE',
  'PROMPT_REGISTRY_LOCAL_DIR',
  'DSL_ASSET_BUCKET',
  'DSL_ASSET_KEY',
  'DSL_ASSET_LOCAL_PATH',
  'GITHUB_MODELS_ENDPOINT',
  'GITHUB_TOKEN',
] as const;

type AIEnvKey = (typeof AI_ENV_KEYS)[number];

type EnvStore = Record<string, string | undefined>;

function getTestEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

const ORIGINAL_ENV: Record<AIEnvKey, string | undefined> = {
  AI_RUNTIME_MODE: getTestEnvStore().AI_RUNTIME_MODE,
  PROMPT_REGISTRY_TABLE: getTestEnvStore().PROMPT_REGISTRY_TABLE,
  PROMPT_REGISTRY_LOCAL_DIR: getTestEnvStore().PROMPT_REGISTRY_LOCAL_DIR,
  DSL_ASSET_BUCKET: getTestEnvStore().DSL_ASSET_BUCKET,
  DSL_ASSET_KEY: getTestEnvStore().DSL_ASSET_KEY,
  DSL_ASSET_LOCAL_PATH: getTestEnvStore().DSL_ASSET_LOCAL_PATH,
  GITHUB_MODELS_ENDPOINT: getTestEnvStore().GITHUB_MODELS_ENDPOINT,
  GITHUB_TOKEN: getTestEnvStore().GITHUB_TOKEN,
};

function setEnv(key: AIEnvKey, value: string | undefined): void {
  const envStore = getTestEnvStore();

  if (value === undefined) {
    delete envStore[key];
    return;
  }

  envStore[key] = value;
}

function resetAIEnv(): void {
  for (const key of AI_ENV_KEYS) {
    setEnv(key, ORIGINAL_ENV[key]);
  }
}

function clearAIEnv(): void {
  const envStore = getTestEnvStore();

  for (const key of AI_ENV_KEYS) {
    delete envStore[key];
  }
}

describe('lib/ai loadConfig', () => {
  afterEach(() => {
    resetAIEnv();
  });

  it('returns typed defaults when environment variables are unset', () => {
    clearAIEnv();

    const config: AIRuntimeConfig = loadConfig();

    expect(config).toEqual({
      mode: 'aws',
      promptRegistryTable: 'integrations-keyra-promptregistry',
      promptRegistryLocalDir: undefined,
      dslAssetBucket: 'integrations-keyra',
      dslAssetKey: 'prompt-assets/dsl/keyra-dsl-reference.md',
      dslAssetLocalPath: undefined,
      githubModelsEndpoint: 'https://models.inference.ai.azure.com',
      githubToken: undefined,
    });
  });

  it('uses environment variable overrides when provided', () => {
    clearAIEnv();
    setEnv('PROMPT_REGISTRY_TABLE', 'custom-prompt-table');
    setEnv('PROMPT_REGISTRY_LOCAL_DIR', './test-prompts');
    setEnv('DSL_ASSET_BUCKET', 'custom-dsl-bucket');
    setEnv('DSL_ASSET_KEY', 'prompt-assets/dsl/custom-reference.md');
    setEnv('DSL_ASSET_LOCAL_PATH', './test-assets/dsl-reference.md');
    setEnv('GITHUB_MODELS_ENDPOINT', 'https://example.models.endpoint');
    setEnv('GITHUB_TOKEN', 'ghp_test_token');

    const config = loadConfig();

    expect(config.promptRegistryTable).toBe('custom-prompt-table');
    expect(config.promptRegistryLocalDir).toBe('./test-prompts');
    expect(config.dslAssetBucket).toBe('custom-dsl-bucket');
    expect(config.dslAssetKey).toBe('prompt-assets/dsl/custom-reference.md');
    expect(config.dslAssetLocalPath).toBe('./test-assets/dsl-reference.md');
    expect(config.githubModelsEndpoint).toBe('https://example.models.endpoint');
    expect(config.githubToken).toBe('ghp_test_token');
  });

  it('parses AI_RUNTIME_MODE as local or aws with aws fallback', () => {
    clearAIEnv();

    setEnv('AI_RUNTIME_MODE', 'local');
    expect(loadConfig().mode).toBe('local');

    setEnv('AI_RUNTIME_MODE', 'aws');
    expect(loadConfig().mode).toBe('aws');

    setEnv('AI_RUNTIME_MODE', 'invalid-mode');
    expect(loadConfig().mode).toBe('aws');

    setEnv('AI_RUNTIME_MODE', undefined);
    expect(loadConfig().mode).toBe('aws');
  });

  it('normalizes optional path/token values by trimming whitespace', () => {
    clearAIEnv();
    setEnv('PROMPT_REGISTRY_LOCAL_DIR', '   ');
    setEnv('DSL_ASSET_LOCAL_PATH', '\n\t   ');
    setEnv('GITHUB_TOKEN', '   ghp_value   ');

    const config = loadConfig();

    expect(config.promptRegistryLocalDir).toBeUndefined();
    expect(config.dslAssetLocalPath).toBeUndefined();
    expect(config.githubToken).toBe('ghp_value');
  });
});
