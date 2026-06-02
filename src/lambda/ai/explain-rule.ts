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

  try {
    const result = await invokeAI('explain-rule', {
      targetPath,
      expression,
    });

    if (result.success) {
      return jsonResponse(200, result, requestId);
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
