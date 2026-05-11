import type { AIResponse } from './types.js';
import type { ModelUsage } from './model-client.js';

export function parseModelOutput(
  content: string | null,
  promptId: string,
  model: string,
  usage?: ModelUsage,
): AIResponse<unknown> {
  if (!content || content.trim().length === 0) {
    return {
      success: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'Model response content is empty or null',
      },
      promptId,
    };
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    return {
      success: true,
      data: parsed,
      promptId,
      model,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          }
        : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'PARSE_ERROR',
        message: `Failed to parse model response as JSON: ${error instanceof Error ? error.message : 'Unknown parse error'}`,
      },
      promptId,
    };
  }
}
