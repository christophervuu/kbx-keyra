export type AIRuntimeMode = 'local' | 'aws';

export interface AIRuntimeConfig {
  readonly mode: AIRuntimeMode;
  readonly promptRegistryTable: string;
  readonly promptRegistryLocalDir: string | undefined;
  readonly promptRegistryActivePointerEnv: string | undefined;
  readonly dslAssetBucket: string;
  readonly dslAssetKey: string;
  readonly dslAssetLocalPath: string | undefined;
  readonly githubModelsEndpoint: string;
  readonly githubToken: string | undefined;
}

export const DEFAULT_AI_RUNTIME_CONFIG: Omit<AIRuntimeConfig, 'mode' | 'githubToken'> = {
  promptRegistryTable: 'integrations-keyra-promptregistry',
  promptRegistryLocalDir: undefined,
  promptRegistryActivePointerEnv: undefined,
  dslAssetBucket: 'integrations-keyra',
  dslAssetKey: 'prompt-assets/dsl/keyra-dsl-reference.md',
  dslAssetLocalPath: undefined,
  githubModelsEndpoint: 'https://models.github.ai/inference',
};

function parseRuntimeMode(value: string | undefined): AIRuntimeMode {
  return value === 'local' ? 'local' : 'aws';
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

function readOptionalEnv(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function loadConfig(): AIRuntimeConfig {
  const mode = parseRuntimeMode(getEnvValue('AI_RUNTIME_MODE'));

  return {
    mode,
    promptRegistryTable: getEnvValue('PROMPT_REGISTRY_TABLE') ?? DEFAULT_AI_RUNTIME_CONFIG.promptRegistryTable,
    promptRegistryLocalDir:
      readOptionalEnv(getEnvValue('PROMPT_REGISTRY_LOCAL_DIR')) ?? DEFAULT_AI_RUNTIME_CONFIG.promptRegistryLocalDir,
    promptRegistryActivePointerEnv:
      readOptionalEnv(getEnvValue('PROMPT_REGISTRY_ACTIVE_POINTER_ENV')) ??
      DEFAULT_AI_RUNTIME_CONFIG.promptRegistryActivePointerEnv,
    dslAssetBucket: getEnvValue('DSL_ASSET_BUCKET') ?? DEFAULT_AI_RUNTIME_CONFIG.dslAssetBucket,
    dslAssetKey: getEnvValue('DSL_ASSET_KEY') ?? DEFAULT_AI_RUNTIME_CONFIG.dslAssetKey,
    dslAssetLocalPath:
      readOptionalEnv(getEnvValue('DSL_ASSET_LOCAL_PATH')) ?? DEFAULT_AI_RUNTIME_CONFIG.dslAssetLocalPath,
    githubModelsEndpoint: getEnvValue('GITHUB_MODELS_ENDPOINT') ?? DEFAULT_AI_RUNTIME_CONFIG.githubModelsEndpoint,
    githubToken: readOptionalEnv(getEnvValue('GITHUB_TOKEN')),
  };
}
