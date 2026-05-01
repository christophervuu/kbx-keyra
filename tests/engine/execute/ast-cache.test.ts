import { describe, expect, it } from 'vitest';

import { AstCache } from '../../../src/engine/execute/index.js';
import type { AstNode } from '../../../src/engine/dsl/types.js';

const sampleAst: AstNode = {
  type: 'FunctionCall',
  name: 'static',
  arguments: [
    {
      type: 'StringLiteral',
      value: 'same',
      start: 7,
      end: 13,
    },
  ],
  start: 0,
  end: 14,
};

describe('AstCache', () => {
  it('returns undefined for uncached expressions', () => {
    const cache = new AstCache();

    expect(cache.get('static("x")')).toBeUndefined();
  });

  it('returns cached AST after set', () => {
    const cache = new AstCache();

    cache.set('static("same")', sampleAst);

    expect(cache.get('static("same")')).toEqual(sampleAst);
  });

  it('reports cache membership via has()', () => {
    const cache = new AstCache();

    expect(cache.has('source("x")')).toBe(false);

    cache.set('source("x")', sampleAst);

    expect(cache.has('source("x")')).toBe(true);
  });

  it('returns the same object reference for the same expression', () => {
    const cache = new AstCache();

    cache.set('static("same")', sampleAst);

    const first = cache.get('static("same")');
    const second = cache.get('static("same")');

    expect(first).toBe(sampleAst);
    expect(second).toBe(sampleAst);
    expect(first).toBe(second);
  });

  it('caches null AST values for parse failures', () => {
    const cache = new AstCache();

    cache.set('invalid!!!syntax', null);

    expect(cache.has('invalid!!!syntax')).toBe(true);
    expect(cache.get('invalid!!!syntax')).toBeNull();
  });

  it('clears all cached values', () => {
    const cache = new AstCache();

    cache.set('static("same")', sampleAst);
    cache.set('invalid!!!syntax', null);

    cache.clear();

    expect(cache.has('static("same")')).toBe(false);
    expect(cache.has('invalid!!!syntax')).toBe(false);
    expect(cache.get('static("same")')).toBeUndefined();
    expect(cache.get('invalid!!!syntax')).toBeUndefined();
  });
});
