import { formatDiagnosticMessage } from '../diagnostics/format.js';
import type { AstNode } from '../dsl/types.js';
import type { MappingRule, Diagnostic } from '../types/index.js';
import type { SchemaTree } from './schema-tree.js';
import { findFunctionCalls } from './ast-utils.js';

export interface ParsedRuleAst {
  readonly ruleIndex: number;
  readonly rule: MappingRule;
  readonly ast: AstNode | null;
}

export function validateSourcePaths(
  parsedRules: readonly ParsedRuleAst[],
  sourceSchemaTree: SchemaTree,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const parsedRule of parsedRules) {
    if (parsedRule.ast === null) {
      continue;
    }

    const sourceCalls = findFunctionCalls(parsedRule.ast, 'source');

    for (const sourceCall of sourceCalls) {
      const firstArgument = sourceCall.arguments[0];
      if (!firstArgument || firstArgument.type !== 'StringLiteral') {
        continue;
      }

      const sourcePath = firstArgument.value;
      if (sourcePath === '') {
        continue;
      }

      if (sourceSchemaTree.hasPath(sourcePath)) {
        continue;
      }

      diagnostics.push({
        code: 'KEYRA-E030',
        severity: 'error',
        message: formatDiagnosticMessage('KEYRA-E030', { path: sourcePath }),
        ruleIndex: parsedRule.ruleIndex,
        targetPath: parsedRule.rule.target,
        expression: parsedRule.rule.expression,
        location: {
          function: 'source',
        },
      });
    }
  }

  return diagnostics;
}
