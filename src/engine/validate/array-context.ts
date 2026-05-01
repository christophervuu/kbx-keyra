import { formatDiagnosticMessage } from '../diagnostics/format.js';
import type { AstNode } from '../dsl/types.js';
import type { FunctionRegistry } from '../registry/function-registry.js';
import type { Diagnostic } from '../types/index.js';
import { inferType } from './type-inference.js';
import type { ParsedRuleAst } from './source-paths.js';
import type { SchemaTree } from './schema-tree.js';

interface WalkContext {
  readonly arrayDepth: number;
  readonly currentItemPath?: string;
  readonly parentItemPath?: string;
}

function getScopedItemPathFromArrayArgument(
  arrayArgument: AstNode | undefined,
  fallbackPath?: string,
): string | undefined {
  if (!arrayArgument || arrayArgument.type !== 'FunctionCall') {
    return fallbackPath;
  }

  if (arrayArgument.name === 'source' || arrayArgument.name === 'item' || arrayArgument.name === 'parent') {
    const firstArg = arrayArgument.arguments[0];
    if (firstArg && firstArg.type === 'StringLiteral' && firstArg.value.length > 0) {
      return firstArg.value;
    }
  }

  return fallbackPath;
}

function createRuleDiagnostic(
  code: 'KEYRA-E010' | 'KEYRA-E013' | 'KEYRA-E017',
  parsedRule: ParsedRuleAst,
  functionName: string,
): Diagnostic {
  const message =
    code === 'KEYRA-E017'
      ? formatDiagnosticMessage('KEYRA-E017', {})
      : formatDiagnosticMessage(code, {});

  return {
    code,
    severity: 'error',
    message,
    ruleIndex: parsedRule.ruleIndex,
    targetPath: parsedRule.rule.target,
    expression: parsedRule.rule.expression,
    location: {
      function: functionName,
    },
  };
}

function walkNode(
  node: AstNode,
  parsedRule: ParsedRuleAst,
  walkContext: WalkContext,
  sourceSchema: SchemaTree,
  registry: FunctionRegistry,
  diagnostics: Diagnostic[],
): void {
  if (node.type === 'ObjectTemplate') {
    for (const property of node.properties) {
      walkNode(property.value, parsedRule, walkContext, sourceSchema, registry, diagnostics);
    }
    return;
  }

  if (node.type !== 'FunctionCall') {
    return;
  }

  if (node.name === 'item' && walkContext.arrayDepth < 1) {
    diagnostics.push(createRuleDiagnostic('KEYRA-E010', parsedRule, 'item'));
  }

  if (node.name === 'parent' && walkContext.arrayDepth < 2) {
    diagnostics.push(createRuleDiagnostic('KEYRA-E013', parsedRule, 'parent'));
  }

  if (node.name === 'map' || node.name === 'filter' || node.name === 'find') {
    const firstArg = node.arguments[0];
    const secondArg = node.arguments[1];

    if (firstArg) {
      walkNode(firstArg, parsedRule, walkContext, sourceSchema, registry, diagnostics);
    }

    if (secondArg) {
      const scopedItemPath = getScopedItemPathFromArrayArgument(firstArg, walkContext.currentItemPath);
      const childContext: WalkContext = {
        arrayDepth: walkContext.arrayDepth + 1,
        currentItemPath: scopedItemPath,
        parentItemPath: walkContext.currentItemPath,
      };

      walkNode(secondArg, parsedRule, childContext, sourceSchema, registry, diagnostics);

      if (node.name === 'filter' || node.name === 'find') {
        const inferredConditionType = inferType(secondArg, {
          registry,
          sourceSchema,
          arrayDepth: childContext.arrayDepth,
          currentItemPath: childContext.currentItemPath,
          parentItemPath: childContext.parentItemPath,
        });

        if (inferredConditionType !== undefined && inferredConditionType !== 'any' && inferredConditionType !== 'boolean') {
          diagnostics.push(createRuleDiagnostic('KEYRA-E017', parsedRule, node.name));
        }
      }
    }

    return;
  }

  for (const argument of node.arguments) {
    walkNode(argument, parsedRule, walkContext, sourceSchema, registry, diagnostics);
  }
}

export function validateArrayContext(
  parsedRules: readonly ParsedRuleAst[],
  registry: FunctionRegistry,
  sourceSchema: SchemaTree,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const parsedRule of parsedRules) {
    if (parsedRule.ast === null) {
      continue;
    }

    walkNode(
      parsedRule.ast,
      parsedRule,
      { arrayDepth: 0 },
      sourceSchema,
      registry,
      diagnostics,
    );
  }

  return diagnostics;
}
