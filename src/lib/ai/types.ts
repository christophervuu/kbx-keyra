import type { CanonicalPromptId, PromptIdAlias, PromptIdResolution } from './prompt-ids.js';

export interface PromptRecord {
  readonly promptId: CanonicalPromptId;
  readonly version: number;
  readonly status?: 'active' | 'inactive' | 'deprecated';
  readonly selectionSource?: 'active-pointer' | 'latest-active' | 'latest-version';
  readonly selectionEnvironment?: string;
  readonly systemMessage: string;
  readonly userMessageTemplate: string;
  readonly model: string;
  readonly temperature: number;
  readonly responseSchema: string;
  readonly maxTokens: number;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly notes?: string;
}

export interface AIUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export type AIErrorCode =
  | 'PROMPT_NOT_FOUND'
  | 'REGISTRY_ERROR'
  | 'ASSET_NOT_FOUND'
  | 'ASSET_ERROR'
  | 'MODEL_ERROR'
  | 'MODEL_RATE_LIMITED'
  | 'TIMEOUT'
  | 'LIMIT_EXCEEDED'
  | 'PARSE_ERROR'
  | 'INVALID_MODEL_OUTPUT'
  | 'CONFIG_ERROR'
  | 'VALIDATION_ERROR';

export interface AIResult<T> {
  readonly success: true;
  readonly data: T;
  readonly promptId: string;
  readonly model: string;
  readonly usage?: AIUsage;
}

export interface AIError {
  readonly success: false;
  readonly error: {
    readonly code: AIErrorCode;
    readonly message: string;
    readonly details?: unknown;
  };
  readonly promptId: string;
}

export type AIResponse<T> = AIResult<T> | AIError;

export interface PromptRegistryAdapter {
  getLatestPrompt(promptId: string): Promise<PromptRecord | null>;
}

export type { CanonicalPromptId, PromptIdAlias, PromptIdResolution };

export interface DslAssetLoader {
  loadDslReference(): Promise<string>;
}

export interface AIInvocationMetadata {
  readonly feature: string;
  readonly promptId: string;
  readonly promptVersion?: number;
  readonly promptSelectionSource?: PromptRecord['selectionSource'];
  readonly promptSelectionEnvironment?: string;
  readonly tier: 'tier1' | 'tier2';
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
}

export type AIInvocationTelemetryEventType = 'ai.invoke.start' | 'ai.invoke.success' | 'ai.invoke.failure';

export interface AIInvocationTelemetryEvent {
  readonly eventType: AIInvocationTelemetryEventType;
  readonly timestamp: string;
  readonly invocationId: string;
  readonly outcome: 'start' | 'success' | 'failure';
  readonly promptId: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly feature?: string;
  readonly tier?: 'tier1' | 'tier2';
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly durationMs?: number;
  readonly errorCode?: AIErrorCode;
}

export interface AITelemetryLogger {
  emit(event: AIInvocationTelemetryEvent): void;
}

export interface AIInvocationTelemetryContext {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly logger?: AITelemetryLogger;
}

export interface AIInvocationSuccess<T> extends AIResult<T> {
  readonly invocation: AIInvocationMetadata;
}

export interface AIInvocationFailure extends AIError {
  readonly invocation?: AIInvocationMetadata;
}

export type AIInvocationResponse<T> = AIInvocationSuccess<T> | AIInvocationFailure;

export interface InvokeAIOptions {
  readonly promptRegistry?: PromptRegistryAdapter;
  readonly dslAssetLoader?: DslAssetLoader;
  readonly telemetry?: AIInvocationTelemetryContext;
}
