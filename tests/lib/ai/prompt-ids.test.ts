import { describe, expect, it } from 'vitest';

import {
  isCanonicalPromptId,
  isSupportedPromptId,
  PROMPT_IDS,
  PROMPT_ID_ALIASES,
  PROMPT_ID_ALIAS_POLICY,
  resolvePromptId,
} from '../../../src/lib/ai/index.js';

describe('prompt id catalog and alias policy', () => {
  it('exports canonical prompt ID catalog for all in-scope AI capabilities', () => {
    expect(PROMPT_IDS).toEqual({
      EXPLAIN_RULE: 'explain-rule',
      NATURAL_LANGUAGE_TO_DSL: 'natural-language-to-dsl',
      SMART_FIX: 'smart-fix',
      AI_VALIDATION: 'ai-validation',
      AUTO_MAP: 'auto-map',
      FIELD_DESCRIPTION: 'field-description',
    });
  });

  it('defines nl-to-rule as a one-release-cycle compatibility alias', () => {
    expect(PROMPT_ID_ALIASES['nl-to-rule']).toBe('natural-language-to-dsl');
    expect(PROMPT_ID_ALIAS_POLICY['nl-to-rule']).toEqual({
      canonicalPromptId: 'natural-language-to-dsl',
      sunset: 'one-release-cycle',
    });
  });

  it('resolves canonical prompt IDs without alias application', () => {
    const resolution = resolvePromptId('explain-rule');

    expect(resolution).toEqual({
      requestedPromptId: 'explain-rule',
      canonicalPromptId: 'explain-rule',
      aliasApplied: false,
    });
  });

  it('resolves nl-to-rule to canonical natural-language-to-dsl with alias metadata', () => {
    const resolution = resolvePromptId('nl-to-rule');

    expect(resolution).toEqual({
      requestedPromptId: 'nl-to-rule',
      canonicalPromptId: 'natural-language-to-dsl',
      aliasApplied: true,
      aliasPromptId: 'nl-to-rule',
    });
  });

  it('returns null for unsupported prompt IDs', () => {
    expect(resolvePromptId('unsupported-prompt-id')).toBeNull();
    expect(isCanonicalPromptId('unsupported-prompt-id')).toBe(false);
    expect(isSupportedPromptId('unsupported-prompt-id')).toBe(false);
  });

  it('recognizes supported canonical and alias IDs', () => {
    expect(isCanonicalPromptId(PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL)).toBe(true);
    expect(isSupportedPromptId(PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL)).toBe(true);
    expect(isSupportedPromptId('nl-to-rule')).toBe(true);
  });
});
