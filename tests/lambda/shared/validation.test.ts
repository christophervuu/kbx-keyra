import { describe, expect, it } from 'vitest';

import { requireFields } from '../../../src/lambda/shared/validation.js';

describe('lambda shared validation', () => {
  it('returns ok when all required fields are present', () => {
    const result = requireFields({ name: 'Project A', description: 'desc' }, ['name', 'description']);
    expect(result).toEqual({ ok: true });
  });

  it('returns first missing field message format (AE-12)', () => {
    const result = requireFields({ description: 'Only desc' }, ['name', 'description']);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe('Missing required field: name');
    expect(result.error?.code).toBe('VALIDATION_ERROR');
    expect(result.error?.statusCode).toBe(400);
    expect(result.error?.retryable).toBe(false);
  });

  it('returns missing first field when body is null', () => {
    const result = requireFields(null, ['name']);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe('Missing required field: name');
  });
});
