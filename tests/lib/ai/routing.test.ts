import { describe, expect, it } from 'vitest';

import {
  AI_FEATURE_DEFAULTS,
  AI_FEATURE_OVERRIDE_ALLOWLIST,
  PROMPT_IDS,
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
    const explain = resolveInvocationProfile(PROMPT_IDS.EXPLAIN_RULE);
    expect(explain.feature).toBe(PROMPT_IDS.EXPLAIN_RULE);
    expect(explain.tier).toBe(AI_FEATURE_DEFAULTS[PROMPT_IDS.EXPLAIN_RULE].tier);

    const nlToDsl = resolveInvocationProfile(PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL);
    expect(nlToDsl.feature).toBe(PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL);
    expect(nlToDsl.tier).toBe(AI_FEATURE_DEFAULTS[PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL].tier);

    const autoMap = resolveInvocationProfile(PROMPT_IDS.AUTO_MAP);
    expect(autoMap.feature).toBe(PROMPT_IDS.AUTO_MAP);
    expect(autoMap.tier).toBe(AI_FEATURE_DEFAULTS[PROMPT_IDS.AUTO_MAP].tier);
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
      [PROMPT_IDS.AUTO_MAP]: {
        timeoutMs: 30_000,
        maxOutputTokens: 2_000,
      },
      [PROMPT_IDS.EXPLAIN_RULE]: {
        timeoutMs: 25_000,
        maxOutputTokens: 900,
      },
    };

    const autoMap = resolveInvocationProfile(PROMPT_IDS.AUTO_MAP, undefined, customAllowlist);
    expect(autoMap.timeoutMs).toBe(30_000);
    expect(autoMap.maxOutputTokens).toBe(2_000);

    const explain = resolveInvocationProfile(PROMPT_IDS.EXPLAIN_RULE, undefined, {
      [PROMPT_IDS.AUTO_MAP]: customAllowlist[PROMPT_IDS.AUTO_MAP],
    });
    expect(explain.timeoutMs).toBe(20_000);
    expect(explain.maxOutputTokens).toBe(1_200);
  });

  it('ignores invalid allowlisted values and falls back to defaults (AE-09)', () => {
    const invalidAllowlist: Partial<Record<KnownAIFeature, AIFeatureOverride>> = {
      [PROMPT_IDS.AUTO_MAP]: {
        timeoutMs: -1,
        maxOutputTokens: 0,
        model: '',
      },
    };

    const profile = resolveInvocationProfile(PROMPT_IDS.AUTO_MAP, undefined, invalidAllowlist);

    expect(profile.timeoutMs).toBe(45_000);
    expect(profile.maxOutputTokens).toBe(2_500);
    expect(profile.model).toBe('openai/gpt-4.1');
  });

  it('applies valid registry model/token overrides over code defaults (AE-09)', () => {
    const promptRecord = createPromptRecord({
      model: 'openai/gpt-4.1',
      maxTokens: 1_800,
    });

    const profile = resolveInvocationProfile(PROMPT_IDS.EXPLAIN_RULE, promptRecord);

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

    const profile = resolveInvocationProfile(PROMPT_IDS.EXPLAIN_RULE, invalidRecord);

    expect(profile.model).toBe('openai/gpt-4.1-mini');
    expect(profile.maxOutputTokens).toBe(1_200);
  });

  it('exports non-empty allowlist table for centralized override policy', () => {
    expect(Object.keys(AI_FEATURE_OVERRIDE_ALLOWLIST).length).toBeGreaterThan(0);
    expect(AI_FEATURE_OVERRIDE_ALLOWLIST[PROMPT_IDS.AUTO_MAP]).toBeDefined();
  });
});
