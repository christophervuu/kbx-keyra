import { describe, expect, it } from 'vitest';

import {
  getResponseSchemaContract,
  PROMPT_IDS,
  RESPONSE_SCHEMA_CONTRACTS,
} from '../../../src/lib/ai/index.js';

describe('response schema contracts', () => {
  it('exposes centralized contracts for all in-scope prompt IDs', () => {
    expect(Object.keys(RESPONSE_SCHEMA_CONTRACTS).sort()).toEqual([
      PROMPT_IDS.AI_VALIDATION,
      PROMPT_IDS.AUTO_MAP,
      PROMPT_IDS.EXPLAIN_RULE,
      PROMPT_IDS.FIELD_DESCRIPTION,
      PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL,
      PROMPT_IDS.SMART_FIX,
    ].sort());
  });

  it('returns contract for known prompt IDs', () => {
    const explainContract = getResponseSchemaContract(PROMPT_IDS.EXPLAIN_RULE);

    expect(explainContract).not.toBeNull();
    expect(explainContract?.promptId).toBe(PROMPT_IDS.EXPLAIN_RULE);
    expect(explainContract?.schema).toMatchObject({
      type: 'object',
      required: ['explanation'],
    });
  });

  it('returns null for unsupported prompt IDs', () => {
    expect(getResponseSchemaContract('unknown-prompt')).toBeNull();
  });
});
