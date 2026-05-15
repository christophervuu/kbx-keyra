import type { APIGatewayProxyResult } from './types.js';
import type { AppErrorResponse, ErrorCode } from './errors.js';

export const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  statusCode: number,
  retryable: boolean,
): APIGatewayProxyResult {
  const envelope: AppErrorResponse = {
    error: {
      code,
      message,
      statusCode,
      retryable,
    },
  };

  return jsonResponse(statusCode, envelope);
}
