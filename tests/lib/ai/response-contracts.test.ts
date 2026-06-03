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
      properties: {
        explanation: {
          type: 'string',
          minLength: 1,
          maxLength: 320,
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
        },
        limitations: {
          type: 'array',
          maxItems: 5,
        },
      },
    });
  });

  it('defines strict structured AI validation report contract', () => {
    const contract = getResponseSchemaContract(PROMPT_IDS.AI_VALIDATION);

    expect(contract).not.toBeNull();
    expect(contract?.schema).toMatchObject({
      type: 'object',
      required: ['summary', 'issues'],
      properties: {
        summary: {
          type: 'object',
          required: ['totalIssues', 'bySeverity', 'byCategory'],
          properties: {
            bySeverity: {
              properties: {
                info: { type: 'number' },
                warning: { type: 'number' },
                error: { type: 'number' },
              },
            },
            byCategory: {
              properties: {
                correctness: { type: 'number' },
                completeness: { type: 'number' },
                maintainability: { type: 'number' },
                risk: { type: 'number' },
              },
            },
          },
        },
        issues: {
          type: 'array',
          items: {
            required: ['id', 'category', 'severity', 'affectedRules', 'description', 'recommendation'],
            properties: {
              category: {
                enum: ['correctness', 'completeness', 'maintainability', 'risk'],
              },
              severity: {
                enum: ['info', 'warning', 'error'],
              },
            },
          },
        },
      },
      additionalProperties: false,
    });
  });

  it('returns null for unsupported prompt IDs', () => {
    expect(getResponseSchemaContract('unknown-prompt')).toBeNull();
  });
});
