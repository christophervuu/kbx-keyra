import { describe, expect, it } from 'vitest';

import { parseModelOutput } from '../../../src/lib/ai/index.js';

describe('parseModelOutput', () => {
  it('parses valid JSON and returns AIResult with normalized usage', () => {
    const result = parseModelOutput(
      '{"explanation":"Maps source id to target"}',
      'explain-rule',
      'openai/gpt-4.1-mini',
      {
        prompt_tokens: 12,
        completion_tokens: 34,
        total_tokens: 46,
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        explanation: 'Maps source id to target',
      });
      expect(result.promptId).toBe('explain-rule');
      expect(result.model).toBe('openai/gpt-4.1-mini');
      expect(result.usage).toEqual({
        promptTokens: 12,
        completionTokens: 34,
        totalTokens: 46,
      });
    }
  });

  it('returns PARSE_ERROR for invalid JSON', () => {
    const result = parseModelOutput('{not valid json', 'explain-rule', 'openai/gpt-4.1-mini');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PARSE_ERROR');
      expect(result.error.message).toContain('Failed to parse model response as JSON');
    }
  });

  it('returns PARSE_ERROR for null content', () => {
    const result = parseModelOutput(null, 'explain-rule', 'openai/gpt-4.1-mini');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PARSE_ERROR');
      expect(result.error.message).toContain('empty or null');
    }
  });

  it('returns PARSE_ERROR for empty string content', () => {
    const result = parseModelOutput('', 'explain-rule', 'openai/gpt-4.1-mini');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PARSE_ERROR');
      expect(result.error.message).toContain('empty or null');
    }
  });

  it('handles whitespace-only content as PARSE_ERROR', () => {
    const result = parseModelOutput('   \n\t  ', 'explain-rule', 'openai/gpt-4.1-mini');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PARSE_ERROR');
    }
  });

  it('omits usage when usage is undefined', () => {
    const result = parseModelOutput('{"ok":true}', 'explain-rule', 'openai/gpt-4.1-mini');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.usage).toBeUndefined();
    }
  });
});
