import { describe, expect, it } from 'vitest';

import {
  INLINE_OUTPUT_NODE_LIMIT_HARD,
  INLINE_OUTPUT_NODE_LIMIT_SOFT,
  INLINE_OUTPUT_SIZE_BYTES_HARD,
  INLINE_OUTPUT_SIZE_BYTES_SOFT,
  resolveOutputRenderMode,
} from './output-render-limits';

describe('resolveOutputRenderMode', () => {
  it('returns interactive below both soft limits', () => {
    expect(resolveOutputRenderMode({
      nodeCount: INLINE_OUTPUT_NODE_LIMIT_SOFT - 1,
      serializedSizeBytes: INLINE_OUTPUT_SIZE_BYTES_SOFT - 1,
    })).toBe('interactive');
  });

  it('returns limited at soft node threshold', () => {
    expect(resolveOutputRenderMode({
      nodeCount: INLINE_OUTPUT_NODE_LIMIT_SOFT,
      serializedSizeBytes: INLINE_OUTPUT_SIZE_BYTES_SOFT - 1,
    })).toBe('limited');
  });

  it('returns limited at soft size threshold', () => {
    expect(resolveOutputRenderMode({
      nodeCount: INLINE_OUTPUT_NODE_LIMIT_SOFT - 1,
      serializedSizeBytes: INLINE_OUTPUT_SIZE_BYTES_SOFT,
    })).toBe('limited');
  });

  it('returns fallback at hard node threshold', () => {
    expect(resolveOutputRenderMode({
      nodeCount: INLINE_OUTPUT_NODE_LIMIT_HARD,
      serializedSizeBytes: INLINE_OUTPUT_SIZE_BYTES_SOFT,
    })).toBe('fallback');
  });

  it('returns fallback at hard size threshold', () => {
    expect(resolveOutputRenderMode({
      nodeCount: INLINE_OUTPUT_NODE_LIMIT_SOFT,
      serializedSizeBytes: INLINE_OUTPUT_SIZE_BYTES_HARD,
    })).toBe('fallback');
  });
});
