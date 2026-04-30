import { describe, expect, it } from 'vitest';

import { tokenize } from '../../../src/engine/dsl/tokenizer.js';

describe('tokenize()', () => {
  it('tokenizes source("hello") as Identifier/OpenParen/StringLiteral/CloseParen/EOF', () => {
    const result = tokenize('source("hello")');

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map((token) => token.type)).toEqual([
      'Identifier',
      'OpenParen',
      'StringLiteral',
      'CloseParen',
      'EOF',
    ]);
    expect(result.tokens[0]).toMatchObject({ type: 'Identifier', value: 'source', start: 0, end: 6 });
    expect(result.tokens[2]).toMatchObject({
      type: 'StringLiteral',
      value: 'hello',
      start: 7,
      end: 14,
    });
  });

  it('handles all token categories and ignores whitespace', () => {
    const result = tokenize('  true , false , null , id( -100.5 , { "k" : "v" } )  ');

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map((token) => token.type)).toEqual([
      'BooleanLiteral',
      'Comma',
      'BooleanLiteral',
      'Comma',
      'NullLiteral',
      'Comma',
      'Identifier',
      'OpenParen',
      'NumberLiteral',
      'Comma',
      'OpenBrace',
      'StringLiteral',
      'Colon',
      'StringLiteral',
      'CloseBrace',
      'CloseParen',
      'EOF',
    ]);
  });

  it('resolves valid escapes in string literals', () => {
    const result = tokenize('"a\\n\\t\\\\\\\"b"');

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens[0]).toMatchObject({
      type: 'StringLiteral',
      value: 'a\n\t\\"b',
      start: 0,
      end: 12,
    });
  });

  it('emits E001 for invalid escape sequences', () => {
    const result = tokenize('"hello\\q"');

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E001')).toBe(true);
  });

  it('emits E001 for unterminated strings', () => {
    const result = tokenize('"unterminated');

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E001')).toBe(true);
  });

  it('emits E001 for unexpected characters and continues scanning', () => {
    const result = tokenize('source(@"x")');

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E001')).toBe(true);
    expect(result.tokens.map((token) => token.type)).toContain('Identifier');
    expect(result.tokens.at(-1)).toMatchObject({ type: 'EOF' });
  });

  it('adds EOF token at expression length', () => {
    const expression = 'null';
    const result = tokenize(expression);
    const eof = result.tokens.at(-1);

    expect(eof).toEqual({
      type: 'EOF',
      value: '',
      start: expression.length,
      end: expression.length,
    });
  });
});
