import type { APIGatewayProxyResult } from './types.js';
import type { AppErrorResponse, ErrorCode } from './errors.js';
import { generateRequestId } from './request-id.js';

export const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export function jsonResponse(
  statusCode: number,
  body: unknown,
  requestId?: string,
  additionalHeaders?: Record<string, string>,
): APIGatewayProxyResult {
  const baseHeaders =
    typeof requestId === 'string' && requestId.trim() !== ''
      ? {
          ...JSON_HEADERS,
          'x-request-id': requestId,
        }
      : JSON_HEADERS;

  const headers = additionalHeaders
    ? {
        ...baseHeaders,
        ...additionalHeaders,
      }
    : baseHeaders;

  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  statusCode: number,
  retryable: boolean,
  requestId?: string,
  details?: unknown,
  additionalHeaders?: Record<string, string>,
): APIGatewayProxyResult {
  const resolvedRequestId = typeof requestId === 'string' && requestId.trim() !== '' ? requestId : generateRequestId();
  const envelope: AppErrorResponse = {
    error: {
      code,
      message,
      statusCode,
      retryable,
      requestId: resolvedRequestId,
      ...(details !== undefined ? { details } : {}),
    },
  };

  return jsonResponse(statusCode, envelope, resolvedRequestId, additionalHeaders);
}
