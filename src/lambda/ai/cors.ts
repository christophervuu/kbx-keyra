import {
  errorResponse,
  jsonResponse,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
  type ErrorCode,
} from '../shared/index.js';

const AI_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function withAiCors(response: APIGatewayProxyResult): APIGatewayProxyResult {
  return {
    ...response,
    headers: {
      ...(response.headers ?? {}),
      ...AI_CORS_HEADERS,
    },
  };
}

export function isOptionsRequest(event: APIGatewayProxyEvent): boolean {
  return event.httpMethod?.toUpperCase() === 'OPTIONS';
}

export function aiJsonResponse(statusCode: number, body: unknown, requestId?: string): APIGatewayProxyResult {
  return withAiCors(jsonResponse(statusCode, body, requestId));
}

export function aiErrorResponse(
  code: ErrorCode,
  message: string,
  statusCode: number,
  retryable: boolean,
  requestId?: string,
  details?: unknown,
): APIGatewayProxyResult {
  return withAiCors(errorResponse(code, message, statusCode, retryable, requestId, details));
}

export function aiOptionsResponse(requestId?: string): APIGatewayProxyResult {
  return aiJsonResponse(200, { ok: true }, requestId);
}
