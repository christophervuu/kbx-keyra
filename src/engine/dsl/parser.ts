import { DIAGNOSTIC_CODES } from '../diagnostics/codes.js';
import { formatDiagnosticMessage } from '../diagnostics/format.js';
import type { Diagnostic } from '../types/results.js';
import type {
  AstNode,
  BooleanLiteralNode,
  FunctionCallNode,
  NullLiteralNode,
  NumberLiteralNode,
  ObjectTemplateNode,
  ObjectTemplateProperty,
  StringLiteralNode,
  Token,
  TokenType,
} from './types.js';

export interface ParseTokensOptions {
  readonly tokens: readonly Token[];
  readonly maxDepth: number;
  readonly expression?: string;
}

export interface ParseTokensResult {
  readonly ast: AstNode | null;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseTokens(options: ParseTokensOptions): ParseTokensResult {
  const parser = new TokenParser(options);
  return parser.parse();
}

class TokenParser {
  private readonly tokens: readonly Token[];
  private readonly maxDepth: number;
  private readonly expression?: string;
  private position = 0;

  constructor(options: ParseTokensOptions) {
    this.tokens = options.tokens;
    this.maxDepth = options.maxDepth;
    this.expression = options.expression;
  }

  parse(): ParseTokensResult {
    try {
      const ast = this.parseExpression(1);
      const current = this.currentToken();

      if (current.type !== 'EOF') {
        throw this.syntaxError(`expected end of input, found ${describeToken(current)}`);
      }

      return {
        ast,
        diagnostics: [],
      };
    } catch (error) {
      if (error instanceof ParserFailure) {
        return {
          ast: null,
          diagnostics: [error.diagnostic],
        };
      }

      throw error;
    }
  }

  private parseExpression(depth: number): AstNode {
    if (depth > this.maxDepth) {
      throw this.maxDepthError();
    }

    const token = this.currentToken();

    switch (token.type) {
      case 'StringLiteral':
        this.advance();
        return this.toStringLiteralNode(token);
      case 'NumberLiteral':
        this.advance();
        return this.toNumberLiteralNode(token);
      case 'BooleanLiteral':
        this.advance();
        return this.toBooleanLiteralNode(token);
      case 'NullLiteral':
        this.advance();
        return this.toNullLiteralNode(token);
      case 'Identifier':
        return this.parseFunctionCall(depth);
      case 'OpenBrace':
        return this.parseObjectTemplate(depth);
      default:
        throw this.syntaxError(`expected expression, found ${describeToken(token)}`);
    }
  }

  private parseFunctionCall(depth: number): FunctionCallNode {
    const nameToken = this.consume('Identifier');
    const openParen = this.tryConsume('OpenParen');

    if (openParen === null) {
      throw this.syntaxError(`expected '(', found ${describeToken(this.currentToken())}`);
    }

    const args: AstNode[] = [];

    if (this.currentToken().type !== 'CloseParen') {
      args.push(this.parseExpression(depth + 1));

      while (this.tryConsume('Comma') !== null) {
        if (this.currentToken().type === 'CloseParen') {
          throw this.syntaxError(`unexpected token ${describeToken(this.currentToken())} after comma`);
        }

        args.push(this.parseExpression(depth + 1));
      }
    }

    const closeParen = this.tryConsume('CloseParen');
    if (closeParen === null) {
      throw this.syntaxError(`expected ')', found ${describeToken(this.currentToken())}`);
    }

    return {
      type: 'FunctionCall',
      name: nameToken.value,
      arguments: args,
      start: nameToken.start,
      end: closeParen.end,
    };
  }

  private parseObjectTemplate(depth: number): ObjectTemplateNode {
    const openBrace = this.consume('OpenBrace');
    const properties: ObjectTemplateProperty[] = [];

    if (this.currentToken().type !== 'CloseBrace') {
      properties.push(this.parseObjectTemplateProperty(depth));

      while (this.tryConsume('Comma') !== null) {
        if (this.currentToken().type === 'CloseBrace') {
          throw this.syntaxError(`unexpected token ${describeToken(this.currentToken())} after comma`);
        }

        properties.push(this.parseObjectTemplateProperty(depth));
      }
    }

    const closeBrace = this.tryConsume('CloseBrace');
    if (closeBrace === null) {
      throw this.syntaxError(`expected '}', found ${describeToken(this.currentToken())}`);
    }

    return {
      type: 'ObjectTemplate',
      properties,
      start: openBrace.start,
      end: closeBrace.end,
    };
  }

