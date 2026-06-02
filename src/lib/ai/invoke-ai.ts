import { loadConfig } from './config.js';
import { createDslAssetLoader } from './dsl-asset-loader.js';
import { createModelClient, type ModelClient } from './model-client.js';
import { parseModelOutput } from './output-parser.js';
import { createPromptRegistryAdapter } from './prompt-registry.js';
import { renderPrompt } from './prompt-renderer.js';
import { resolveInvocationProfile } from './routing.js';
import { validateInvokePayload, validatePromptContract } from './invocation-guards.js';
import { createTelemetrySession } from './telemetry.js';
import type {
  AIInvocationFailure,
  AIInvocationResponse,
  AIInvocationSuccess,
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
): Promise<AIInvocationResponse<T>> {
  const telemetrySession = createTelemetrySession(options?.telemetry);
  telemetrySession.emitStart(typeof promptId === 'string' ? promptId : String(promptId));

  const emitAndReturnFailure = (
    failure: AIInvocationFailure,
    invocationOverride = failure.invocation,
  ): AIInvocationFailure => {
    telemetrySession.emitFailure(failure.promptId, failure.error.code, invocationOverride);
    return failure;
  };

  if (typeof promptId !== 'string') {
    const failure: AIInvocationFailure = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'promptId must be a string',
      },
      promptId: String(promptId),
    };

    return emitAndReturnFailure(failure);
  }

  const config = loadConfig();

  const promptRegistry = options?.promptRegistry ?? getDefaultRegistry(config);
  const dslAssetLoader = options?.dslAssetLoader ?? getDefaultDslLoader(config);
  const modelClient = getDefaultModelClient(config);

  if (promptId.trim().length === 0) {
    const failure: AIInvocationFailure = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'promptId must be a non-empty string',
      },
      promptId,
    };

    return emitAndReturnFailure(failure);
  }

  let promptRecord: PromptRecord;
  try {
    const loadedPrompt = await promptRegistry.getLatestPrompt(promptId);
    if (!loadedPrompt) {
      const failure: AIInvocationFailure = {
        success: false,
        error: {
          code: 'PROMPT_NOT_FOUND',
          message: `No prompt found for promptId: ${promptId}`,
        },
        promptId,
      };

      return emitAndReturnFailure(failure);
    }

    promptRecord = loadedPrompt;
  } catch (error) {
    const failure: AIInvocationFailure = {
      success: false,
      error: {
        code: 'REGISTRY_ERROR',
        message: `Failed to load prompt from registry: ${toErrorMessage(error)}`,
      },
      promptId,
    };

    return emitAndReturnFailure(failure);
  }

  const invocation = resolveInvocationProfile(promptId, promptRecord);

  if (Number.isFinite(promptRecord.maxTokens) && promptRecord.maxTokens > invocation.maxOutputTokens) {
    const failure: AIInvocationFailure = {
      success: false,
      error: {
        code: 'LIMIT_EXCEEDED',
        message:
          `Prompt maxTokens (${promptRecord.maxTokens}) exceeds resolved maxOutputTokens ` +
          `(${invocation.maxOutputTokens})`,
        details: {
          promptMaxTokens: promptRecord.maxTokens,
          maxOutputTokens: invocation.maxOutputTokens,
        },
      },
      promptId,
      invocation,
    };

    return emitAndReturnFailure(failure, invocation);
  }

  const payloadValidationError = validateInvokePayload({
    promptId,
    variables,
    profile: invocation,
  });

  if (payloadValidationError) {
    const failure: AIInvocationFailure = {
      ...payloadValidationError,
      invocation,
    };

    return emitAndReturnFailure(failure, invocation);
  }

  const promptValidationError = validatePromptContract({
    promptId,
    promptRecord,
  });

  if (promptValidationError) {
    const failure: AIInvocationFailure = {
      ...promptValidationError,
      invocation,
    };

    return emitAndReturnFailure(failure, invocation);
  }

  let dslReference: string;
  try {
    dslReference = await dslAssetLoader.loadDslReference();
  } catch (error) {
    const message = toErrorMessage(error);
    const code = message.toLowerCase().includes('not found') ? 'ASSET_NOT_FOUND' : 'ASSET_ERROR';

    const failure: AIInvocationFailure = {
      success: false,
      error: {
        code,
        message: `Failed to load DSL asset: ${message}`,
      },
      promptId,
      invocation,
    };

    return emitAndReturnFailure(failure, invocation);
  }

  const rendered = renderPrompt(promptRecord, {
    ...variables,
    dslReference,
  });

  if (!config.githubToken) {
    const failure: AIInvocationFailure = {
      success: false,
      error: {
        code: 'CONFIG_ERROR',
        message: 'Missing required configuration: GITHUB_TOKEN',
      },
      promptId,
      invocation,
    };

    return emitAndReturnFailure(failure, invocation);
  }

  let responseSchema: object;
  try {
    responseSchema = JSON.parse(promptRecord.responseSchema) as object;
  } catch (error) {
    const failure: AIInvocationFailure = {
      success: false,
      error: {
        code: 'REGISTRY_ERROR',
        message: `Prompt response schema is invalid JSON: ${toErrorMessage(error)}`,
      },
      promptId,
      invocation,
    };

    return emitAndReturnFailure(failure, invocation);
  }

  const modelResponse = await modelClient.invoke({
    promptId,
    model: invocation.model,
    temperature: promptRecord.temperature,
    maxTokens: invocation.maxOutputTokens,
    timeoutMs: invocation.timeoutMs,
    systemMessage: rendered.systemMessage,
    userMessage: rendered.userMessage,
    responseSchema,
  });

  if (!modelResponse.success) {
    if (modelResponse.error.code === 'TIMEOUT') {
      const failure: AIInvocationFailure = {
        ...modelResponse,
        invocation,
      };

      return emitAndReturnFailure(failure, invocation);
    }

    if (
      modelResponse.error.code === 'MODEL_ERROR' &&
      typeof modelResponse.error.details === 'object' &&
      modelResponse.error.details !== null &&
      'status' in modelResponse.error.details
    ) {
      const status = (modelResponse.error.details as { status?: unknown }).status;
      if (status === 413) {
        const failure: AIInvocationFailure = {
          success: false,
          error: {
            code: 'LIMIT_EXCEEDED',
            message: 'Model invocation exceeded configured token or payload limits',
            details: modelResponse.error.details,
          },
          promptId,
          invocation,
        };

        return emitAndReturnFailure(failure, invocation);
      }
    }

    const failure: AIInvocationFailure = {
      ...modelResponse,
      invocation,
    };

    return emitAndReturnFailure(failure, invocation);
  }

  if (
    modelResponse.data.usage?.completion_tokens !== undefined &&
    modelResponse.data.usage.completion_tokens > invocation.maxOutputTokens
  ) {
    const failure: AIInvocationFailure = {
      success: false,
      error: {
        code: 'LIMIT_EXCEEDED',
        message:
          `Model completion tokens (${modelResponse.data.usage.completion_tokens}) exceeded configured maxOutputTokens ` +
          `(${invocation.maxOutputTokens})`,
        details: {
          completionTokens: modelResponse.data.usage.completion_tokens,
          maxOutputTokens: invocation.maxOutputTokens,
        },
      },
      promptId,
      invocation,
    };

    return emitAndReturnFailure(failure, invocation);
  }

  const parsed = parseModelOutput(
    modelResponse.data.content,
    promptId,
    invocation.model,
    modelResponse.data.usage,
  ) as AIResponse<T>;

  if (!parsed.success) {
    const failure: AIInvocationFailure = {
      ...parsed,
      invocation,
    };

    return emitAndReturnFailure(failure, invocation);
  }

  const success: AIInvocationSuccess<T> = {
    ...parsed,
    invocation,
  };

  telemetrySession.emitSuccess(promptId, invocation);
  return success;
}
