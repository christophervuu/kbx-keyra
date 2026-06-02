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

  const instruction = requestBody.instruction;
  if (typeof instruction !== 'string' || instruction === '') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required field: instruction', 400, false, requestId);
  }

  const targetPath = requestBody.targetPath;
  if (typeof targetPath !== 'string' || targetPath === '') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required field: targetPath', 400, false, requestId);
  }

  const targetType = requestBody.targetType;
  if (typeof targetType !== 'string' || targetType === '') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required field: targetType', 400, false, requestId);
  }

  const sourceContext = requestBody.sourceContext;
  if (typeof sourceContext !== 'string' || sourceContext === '') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required field: sourceContext', 400, false, requestId);
  }

  const targetDescription =
    typeof requestBody.targetDescription === 'string' ? requestBody.targetDescription : '';

  try {
    const result = await invokeAI('nl-to-rule', {
      instruction,
      targetPath,
      targetType,
      targetDescription,
      sourceFields: sourceContext,
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
