import { describe, expect, it } from 'vitest';

import { findMatchingBracket, tokenizeDsl } from './dsl-tokenizer';

describe('tokenizeDsl', () => {
  it('returns empty array for empty string', () => {
    expect(tokenizeDsl('')).toEqual([]);
  });

  it('tokenizes a simple source() call', () => {
    const tokens = tokenizeDsl('source("name")');
    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      'function-name', // source
      'punctuation',   // (
      'string-literal', // "name"
      'punctuation',   // )
    ]);
    expect(tokens[0].text).toBe('source');
    expect(tokens[2].text).toBe('"name"');
  });

  it('classifies integer as number-literal', () => {
    const tokens = tokenizeDsl('123');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: 'number-literal', text: '123' });
  });

  it('classifies decimal as number-literal', () => {
    const tokens = tokenizeDsl('45.6');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: 'number-literal', text: '45.6' });
  });

  it('classifies true and false as boolean-literal', () => {
    const trueTokens = tokenizeDsl('true');
    expect(trueTokens[0]).toMatchObject({ type: 'boolean-literal', text: 'true' });

    const falseTokens = tokenizeDsl('false');
    expect(falseTokens[0]).toMatchObject({ type: 'boolean-literal', text: 'false' });
  });

  it('classifies null as null-literal', () => {
    const tokens = tokenizeDsl('null');
    expect(tokens[0]).toMatchObject({ type: 'null-literal', text: 'null' });
  });

  it('classifies ( and ) as punctuation', () => {
    const tokens = tokenizeDsl('()');
    expect(tokens[0]).toMatchObject({ type: 'punctuation', text: '(' });
    expect(tokens[1]).toMatchObject({ type: 'punctuation', text: ')' });
  });

  it('classifies , as comma', () => {
    const tokens = tokenizeDsl(',');
    expect(tokens[0]).toMatchObject({ type: 'comma', text: ',' });
  });

  it('classifies { and } as brace', () => {
    const tokens = tokenizeDsl('{}');
    expect(tokens[0]).toMatchObject({ type: 'brace', text: '{' });
    expect(tokens[1]).toMatchObject({ type: 'brace', text: '}' });
  });

  it('classifies : as colon', () => {
    const tokens = tokenizeDsl(':');
    expect(tokens[0]).toMatchObject({ type: 'colon', text: ':' });
  });

  it('classifies spaces as whitespace', () => {
    const tokens = tokenizeDsl('  ');
    expect(tokens[0]).toMatchObject({ type: 'whitespace', text: '  ' });
  });

  it('tokenizes a complex expression correctly', () => {
    const expr = 'if(eq(source("x"), 10), static("yes"), static("no"))';
    const tokens = tokenizeDsl(expr);
    const names = tokens.filter((t) => t.type === 'function-name').map((t) => t.text);
    expect(names).toEqual(['if', 'eq', 'source', 'static', 'static']);

    const strings = tokens.filter((t) => t.type === 'string-literal').map((t) => t.text);
    expect(strings).toEqual(['"x"', '"yes"', '"no"']);

    const numbers = tokens.filter((t) => t.type === 'number-literal').map((t) => t.text);
    expect(numbers).toEqual(['10']);
  });

  it('handles escaped quotes inside string literals', () => {
    const tokens = tokenizeDsl('source("path\\"escaped")');
    const stringToken = tokens.find((t) => t.type === 'string-literal');
    expect(stringToken).toBeDefined();
    expect(stringToken!.text).toBe('"path\\"escaped"');
  });

  it('handles multi-line expressions', () => {
    const expr = 'concat(\n  source("a"),\n  source("b")\n)';
    const tokens = tokenizeDsl(expr);
    const fnNames = tokens.filter((t) => t.type === 'function-name').map((t) => t.text);
    expect(fnNames).toEqual(['concat', 'source', 'source']);
    const whitespace = tokens.filter((t) => t.type === 'whitespace');
    expect(whitespace.length).toBeGreaterThan(0);
  });

  it('handles incomplete (unclosed string) gracefully — emits partial string-literal', () => {
    const tokens = tokenizeDsl('source("unclosed');
    const stringToken = tokens.find((t) => t.type === 'string-literal');
    expect(stringToken).toBeDefined();
    expect(stringToken!.text).toBe('"unclosed');
  });

  it('covers the entire input with no character gaps', () => {
    const expr = 'if(eq(source("name"), true), static("Y"), null)';
    const tokens = tokenizeDsl(expr);
    const reconstructed = tokens.map((t) => t.text).join('');
    expect(reconstructed).toBe(expr);
  });

  it('token start/end positions are correct', () => {
    const tokens = tokenizeDsl('true');
    expect(tokens[0].start).toBe(0);
    expect(tokens[0].end).toBe(4);
  });
});

describe('findMatchingBracket', () => {
  it('returns null for empty expression', () => {
    expect(findMatchingBracket('', 0)).toBeNull();
  });

  it('returns null when cursor is not on a bracket', () => {
    expect(findMatchingBracket('abc', 1)).toBeNull();
  });

  it('finds matching closing paren for opening paren at cursor', () => {
    const result = findMatchingBracket('source("x")', 0);
    expect(result).toBeNull(); // 's' is not a bracket

    // cursor on '('
    const result2 = findMatchingBracket('source("x")', 6);
    expect(result2).toEqual([6, 10]);
  });

  it('finds matching opening paren for closing paren at cursor', () => {
    // cursor on ')'
    const result = findMatchingBracket('source("x")', 10);
    expect(result).toEqual([6, 10]);
  });

  it('handles nested brackets correctly', () => {
    // if(eq(a, b), c, d)
    //    ^         match  ^
    const expr = 'if(eq(a, b), c, d)';
    // cursor on outer '(' at pos 2
    const result = findMatchingBracket(expr, 2);
    expect(result).toEqual([2, 17]);

    // cursor on inner '(' at pos 5
    const result2 = findMatchingBracket(expr, 5);
    expect(result2).toEqual([5, 10]);
  });

  it('returns null for unmatched opening paren', () => {
    const result = findMatchingBracket('source("x"', 6);
    expect(result).toBeNull();
  });

  it('checks character before cursor (cursor after closing paren)', () => {
    // cursor at pos 11 (after the closing ')')
    const result = findMatchingBracket('source("x")', 11);
    expect(result).toEqual([6, 10]);
  });
});
