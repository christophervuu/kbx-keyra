import { validationError, type AppErrorDetails } from './errors.js';

export interface ValidationResult {
  readonly ok: boolean;
  readonly error?: AppErrorDetails;
}

export function requireFields(body: Record<string, unknown> | null, fields: readonly string[]): ValidationResult {
  if (body === null) {
    return {
      ok: false,
      error: validationError(`Missing required field: ${fields[0] ?? 'body'}`),
    };
  }

  for (const field of fields) {
    const value = body[field];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      return {
        ok: false,
        error: validationError(`Missing required field: ${field}`),
      };
    }
  }

  return { ok: true };
}
