import type { FunctionRegistry } from '../registry/function-registry.js';
import type { EngineOptions } from '../types/options.js';
import type { Diagnostic } from '../types/results.js';

export interface StringLiteralNode {
  readonly type: 'StringLiteral';
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

export interface NumberLiteralNode {
  readonly type: 'NumberLiteral';
  readonly value: number;
  readonly start: number;
  readonly end: number;
}

export interface BooleanLiteralNode {
  readonly type: 'BooleanLiteral';
  readonly value: boolean;
  readonly start: number;
  readonly end: number;
}

export interface NullLiteralNode {
  readonly type: 'NullLiteral';
  readonly start: number;
  readonly end: number;
}

export interface ObjectTemplateProperty {
  readonly key: string;
  readonly value: AstNode;
  readonly start: number;
  readonly end: number;
}

export interface ObjectTemplateNode {
  readonly type: 'ObjectTemplate';
  readonly properties: readonly ObjectTemplateProperty[];
  readonly start: number;
  readonly end: number;
}

export interface FunctionCallNode {
  readonly type: 'FunctionCall';
  readonly name: string;
  readonly arguments: readonly AstNode[];
  readonly start: number;
  readonly end: number;
}

export type AstNode =
  | StringLiteralNode
  | NumberLiteralNode
  | BooleanLiteralNode
  | NullLiteralNode
  | FunctionCallNode
  | ObjectTemplateNode;

export type TokenType =
  | 'StringLiteral'
  | 'NumberLiteral'
  | 'BooleanLiteral'
  | 'NullLiteral'
  | 'Identifier'
  | 'OpenParen'
  | 'CloseParen'
  | 'Comma'
  | 'OpenBrace'
  | 'CloseBrace'
  | 'Colon'
  | 'EOF';

export interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

export interface ParseOptions {
  readonly registry?: FunctionRegistry;
  readonly maxDepth?: number;
}

export interface ParseResult {
  readonly success: boolean;
  readonly ast: AstNode | null;
  readonly diagnostics: readonly Diagnostic[];
}

export type ScopeEntry = unknown;

export interface EvaluatorTraceEntry {
  readonly nodeType: AstNode['type'];
  readonly functionName?: string;
  readonly inputValue?: unknown;
  readonly outputValue: unknown;
}

export interface EvaluationResult {
  readonly value: unknown;
  readonly diagnostics: Diagnostic[];
  readonly trace?: EvaluatorTraceEntry[];
}

export interface EvaluationContext {
  readonly sourceData: unknown;
  readonly scopeStack: readonly ScopeEntry[];
  readonly constants: Readonly<Record<string, unknown>>;
  readonly externalSources: Readonly<Record<string, unknown>>;
  readonly registry: FunctionRegistry;
  readonly options: EngineOptions;
  readonly currentItem?: unknown;
  readonly parentItem?: unknown;
  readonly evaluate: (node: AstNode, context: EvaluationContext) => EvaluationResult;
}
