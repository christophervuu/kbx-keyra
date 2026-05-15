import { describe, expect, it } from 'vitest';

import { parseBody, parsePathParam, parseQueryParam } from '../../../src/lambda/shared/request.js';

describe('lambda shared request parsing', () => {
  it('parseBody handles valid JSON object', () => {
    const parsed = parseBody({ body: '{"name":"value"}' });
    expect(parsed).toEqual({ name: 'value' });
  });

  it('parseBody returns null on invalid JSON', () => {
    const parsed = parseBody({ body: '{invalid' });
    expect(parsed).toBeNull();
  });

  it('parseBody returns null on null body', () => {
    expect(parseBody({ body: null })).toBeNull();
  });

  it('parseBody returns null on empty string body', () => {
    expect(parseBody({ body: '   ' })).toBeNull();
  });

  it('parsePathParam reads named parameter', () => {
    expect(parsePathParam({ body: null, pathParameters: { id: 'abc' } }, 'id')).toBe('abc');
  });

  it('parseQueryParam reads named query parameter', () => {
    expect(parseQueryParam({ body: null, queryStringParameters: { q: 'postal' } }, 'q')).toBe('postal');
  });
});
