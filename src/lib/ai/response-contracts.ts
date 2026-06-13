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
      properties: {
        summary: {
          type: 'object',
          properties: {
            totalIssues: { type: 'number' },
            bySeverity: {
              type: 'object',
              properties: {
                info: { type: 'number' },
                warning: { type: 'number' },
                error: { type: 'number' },
              },
              required: ['info', 'warning', 'error'],
              additionalProperties: false,
            },
            byCategory: {
              type: 'object',
              properties: {
                correctness: { type: 'number' },
                completeness: { type: 'number' },
                maintainability: { type: 'number' },
                risk: { type: 'number' },
              },
              required: ['correctness', 'completeness', 'maintainability', 'risk'],
              additionalProperties: false,
            },
          },
          required: ['totalIssues', 'bySeverity', 'byCategory'],
          additionalProperties: false,
        },
        issues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', minLength: 1 },
              category: {
                type: 'string',
                enum: ['correctness', 'completeness', 'maintainability', 'risk'],
              },
              severity: {
                type: 'string',
                enum: ['info', 'warning', 'error'],
              },
              affectedRules: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    ruleIndex: { type: 'number' },
                    targetPath: { type: 'string', minLength: 1 },
                  },
                  additionalProperties: false,
                },
              },
              description: { type: 'string', minLength: 1 },
              recommendation: { type: 'string', minLength: 1 },
            },
            required: ['id', 'category', 'severity', 'affectedRules', 'description', 'recommendation'],
            additionalProperties: false,
          },
        },
        notes: { type: 'string' },
        meta: {
          type: 'object',
          properties: {
            generatedAt: { type: 'string' },
            model: { type: 'string' },
            promptId: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      required: ['summary', 'issues'],
      additionalProperties: false,
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
