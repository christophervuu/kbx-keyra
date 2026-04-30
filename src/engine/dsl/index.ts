import { DIAGNOSTIC_CODES } from '../diagnostics/codes.js';
import { formatDiagnosticMessage } from '../diagnostics/format.js';
import type { Diagnostic } from '../types/results.js';
import type { FunctionParameter } from '../types/registry.js';
import { parseTokens } from './parser.js';
import { tokenize } from './tokenizer.js';
import type {
  AstNode,
  FunctionCallNode,
  ParseOptions,
  ParseResult,
} from './types.js';

export type * from './types.js';

const DEFAULT_MAX_DEPTH = 32;

export function parse(expression: string, options?: ParseOptions): ParseResult {
  const tokenized = tokenize(expression);
  const parseResult = parseTokens({
    tokens: tokenized.tokens,
    maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH,
    expression,
  });

  const diagnostics: Diagnostic[] = [...tokenized.diagnostics, ...parseResult.diagnostics];

  let ast = parseResult.ast;

  if (ast !== null && options?.registry !== undefined) {
    diagnostics.push(...validateFunctionCalls(ast, options.registry, expression));
  }

  if (diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E001' || diagnostic.code === 'KEYRA-E004')) {
    ast = null;
  }

  return {
    success: ast !== null,
    ast,
    diagnostics,
  };
}

function validateFunctionCalls(
  root: AstNode,
  registry: NonNullable<ParseOptions['registry']>,
  expression: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const visit = (node: AstNode): void => {
    if (node.type === 'FunctionCall') {
      validateFunctionCall(node, registry, diagnostics, expression);
      for (const argument of node.arguments) {
        visit(argument);
      }
      return;
    }

    if (node.type === 'ObjectTemplate') {
      for (const property of node.properties) {
        visit(property.value);
      }
    }
  };

  visit(root);

  return diagnostics;
}

function validateFunctionCall(
  node: FunctionCallNode,
  registry: NonNullable<ParseOptions['registry']>,
  diagnostics: Diagnostic[],
  expression: string,
): void {
  const name = node.name;
  const registered = registry.getFunction(name);

  if (registered === undefined) {
    diagnostics.push({
      code: DIAGNOSTIC_CODES['KEYRA-E002'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E002'].severity,
      message: formatDiagnosticMessage('KEYRA-E002', { name }),
      expression,
      location: {
        function: name,
      },
    });
    return;
  }

  const actual = node.arguments.length;
  const arity = getArityInfo(registered.signature.parameters);
  const tooFewArgs = actual < arity.min;
  const tooManyArgs = actual > arity.max;

  if (tooFewArgs || tooManyArgs) {
    diagnostics.push({
      code: DIAGNOSTIC_CODES['KEYRA-E003'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E003'].severity,
      message: formatDiagnosticMessage('KEYRA-E003', {
        name,
        expected: formatExpectedArity(arity.min, arity.max),
        actual: String(actual),
      }),
      expression,
      location: {
        function: name,
      },
    });
  }
}

function getArityInfo(parameters: readonly FunctionParameter[]): { min: number; max: number } {
  const min = parameters.filter(
    (parameter) => parameter.required && parameter.variadic !== true,
  ).length;
  const hasVariadic = parameters.some((parameter) => parameter.variadic === true);
  const max = hasVariadic ? Number.POSITIVE_INFINITY : parameters.length;

  return { min, max };
}

function formatExpectedArity(min: number, max: number): string {
  if (max === Number.POSITIVE_INFINITY) {
    return `${min}+`;
  }

  if (min === max) {
    return String(min);
  }

  return `${min}-${max}`;
}
