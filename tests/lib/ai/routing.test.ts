import { describe, expect, it } from 'vitest';

import {
  AI_FEATURE_DEFAULTS,
  AI_FEATURE_OVERRIDE_ALLOWLIST,
  AI_TIER_DEFAULTS,
  resolveInvocationProfile,
  type AIFeatureOverride,
  type KnownAIFeature,
  type PromptRecord,
} from '../../../src/lib/ai/index.js';

function createPromptRecord(overrides: Partial<PromptRecord> = {}): PromptRecord {
  return {
    promptId: 'explain-rule',
    version: 1,
    systemMessage: 'sys',
    userMessageTemplate: 'user',
    model: 'openai/gpt-4.1-mini',
    temperature: 0,
    responseSchema: '{"type":"object"}',
    maxTokens: 512,
    updatedAt: '2026-06-02T00:00:00.000Z',
    updatedBy: 'tester',
    ...overrides,
  };
}

describe('ai routing defaults and profile resolution', () => {
  it('encodes Rev 2 tier defaults exactly (AE-10)', () => {
    expect(AI_TIER_DEFAULTS.tier1).toEqual({
      model: 'openai/gpt-4.1-mini',
      timeoutMs: 20_000,
      maxOutputTokens: 1_200,
    });

    expect(AI_TIER_DEFAULTS.tier2).toEqual({
      model: 'openai/gpt-4.1',
      timeoutMs: 45_000,
      maxOutputTokens: 2_500,
    });
  });

  it('resolves known features deterministically from centralized defaults (AE-02)', () => {
    const explain = resolveInvocationProfile('explain-rule');
    expect(explain.feature).toBe('explain-rule');
    expect(explain.tier).toBe(AI_FEATURE_DEFAULTS['explain-rule'].tier);

    const autoMap = resolveInvocationProfile('auto-map');
    expect(autoMap.feature).toBe('auto-map');
    expect(autoMap.tier).toBe(AI_FEATURE_DEFAULTS['auto-map'].tier);
  });

  it('falls back to code defaults when promptId is unknown (AE-09)', () => {
    const profile = resolveInvocationProfile('custom-prompt-id');

    expect(profile.feature).toBe('unclassified');
    expect(profile.tier).toBe('tier1');
    expect(profile.model).toBe('openai/gpt-4.1-mini');
    expect(profile.timeoutMs).toBe(20_000);
    expect(profile.maxOutputTokens).toBe(1_200);
  });

  it('uses allowlisted overrides only for allowlisted features (AE-10)', () => {
    const customAllowlist: Partial<Record<KnownAIFeature, AIFeatureOverride>> = {
      'auto-map': {
        timeoutMs: 30_000,
        maxOutputTokens: 2_000,
      },
      'explain-rule': {
        timeoutMs: 25_000,
        maxOutputTokens: 900,
      },
    };

    const autoMap = resolveInvocationProfile('auto-map', undefined, customAllowlist);
    expect(autoMap.timeoutMs).toBe(30_000);
    expect(autoMap.maxOutputTokens).toBe(2_000);

    const explain = resolveInvocationProfile('explain-rule', undefined, {
      'auto-map': customAllowlist['auto-map'],
    });
    expect(explain.timeoutMs).toBe(20_000);
    expect(explain.maxOutputTokens).toBe(1_200);
  });

  it('ignores invalid allowlisted values and falls back to defaults (AE-09)', () => {
    const invalidAllowlist: Partial<Record<KnownAIFeature, AIFeatureOverride>> = {
      'auto-map': {
        timeoutMs: -1,
        maxOutputTokens: 0,
        model: '',
      },
    };

    const profile = resolveInvocationProfile('auto-map', undefined, invalidAllowlist);

    expect(profile.timeoutMs).toBe(45_000);
    expect(profile.maxOutputTokens).toBe(2_500);
    expect(profile.model).toBe('openai/gpt-4.1');
  });

  it('applies valid registry model/token overrides over code defaults (AE-09)', () => {
    const promptRecord = createPromptRecord({
      model: 'openai/gpt-4.1',
      maxTokens: 1_800,
    });

    const profile = resolveInvocationProfile('explain-rule', promptRecord);

    expect(profile.tier).toBe('tier1');
    expect(profile.model).toBe('openai/gpt-4.1');
    expect(profile.maxOutputTokens).toBe(1_200);
    expect(profile.timeoutMs).toBe(20_000);
  });

  it('falls back when registry override values are invalid (AE-09)', () => {
    const invalidRecord = createPromptRecord({
      model: '   ',
      maxTokens: Number.NaN,
    });

    const profile = resolveInvocationProfile('explain-rule', invalidRecord);

    expect(profile.model).toBe('openai/gpt-4.1-mini');
    expect(profile.maxOutputTokens).toBe(1_200);
  });

  it('exports non-empty allowlist table for centralized override policy', () => {
    expect(Object.keys(AI_FEATURE_OVERRIDE_ALLOWLIST).length).toBeGreaterThan(0);
    expect(AI_FEATURE_OVERRIDE_ALLOWLIST['auto-map']).toBeDefined();
  });
});
