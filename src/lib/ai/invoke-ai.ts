import { loadConfig } from './config.js';
import { createDslAssetLoader } from './dsl-asset-loader.js';
import { createModelClient, type ModelClient } from './model-client.js';
import { parseModelOutput } from './output-parser.js';
import { createPromptRegistryAdapter } from './prompt-registry.js';
import { renderPrompt } from './prompt-renderer.js';
import type {
  AIResponse,
  DslAssetLoader,
  InvokeAIOptions,
  PromptRecord,
  PromptRegistryAdapter,
} from './types.js';
import type { AIRuntimeConfig } from './config.js';

let defaultRegistry: PromptRegistryAdapter | null = null;
let defaultDslLoader: DslAssetLoader | null = null;
let defaultModelClient: ModelClient | null = null;

function getDefaultRegistry(config: AIRuntimeConfig): PromptRegistryAdapter {
  if (!defaultRegistry) {
    defaultRegistry = createPromptRegistryAdapter(config);
  }

  return defaultRegistry;
}

function getDefaultDslLoader(config: AIRuntimeConfig): DslAssetLoader {
  if (!defaultDslLoader) {
    defaultDslLoader = createDslAssetLoader(config);
  }

  return defaultDslLoader;
}

function getDefaultModelClient(config: AIRuntimeConfig): ModelClient {
  if (!defaultModelClient) {
    defaultModelClient = createModelClient(config);
  }

  return defaultModelClient;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function invokeAI<T = unknown>(
  promptId: string,
  variables: Record<string, string>,
  options?: InvokeAIOptions,
): Promise<AIResponse<T>> {
  const config = loadConfig();

  const promptRegistry = options?.promptRegistry ?? getDefaultRegistry(config);
  const dslAssetLoader = options?.dslAssetLoader ?? getDefaultDslLoader(config);
  const modelClient = getDefaultModelClient(config);

  let promptRecord: PromptRecord;
  try {
    const loadedPrompt = await promptRegistry.getLatestPrompt(promptId);
    if (!loadedPrompt) {
      return {
        success: false,
        error: {
          code: 'PROMPT_NOT_FOUND',
          message: `No prompt found for promptId: ${promptId}`,
        },
        promptId,
      };
    }

    promptRecord = loadedPrompt;
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'REGISTRY_ERROR',
        message: `Failed to load prompt from registry: ${toErrorMessage(error)}`,
      },
      promptId,
    };
  }

  let dslReference: string;
  try {
    dslReference = await dslAssetLoader.loadDslReference();
  } catch (error) {
    const message = toErrorMessage(error);
    const code = message.toLowerCase().includes('not found') ? 'ASSET_NOT_FOUND' : 'ASSET_ERROR';

    return {
      success: false,
      error: {
        code,
        message: `Failed to load DSL asset: ${message}`,
      },
      promptId,
    };
  }

  const rendered = renderPrompt(promptRecord, {
    ...variables,
    dslReference,
  });

  if (!config.githubToken) {
    return {
      success: false,
      error: {
        code: 'CONFIG_ERROR',
        message: 'Missing required configuration: GITHUB_TOKEN',
      },
      promptId,
    };
  }

  let responseSchema: object;
  try {
    responseSchema = JSON.parse(promptRecord.responseSchema) as object;
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'REGISTRY_ERROR',
        message: `Prompt response schema is invalid JSON: ${toErrorMessage(error)}`,
      },
      promptId,
    };
  }

  const modelResponse = await modelClient.invoke({
    promptId,
    model: promptRecord.model,
    temperature: promptRecord.temperature,
    maxTokens: promptRecord.maxTokens,
    systemMessage: rendered.systemMessage,
    userMessage: rendered.userMessage,
    responseSchema,
  });

  if (!modelResponse.success) {
    return modelResponse;
  }

  return parseModelOutput(
    modelResponse.data.content,
    promptId,
    promptRecord.model,
    modelResponse.data.usage,
  ) as AIResponse<T>;
}
