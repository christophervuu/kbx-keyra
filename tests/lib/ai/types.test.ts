import { describe, expect, it } from 'vitest';

import type {
  AIError,
  AIErrorCode,
  AIResponse,
  AIResult,
  DslAssetLoader,
  InvokeAIOptions,
  PromptRecord,
  PromptRegistryAdapter,
} from '../../../src/lib/ai/index.js';

describe('lib/ai types exports', () => {
  it('exports PromptRecord and adapter interfaces with assignable contracts', async () => {
    const promptRecord: PromptRecord = {
      promptId: 'explain-rule',
      version: 1,
      systemMessage: 'You are a DSL expert. {{dslReference}}',
      userMessageTemplate: 'Explain {{expression}} for {{targetPath}}',
      model: 'openai/gpt-4.1-mini',
      temperature: 0,
      responseSchema: '{"type":"object"}',
      maxTokens: 400,
      updatedAt: '2026-05-09T00:00:00.000Z',
      updatedBy: 'test-user',
    };

    const promptRegistry: PromptRegistryAdapter = {
      getLatestPrompt: async (promptId: string) => {
        if (promptId === promptRecord.promptId) {
          return promptRecord;
        }

        return null;
      },
    };

    const dslAssetLoader: DslAssetLoader = {
      loadDslReference: async () => '# KeyRa DSL',
    };

    const options: InvokeAIOptions = {
      promptRegistry,
      dslAssetLoader,
    };

    const loaded = await options.promptRegistry?.getLatestPrompt('explain-rule');
    const dsl = await options.dslAssetLoader?.loadDslReference();

    expect(loaded).toEqual(promptRecord);
    expect(dsl).toContain('KeyRa DSL');
  });

  it('exports AIResult, AIError, AIResponse, and AIErrorCode as discriminated contracts', () => {
    const success: AIResult<{ explanation: string }> = {
      success: true,
      data: {
        explanation: 'Maps source id into target Order.Id',
      },
      promptId: 'explain-rule',
      model: 'openai/gpt-4.1-mini',
      usage: {
        promptTokens: 42,
        completionTokens: 21,
        totalTokens: 63,
      },
    };

    const errorCode: AIErrorCode = 'PROMPT_NOT_FOUND';
    const failure: AIError = {
      success: false,
      error: {
        code: errorCode,
        message: 'No prompt found for promptId: explain-rule',
      },
      promptId: 'explain-rule',
    };

    const responses: AIResponse<{ explanation: string }>[] = [success, failure];

    expect(responses[0]?.success).toBe(true);
    if (responses[1] && responses[1].success === false) {
      expect(responses[1].error.code).toBe('PROMPT_NOT_FOUND');
    }
  });
});
