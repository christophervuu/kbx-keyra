import { PROMPT_IDS, type CanonicalPromptId } from './prompt-ids.js';

export interface ResponseSchemaContract {
  readonly promptId: CanonicalPromptId;
  readonly schema: object;
}

export const RESPONSE_SCHEMA_CONTRACTS: Readonly<Record<CanonicalPromptId, ResponseSchemaContract>> = {
  [PROMPT_IDS.EXPLAIN_RULE]: {
    promptId: PROMPT_IDS.EXPLAIN_RULE,
    schema: {
      type: 'object',
      properties: {
        explanation: { type: 'string', minLength: 1, maxLength: 320 },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
        },
        limitations: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 5,
        },
      },
      required: ['explanation'],
      additionalProperties: false,
    },
  },
  [PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL]: {
    promptId: PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL,
    schema: {
      type: 'object',
      properties: {
        expression: { type: 'string' },
        explanation: { type: 'string' },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
        },
      },
      required: ['expression'],
      additionalProperties: false,
    },
  },
  [PROMPT_IDS.SMART_FIX]: {
    promptId: PROMPT_IDS.SMART_FIX,
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  },
  [PROMPT_IDS.AI_VALIDATION]: {
    promptId: PROMPT_IDS.AI_VALIDATION,
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  },
  [PROMPT_IDS.AUTO_MAP]: {
    promptId: PROMPT_IDS.AUTO_MAP,
    schema: {
      type: 'object',
      properties: {
        rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              target: { type: 'string' },
              expression: { type: 'string' },
              explanation: { type: 'string' },
              confidence: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
              },
            },
            required: ['target', 'expression'],
            additionalProperties: true,
          },
        },
      },
      required: ['rules'],
      additionalProperties: false,
    },
  },
  [PROMPT_IDS.FIELD_DESCRIPTION]: {
    promptId: PROMPT_IDS.FIELD_DESCRIPTION,
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export function getResponseSchemaContract(promptId: string): ResponseSchemaContract | null {
  if (!(promptId in RESPONSE_SCHEMA_CONTRACTS)) {
    return null;
  }

  return RESPONSE_SCHEMA_CONTRACTS[promptId as CanonicalPromptId];
}
