import {
  ERROR_CODES,
  errorResponse,
  generateRequestId,
  jsonResponse,
  parseBody,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { invokeAI, normalizeAIError } from '../../lib/ai/index.js';

interface ExplainRuleOutput {
  explanation: string;
  confidence?: 'high' | 'medium' | 'low';
  limitations?: string[];
}

const HARD_TOKEN_CAP = 120;
const MAX_SENTENCES = 2;

function hasMeaningfulDslFragment(expression: string): boolean {
  return /[A-Za-z0-9_"()]/.test(expression);
}

function clampExplanation(raw: string): string {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return normalized;
  }

  const sentenceSegments = normalized.split(/(?<=[.!?])\s+/g).filter((segment) => segment.length > 0);
  const sentenceLimited = sentenceSegments.length > 0
    ? sentenceSegments.slice(0, MAX_SENTENCES).join(' ')
    : normalized;

  const tokens = sentenceLimited.split(/\s+/g).filter((token) => token.length > 0);
  if (tokens.length <= HARD_TOKEN_CAP) {
    return sentenceLimited;
  }

  return `${tokens.slice(0, HARD_TOKEN_CAP).join(' ')}…`;
}

function normalizeExplainRuleOutput(data: ExplainRuleOutput): ExplainRuleOutput {
  return {
    explanation: clampExplanation(data.explanation),
    confidence: data.confidence,
    limitations: Array.isArray(data.limitations)
      ? data.limitations.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();
  const requestBody = parseBody(event);

  if (!requestBody) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid request body', 400, false, requestId);
  }

  const targetPath = requestBody.targetPath;
  if (typeof targetPath !== 'string') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required field: targetPath', 400, false, requestId);
  }

  const expression = requestBody.expression;
  if (typeof expression !== 'string') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required field: expression', 400, false, requestId);
  }

  const normalizedExpression = expression.trim();
  if (normalizedExpression.length === 0) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Expression must be a non-empty string',
      400,
      false,
      requestId,
    );
  }

  if (!hasMeaningfulDslFragment(normalizedExpression)) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Expression is completely unparsable: no meaningful DSL fragment found',
      400,
      false,
      requestId,
    );
  }

  try {
    const result = await invokeAI<ExplainRuleOutput>('explain-rule', {
      targetPath,
      expression: normalizedExpression,
    });

    if (result.success) {
      const explanation = normalizeExplainRuleOutput(result.data);

      if (explanation.explanation.length === 0) {
        const normalized = normalizeAIError({
          code: 'INVALID_MODEL_OUTPUT',
          message: 'Model response failed schema validation: explanation must be non-empty',
        });
        return errorResponse(
          normalized.code,
          normalized.message,
          normalized.statusCode,
          normalized.retryable,
          requestId,
        );
      }

      return jsonResponse(200, { ...result, data: explanation }, requestId);
    }

    const normalized = normalizeAIError(result.error);
    return errorResponse(
      normalized.code,
      normalized.message,
      normalized.statusCode,
      normalized.retryable,
      requestId,
    );
  } catch {
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Unexpected error while handling request',
      500,
      true,
      requestId,
    );
  }
}
