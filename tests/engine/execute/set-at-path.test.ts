import { describe, expect, it } from 'vitest';

import { setAtPath } from '../../../src/engine/execute/index.js';

describe('setAtPath', () => {
  it('sets value at a single-segment path', () => {
    const output: Record<string, unknown> = {};

    setAtPath(output, 'A', 1);

    expect(output).toEqual({ A: 1 });
  });

  it('sets value at a multi-segment path and creates nested objects', () => {
    const output: Record<string, unknown> = {};

    setAtPath(output, 'A.B.C', 1);

    expect(output).toEqual({
      A: {
        B: {
          C: 1,
        },
      },
    });
  });

  it('supports multiple calls building sibling paths under the same object', () => {
    const output: Record<string, unknown> = {};

    setAtPath(output, 'A.B', 1);
    setAtPath(output, 'A.C', 2);

    expect(output).toEqual({
      A: {
        B: 1,
        C: 2,
      },
    });
  });

  it('overwrites existing value at the same path (last write wins)', () => {
    const output: Record<string, unknown> = {};

    setAtPath(output, 'Status', 'draft');
    setAtPath(output, 'Status', 'final');

    expect(output).toEqual({ Status: 'final' });
  });

  it('overwrites scalar intermediates with objects when a deeper path is set', () => {
    const output: Record<string, unknown> = {};

    setAtPath(output, 'A', 1);
    setAtPath(output, 'A.B', 2);

    expect(output).toEqual({
      A: {
        B: 2,
      },
    });
  });

  it('stores array values at the target path', () => {
    const output: Record<string, unknown> = {};

    setAtPath(output, 'Items', [1, 2]);

    expect(output).toEqual({ Items: [1, 2] });
  });

  it('stores null values at the target path', () => {
    const output: Record<string, unknown> = {};

    setAtPath(output, 'A', null);

    expect(output).toEqual({ A: null });
  });

  it('handles empty path by replacing root object when value is object-like', () => {
    const output: Record<string, unknown> = { old: true };

    setAtPath(output, '', {
      fresh: true,
      nested: {
        ok: true,
      },
    });

    expect(output).toEqual({
      fresh: true,
      nested: {
        ok: true,
      },
    });
  });
});
