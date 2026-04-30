import { DIAGNOSTIC_CODES } from '../diagnostics/codes.js';
import { formatDiagnosticMessage } from '../diagnostics/format.js';
import type { Diagnostic } from '../types/results.js';
import type { Token, TokenType } from './types.js';

export interface TokenizeResult {
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly Diagnostic[];
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);
const PUNCTUATION_TOKEN_MAP: Readonly<Record<string, TokenType>> = {
  '(': 'OpenParen',
  ')': 'CloseParen',
  ',': 'Comma',
  '{': 'OpenBrace',
  '}': 'CloseBrace',
  ':': 'Colon',
};

export function tokenize(expression: string): TokenizeResult {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let position = 0;

  const pushSyntaxError = (detail: string): void => {
    diagnostics.push({
      code: DIAGNOSTIC_CODES['KEYRA-E001'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E001'].severity,
      message: formatDiagnosticMessage('KEYRA-E001', { detail }),
      expression,
    });
  };

  const peek = (): string | undefined => expression[position];

  const createToken = (type: TokenType, value: string, start: number, end: number): Token => ({
    type,
    value,
    start,
    end,
  });

  while (position < expression.length) {
    const current = peek();

    if (current === undefined) {
      break;
    }

    if (WHITESPACE.has(current)) {
      position += 1;
      continue;
    }

    const punctuationType = PUNCTUATION_TOKEN_MAP[current];
    if (punctuationType !== undefined) {
      const tokenStart = position;
      position += 1;
      tokens.push(createToken(punctuationType, current, tokenStart, position));
      continue;
    }

    if (current === '"') {
      const tokenStart = position;
      position += 1;
      let value = '';
      let terminated = false;

      while (position < expression.length) {
        const char = expression[position];

        if (char === '"') {
          terminated = true;
          position += 1;
          break;
        }

        if (char === '\\') {
          const escapedChar = expression[position + 1];

          if (escapedChar === undefined) {
            pushSyntaxError('unterminated string literal');
            position = expression.length;
            break;
          }

          if (escapedChar === '"') {
            value += '"';
          } else if (escapedChar === '\\') {
            value += '\\';
          } else if (escapedChar === 'n') {
            value += '\n';
          } else if (escapedChar === 't') {
            value += '\t';
          } else {
            pushSyntaxError(`invalid escape sequence \\${escapedChar}`);
            value += escapedChar;
          }

          position += 2;
          continue;
        }

        value += char;
        position += 1;
      }

      if (!terminated) {
        pushSyntaxError('unterminated string literal');
        continue;
      }

      tokens.push(createToken('StringLiteral', value, tokenStart, position));
      continue;
    }

    if (isNumberStart(current, expression[position + 1])) {
      const tokenStart = position;

      if (current === '-') {
        position += 1;
      }

      const integerStart = position;
      while (isDigit(expression[position])) {
        position += 1;
      }

      const integerPart = expression.slice(integerStart, position);
      if (!isValidIntegerPart(integerPart)) {
        pushSyntaxError(`invalid number literal '${expression.slice(tokenStart, position)}'`);
      }

      if (expression[position] === '.') {
        const dotPosition = position;
        position += 1;
        const fractionStart = position;

        while (isDigit(expression[position])) {
          position += 1;
        }

        const fractionPart = expression.slice(fractionStart, position);
        if (fractionPart.length === 0) {
          pushSyntaxError(
            `invalid number literal '${expression.slice(tokenStart, dotPosition + 1)}'`,
          );
        }
      }

      const rawNumber = expression.slice(tokenStart, position);
      tokens.push(createToken('NumberLiteral', rawNumber, tokenStart, position));
      continue;
    }

    if (isLetter(current)) {
      const tokenStart = position;

      while (isLetter(expression[position])) {
        position += 1;
      }

      const value = expression.slice(tokenStart, position);
      if (value === 'true' || value === 'false') {
        tokens.push(createToken('BooleanLiteral', value, tokenStart, position));
      } else if (value === 'null') {
        tokens.push(createToken('NullLiteral', value, tokenStart, position));
      } else {
        tokens.push(createToken('Identifier', value, tokenStart, position));
      }

      continue;
    }

    pushSyntaxError(`unexpected character '${current}'`);
    position += 1;
  }

  tokens.push(createToken('EOF', '', expression.length, expression.length));

  return {
    tokens,
    diagnostics,
  };
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

function isLetter(char: string | undefined): boolean {
  if (char === undefined) {
    return false;
  }

  return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
}

function isNumberStart(char: string | undefined, next: string | undefined): boolean {
  if (char === undefined) {
    return false;
  }

  if (char === '-') {
    return isDigit(next);
  }

  return isDigit(char);
}

function isValidIntegerPart(integerPart: string): boolean {
  if (integerPart.length === 0) {
    return false;
  }

  if (integerPart === '0') {
    return true;
  }

  return !integerPart.startsWith('0');
}
