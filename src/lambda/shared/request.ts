import type { APIGatewayProxyEvent } from './types.js';

export function parseBody(event: APIGatewayProxyEvent): Record<string, unknown> | null {
  const body = event.body;
  if (body === null || body.trim() === '') {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parsePathParam(event: APIGatewayProxyEvent, name: string): string | null {
  const value = event.pathParameters?.[name];
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  return value;
}

export function parseQueryParam(event: APIGatewayProxyEvent, name: string): string | null {
  const value = event.queryStringParameters?.[name];
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  return value;
}
