import { describe, expect, it } from 'vitest';

import { generateRequestId } from '../../../src/lambda/shared/request-id.js';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('lambda shared request-id', () => {
  it('generateRequestId returns a valid UUID v4', () => {
    const requestId = generateRequestId();

    expect(requestId).toMatch(UUID_V4_REGEX);
  });
});
