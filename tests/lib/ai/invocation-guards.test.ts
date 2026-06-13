import { describe, expect, it } from 'vitest';

import {
  validateInvokePayload,
  validatePromptContract,
  type AIInvocationProfile,
  type PromptRecord,
} from '../../../src/lib/ai/index.js';

function createProfile(overrides: Partial<AIInvocationProfile> = {}): AIInvocationProfile {
  return {
    feature: 'explain-rule',
    promptId: 'explain-rule',
    tier: 'tier1',
    model: 'openai/gpt-4.1-mini',
    timeoutMs: 20_000,
    maxOutputTokens: 1_200,
    ...overrides,
  };
}

function createPromptRecord(overrides: Partial<PromptRecord> = {}): PromptRecord {
  return {
    promptId: 'explain-rule',
    version: 1,
    systemMessage: 'System: {{dslReference}}',
    userMessageTemplate: 'User: {{expression}}',
    model: 'openai/gpt-4.1-mini',
    temperature: 0,
    responseSchema: '{"type":"object"}',
    maxTokens: 1_200,
    updatedAt: '2026-06-02T00:00:00.000Z',
    updatedBy: 'tester',
    ...overrides,
  };
}

describe('invocation guards', () => {
  it('accepts valid payload and prompt contract', () => {
    const payloadValidation = validateInvokePayload({
      promptId: 'explain-rule',
      variables: {
        targetPath: 'Order.Id',
        expression: 'source("id")',
      },
      profile: createProfile(),
    });

    const promptValidation = validatePromptContract({
      promptId: 'explain-rule',
      promptRecord: createPromptRecord(),
    });

    expect(payloadValidation).toBeNull();
    expect(promptValidation).toBeNull();
  });

  it('rejects empty variable keys and non-string variable values', () => {
    const emptyKeyResult = validateInvokePayload({
      promptId: 'explain-rule',
      variables: {
        '': 'value',
      },
      profile: createProfile(),
    });

    expect(emptyKeyResult?.error.code).toBe('VALIDATION_ERROR');
    expect(emptyKeyResult?.error.message).toContain('empty keys');

    const nonStringResult = validateInvokePayload({
      promptId: 'explain-rule',
      variables: {
        expression: 42 as unknown as string,
      },
      profile: createProfile(),
    });

    expect(nonStringResult?.error.code).toBe('VALIDATION_ERROR');
    expect(nonStringResult?.error.message).toContain("variables['expression'] must be a string");
  });

  it('rejects invalid profile limit values', () => {
    const timeoutResult = validateInvokePayload({
      promptId: 'explain-rule',
      variables: {
        expression: 'source("id")',
      },
      profile: createProfile({ timeoutMs: 0 }),
    });

    expect(timeoutResult?.error.code).toBe('VALIDATION_ERROR');
    expect(timeoutResult?.error.message).toContain('timeoutMs');

    const maxTokenResult = validateInvokePayload({
      promptId: 'explain-rule',
      variables: {
        expression: 'source("id")',
      },
      profile: createProfile({ maxOutputTokens: -1 }),
    });

    expect(maxTokenResult?.error.code).toBe('VALIDATION_ERROR');
    expect(maxTokenResult?.error.message).toContain('maxOutputTokens');
  });

  it('rejects invalid prompt contract values', () => {
    const badTemperature = validatePromptContract({
      promptId: 'explain-rule',
      promptRecord: createPromptRecord({ temperature: 10 }),
    });

    expect(badTemperature?.error.code).toBe('VALIDATION_ERROR');
    expect(badTemperature?.error.message).toContain('temperature');

  });
});
