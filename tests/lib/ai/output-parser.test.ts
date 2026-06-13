import { describe, expect, it } from 'vitest';

import { parseModelOutput } from '../../../src/lib/ai/index.js';

describe('parseModelOutput', () => {
  it('parses valid JSON and returns AIResult with normalized usage', () => {
    const result = parseModelOutput(
      '{"explanation":"Maps source id to target"}',
      'explain-rule',
      'openai/gpt-4.1-mini',
      {
        type: 'object',
        properties: {
          explanation: {
            type: 'string',
          },
        },
        required: ['explanation'],
        additionalProperties: false,
      },
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
    const result = parseModelOutput(
      '{not valid json',
      'explain-rule',
      'openai/gpt-4.1-mini',
      { type: 'object' },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_MODEL_OUTPUT');
      expect(result.error.message).toContain('Failed to parse model response as JSON');
    }
  });

  it('returns PARSE_ERROR for null content', () => {
    const result = parseModelOutput(null, 'explain-rule', 'openai/gpt-4.1-mini', { type: 'object' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_MODEL_OUTPUT');
      expect(result.error.message).toContain('empty or null');
    }
  });

  it('returns PARSE_ERROR for empty string content', () => {
    const result = parseModelOutput('', 'explain-rule', 'openai/gpt-4.1-mini', { type: 'object' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_MODEL_OUTPUT');
      expect(result.error.message).toContain('empty or null');
    }
  });

  it('handles whitespace-only content as PARSE_ERROR', () => {
    const result = parseModelOutput('   \n\t  ', 'explain-rule', 'openai/gpt-4.1-mini', { type: 'object' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_MODEL_OUTPUT');
    }
  });

  it('omits usage when usage is undefined', () => {
    const result = parseModelOutput(
      '{"ok":true}',
      'explain-rule',
      'openai/gpt-4.1-mini',
      {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
        },
        required: ['ok'],
        additionalProperties: false,
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.usage).toBeUndefined();
    }
  });

  it('returns INVALID_MODEL_OUTPUT when schema validation fails', () => {
    const result = parseModelOutput(
      '{"explanation": 42}',
      'explain-rule',
      'openai/gpt-4.1-mini',
      {
        type: 'object',
        properties: {
          explanation: { type: 'string' },
        },
        required: ['explanation'],
        additionalProperties: false,
      },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_MODEL_OUTPUT');
      expect(result.error.message).toContain('schema validation');
    }
  });

  it('enforces string minLength/maxLength constraints', () => {
    const tooLong = parseModelOutput(
      JSON.stringify({ explanation: 'x'.repeat(321) }),
      'explain-rule',
      'openai/gpt-4.1-mini',
      {
        type: 'object',
        properties: {
          explanation: { type: 'string', minLength: 1, maxLength: 320 },
        },
        required: ['explanation'],
        additionalProperties: false,
      },
    );

    expect(tooLong.success).toBe(false);
    if (!tooLong.success) {
      expect(tooLong.error.code).toBe('INVALID_MODEL_OUTPUT');
      expect(tooLong.error.message).toContain('at most 320');
    }

    const empty = parseModelOutput(
      JSON.stringify({ explanation: '' }),
      'explain-rule',
      'openai/gpt-4.1-mini',
      {
        type: 'object',
        properties: {
          explanation: { type: 'string', minLength: 1, maxLength: 320 },
        },
        required: ['explanation'],
        additionalProperties: false,
      },
    );

    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(empty.error.code).toBe('INVALID_MODEL_OUTPUT');
      expect(empty.error.message).toContain('at least 1');
    }
  });

  it('enforces array item type and maxItems constraints', () => {
    const tooMany = parseModelOutput(
      JSON.stringify({ explanation: 'ok', limitations: ['a', 'b', 'c', 'd', 'e', 'f'] }),
      'explain-rule',
      'openai/gpt-4.1-mini',
      {
        type: 'object',
        properties: {
          explanation: { type: 'string' },
          limitations: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 5,
          },
        },
        required: ['explanation'],
        additionalProperties: false,
      },
    );

    expect(tooMany.success).toBe(false);
    if (!tooMany.success) {
      expect(tooMany.error.code).toBe('INVALID_MODEL_OUTPUT');
      expect(tooMany.error.message).toContain('at most 5');
    }

    const invalidItemType = parseModelOutput(
      JSON.stringify({ explanation: 'ok', limitations: ['a', 123] }),
      'explain-rule',
      'openai/gpt-4.1-mini',
      {
        type: 'object',
        properties: {
          explanation: { type: 'string' },
          limitations: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['explanation'],
        additionalProperties: false,
      },
    );

    expect(invalidItemType.success).toBe(false);
    if (!invalidItemType.success) {
      expect(invalidItemType.error.code).toBe('INVALID_MODEL_OUTPUT');
      expect(invalidItemType.error.message).toContain('item[1] has invalid type');
    }
  });
});
