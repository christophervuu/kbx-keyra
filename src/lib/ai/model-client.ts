import OpenAI from 'openai';

import type { AIRuntimeConfig } from './config.js';
import type { AIError, AIResponse } from './types.js';

export interface ModelInvocationParams {
  readonly promptId: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly systemMessage: string;
  readonly userMessage: string;
  readonly responseSchema: object;
}

export interface ModelUsage {
  readonly prompt_tokens: number;
  readonly completion_tokens: number;
  readonly total_tokens: number;
}

export interface ModelInvocationOutput {
  readonly content: string | null;
  readonly usage?: ModelUsage;
}

interface ChatCompletionMessage {
  readonly content?: string | null;
}

interface ChatCompletionChoice {
  readonly message?: ChatCompletionMessage;
}

interface ChatCompletionUsage {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly total_tokens?: number;
}

interface ChatCompletionResponse {
  readonly choices?: readonly ChatCompletionChoice[];
  readonly usage?: ChatCompletionUsage;
}

interface OpenAIModelClient {
  readonly chat: {
    readonly completions: {
      create(request: {
        readonly model: string;
        readonly temperature: number;
        readonly max_tokens: number;
        readonly messages: readonly {
          readonly role: 'system' | 'user';
          readonly content: string;
        }[];
        readonly response_format: {
          readonly type: 'json_schema';
          readonly json_schema: {
            readonly name: string;
            readonly strict: true;
            readonly schema: object;
          };
        };
      }): Promise<ChatCompletionResponse>;
    };
  };
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }

  return 'Unknown model invocation error';
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getObjectProperty(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) {
    return undefined;
  }

  if (!(key in source)) {
    return undefined;
  }

  return (source as Record<string, unknown>)[key];
}

function pickString(source: unknown, key: string): string | undefined {
  const value = getObjectProperty(source, key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function pickNumber(source: unknown, key: string): number | undefined {
  const value = getObjectProperty(source, key);
  return typeof value === 'number' ? value : undefined;
}

function normalizeHeaders(headers: unknown): Record<string, string> | undefined {
  if (typeof headers !== 'object' || headers === null) {
    return undefined;
  }

  const asRecord = headers as Record<string, unknown>;
  const keys = ['x-request-id', 'x-ms-request-id', 'x-ms-region', 'content-type'];
  const result: Record<string, string> = {};

  for (const key of keys) {
    const value = asRecord[key];
    if (typeof value === 'string' && value.length > 0) {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function extractProviderErrorDetails(error: unknown): Record<string, unknown> {
  const details: Record<string, unknown> = {
    status: getErrorStatus(error),
    message: getErrorMessage(error),
  };

  const code = pickString(error, 'code');
  if (code !== undefined) {
    details.code = code;
  }

  const type = pickString(error, 'type');
  if (type !== undefined) {
    details.type = type;
  }

  const param = pickString(error, 'param');
  if (param !== undefined) {
    details.param = param;
  }

  const requestId = pickString(error, 'request_id') ?? pickString(error, 'requestId');
  if (requestId !== undefined) {
    details.requestId = requestId;
  }

  const providerError = getObjectProperty(error, 'error');
  if (providerError !== undefined) {
    details.providerError = providerError;
  }

  const response = getObjectProperty(error, 'response');
  const responseHeaders = normalizeHeaders(getObjectProperty(response, 'headers'));
  if (responseHeaders !== undefined) {
    details.responseHeaders = responseHeaders;
  }

  const responseStatus = pickNumber(response, 'status');
  if (responseStatus !== undefined && details.status === undefined) {
    details.status = responseStatus;
  }

  const responseBodyData = getObjectProperty(response, 'data');
  if (responseBodyData !== undefined) {
    details.responseBody = responseBodyData;
  }

  const responseBodyText = getObjectProperty(response, 'body');
  if (typeof responseBodyText === 'string' && responseBodyText.length > 0) {
    details.responseBody = safeJsonParse(responseBodyText);
  }

  return details;
}

function normalizeResponseSchema(schema: object): object {
  const record = schema as Record<string, unknown>;
  const typeValue = record.type;
  const isObjectSchema = typeValue === 'object' || (Array.isArray(typeValue) && typeValue.includes('object'));

  if (!isObjectSchema) {
    return schema;
  }

  if (Object.prototype.hasOwnProperty.call(record, 'additionalProperties')) {
    return schema;
  }

  return {
    ...record,
    additionalProperties: false,
  };
}

export class ModelClient {
  private readonly client: OpenAIModelClient;

  constructor(
    private readonly config: AIRuntimeConfig,
    client?: OpenAIModelClient,
  ) {
    if (client) {
      this.client = client;
      return;
    }

    const sdkClient = new OpenAI({
      baseURL: config.githubModelsEndpoint,
      apiKey: config.githubToken,
      defaultQuery: {
        'api-version': '2024-08-01-preview',
      },
    });
    this.client = sdkClient as unknown as OpenAIModelClient;
  }

  async invoke(params: ModelInvocationParams): Promise<AIResponse<ModelInvocationOutput>> {
    if (!this.config.githubToken) {
      return {
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'Missing required configuration: GITHUB_TOKEN',
        },
        promptId: params.promptId,
      };
    }

    try {
      const normalizedResponseSchema = normalizeResponseSchema(params.responseSchema);

      const response = await this.client.chat.completions.create({
        model: params.model,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        messages: [
          {
            role: 'system',
            content: params.systemMessage,
          },
          {
            role: 'user',
            content: params.userMessage,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: params.promptId,
            strict: true,
            schema: normalizedResponseSchema,
          },
        },
      });

      const content = response.choices?.[0]?.message?.content ?? null;
      const usage = response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens ?? 0,
            completion_tokens: response.usage.completion_tokens ?? 0,
            total_tokens: response.usage.total_tokens ?? 0,
          }
        : undefined;

      return {
        success: true,
        data: {
          content,
          usage,
        },
        promptId: params.promptId,
        model: params.model,
      };
    } catch (error) {
      return this.mapModelError(error, params.promptId);
    }
  }

  private mapModelError(error: unknown, promptId: string): AIError {
    const details = extractProviderErrorDetails(error);
    const status = typeof details.status === 'number' ? details.status : undefined;

    if (status === 429) {
      return {
        success: false,
        error: {
          code: 'MODEL_RATE_LIMITED',
          message: `Model request rate limited: ${details.message}`,
          details,
        },
        promptId,
      };
    }

    if (status === 401 || status === 403) {
      return {
        success: false,
        error: {
          code: 'MODEL_ERROR',
          message: `Model authentication failed: ${details.message}`,
          details,
        },
        promptId,
      };
    }

    if (status === 400) {
      return {
        success: false,
        error: {
          code: 'MODEL_ERROR',
          message: `Model request validation failed: ${details.message}`,
          details,
        },
        promptId,
      };
    }

    return {
      success: false,
      error: {
        code: 'MODEL_ERROR',
        message: `Model invocation failed: ${details.message}`,
        details,
      },
      promptId,
    };
  }
}

export function createModelClient(config: AIRuntimeConfig): ModelClient {
  return new ModelClient(config);
}
