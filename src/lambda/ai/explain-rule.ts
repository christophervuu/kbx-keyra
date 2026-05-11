import { invokeAI, type AIErrorCode } from '../../lib/ai/index.js';

export interface APIGatewayProxyEvent {
  readonly body: string | null;
  readonly headers?: Record<string, string | undefined>;
}

export interface APIGatewayProxyResult {
  readonly statusCode: number;
  readonly headers?: Record<string, string>;
  readonly body: string;
}

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function jsonResponse(statusCode: number, payload: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function statusCodeForAIError(code: AIErrorCode): number {
  switch (code) {
    case 'PROMPT_NOT_FOUND':
      return 404;
    case 'MODEL_RATE_LIMITED':
      return 429;
    case 'VALIDATION_ERROR':
      return 400;
    default:
      return 500;
  }
}

function parseRequestBody(body: string | null): Record<string, unknown> | null {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestBody = parseRequestBody(event.body);
  if (!requestBody) {
    return jsonResponse(400, {
      error: 'Invalid request body',
    });
  }

  const targetPath = requestBody.targetPath;
  if (typeof targetPath !== 'string') {
    return jsonResponse(400, {
      error: 'Missing required field: targetPath',
    });
  }

  const expression = requestBody.expression;
  if (typeof expression !== 'string') {
    return jsonResponse(400, {
      error: 'Missing required field: expression',
    });
  }

  try {
    const result = await invokeAI('explain-rule', {
      targetPath,
      expression,
    });

    if (result.success) {
      return jsonResponse(200, result);
    }

    return jsonResponse(statusCodeForAIError(result.error.code), result);
  } catch {
    return jsonResponse(500, {
      success: false,
      error: {
        code: 'MODEL_ERROR',
        message: 'Unexpected error while handling request',
      },
      promptId: 'explain-rule',
    });
  }
}
