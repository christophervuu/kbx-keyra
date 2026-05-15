import type { Response } from 'express';

import type { ErrorEnvelope } from './types';

export const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export function sendData<T>(res: Response, statusCode: number, data: T): void {
  res.status(statusCode).set(JSON_HEADERS).json({ success: true, data });
}

export function sendNoContent(res: Response): void {
  res.status(204).set(JSON_HEADERS).send();
}

export function sendError(
  res: Response,
  requestId: string,
  code: string,
  message: string,
  statusCode: number,
  retryable: boolean,
): void {
  const body: ErrorEnvelope = {
    error: {
      code,
      message,
      statusCode,
      retryable,
      requestId,
    },
  };

  res.status(statusCode).set({ ...JSON_HEADERS, 'x-request-id': requestId }).json(body);
}