  private parseObjectTemplateProperty(depth: number): ObjectTemplateProperty {
    const keyToken = this.currentToken();
    if (keyToken.type !== 'StringLiteral') {
      throw this.syntaxError('object template keys must be strings');
    }

    this.advance();

    const colon = this.tryConsume('Colon');
    if (colon === null) {
      throw this.syntaxError(`expected ':', found ${describeToken(this.currentToken())}`);
    }

    const value = this.parseExpression(depth + 1);

    return {
      key: keyToken.value,
      value,
      start: keyToken.start,
      end: value.end,
    };
  }

  private consume(type: TokenType): Token {
    const token = this.currentToken();
    if (token.type !== type) {
      throw this.syntaxError(`expected ${formatExpectedToken(type)}, found ${describeToken(token)}`);
    }

    this.advance();
    return token;
  }

  private tryConsume(type: TokenType): Token | null {
    const token = this.currentToken();
    if (token.type !== type) {
      return null;
    }

    this.advance();
    return token;
  }

  private currentToken(): Token {
    const current = this.tokens[this.position];
    if (current !== undefined) {
      return current;
    }

    const last = this.tokens[this.tokens.length - 1];
    if (last !== undefined) {
      return last;
    }

    return {
      type: 'EOF',
      value: '',
      start: 0,
      end: 0,
    };
  }

  private advance(): void {
    if (this.position < this.tokens.length - 1) {
      this.position += 1;
    }
  }

  private toStringLiteralNode(token: Token): StringLiteralNode {
    return {
      type: 'StringLiteral',
      value: token.value,
      start: token.start,
      end: token.end,
    };
  }

  private toNumberLiteralNode(token: Token): NumberLiteralNode {
    return {
      type: 'NumberLiteral',
      value: Number(token.value),
      start: token.start,
      end: token.end,
    };
  }

  private toBooleanLiteralNode(token: Token): BooleanLiteralNode {
    return {
      type: 'BooleanLiteral',
      value: token.value === 'true',
      start: token.start,
      end: token.end,
    };
  }

  private toNullLiteralNode(token: Token): NullLiteralNode {
    return {
      type: 'NullLiteral',
      start: token.start,
      end: token.end,
    };
  }

  private syntaxError(detail: string): ParserFailure {
    const diagnostic: Diagnostic = {
      code: DIAGNOSTIC_CODES['KEYRA-E001'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E001'].severity,
      message: formatDiagnosticMessage('KEYRA-E001', { detail }),
      expression: this.expression,
    };

    return new ParserFailure(diagnostic);
  }

  private maxDepthError(): ParserFailure {
    const diagnostic: Diagnostic = {
      code: DIAGNOSTIC_CODES['KEYRA-E004'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E004'].severity,
      message: formatDiagnosticMessage('KEYRA-E004', { depth: String(this.maxDepth) }),
      expression: this.expression,
    };

    return new ParserFailure(diagnostic);
  }
}

class ParserFailure extends Error {
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

function describeToken(token: Token): string {
  if (token.type === 'EOF') {
    return 'end of input';
  }

  if (token.value.length > 0) {
    return `'${token.value}'`;
  }

  return token.type;
}

function formatExpectedToken(type: TokenType): string {
  const printableMap: Readonly<Record<TokenType, string>> = {
    StringLiteral: 'string literal',
    NumberLiteral: 'number literal',
    BooleanLiteral: 'boolean literal',
    NullLiteral: 'null literal',
    Identifier: 'identifier',
    OpenParen: "'('",
    CloseParen: "')'",
    Comma: "','",
    OpenBrace: "'{'",
    CloseBrace: "'}'",
    Colon: "':'",
    EOF: 'end of input',
  };

  return printableMap[type];
}
