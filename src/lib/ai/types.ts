export interface PromptRecord {
  readonly promptId: string;
  readonly version: number;
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
  | 'PARSE_ERROR'
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

export interface DslAssetLoader {
  loadDslReference(): Promise<string>;
}

export interface InvokeAIOptions {
  readonly promptRegistry?: PromptRegistryAdapter;
  readonly dslAssetLoader?: DslAssetLoader;
}
