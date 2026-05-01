import { formatDiagnosticMessage } from '../diagnostics/format.js';
import type { Diagnostic, MappingConfigBlock } from '../types/index.js';
import { findFunctionCalls } from './ast-utils.js';
import type { ParsedRuleAst } from './source-paths.js';

function hasConstant(constants: Readonly<Record<string, unknown>>, name: string): boolean {
  return Object.hasOwn(constants, name);
}

export function validateConstantsAndExternals(
  parsedRules: readonly ParsedRuleAst[],
  config: MappingConfigBlock,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const declaredExternalSources = new Set(config.externalSources);

  for (const parsedRule of parsedRules) {
    if (parsedRule.ast === null) {
      continue;
    }

    const constantCalls = findFunctionCalls(parsedRule.ast, 'constant');
    for (const call of constantCalls) {
      const argument = call.arguments[0];
      if (!argument || argument.type !== 'StringLiteral') {
        continue;
      }

      const constantName = argument.value;
      if (hasConstant(config.constants, constantName)) {
        continue;
      }

      diagnostics.push({
        code: 'KEYRA-E011',
        severity: 'error',
        message: formatDiagnosticMessage('KEYRA-E011', { name: constantName }),
        ruleIndex: parsedRule.ruleIndex,
        targetPath: parsedRule.rule.target,
        expression: parsedRule.rule.expression,
        location: {
          function: 'constant',
        },
      });
    }

    const externalCalls = findFunctionCalls(parsedRule.ast, 'external');
    for (const call of externalCalls) {
      const argument = call.arguments[0];
      if (!argument || argument.type !== 'StringLiteral') {
        continue;
      }

      const externalName = argument.value;
      if (declaredExternalSources.has(externalName)) {
        continue;
      }

      diagnostics.push({
        code: 'KEYRA-E012',
        severity: 'warning',
        message: formatDiagnosticMessage('KEYRA-E012', { name: externalName }),
        ruleIndex: parsedRule.ruleIndex,
        targetPath: parsedRule.rule.target,
        expression: parsedRule.rule.expression,
        location: {
          function: 'external',
        },
      });
    }
  }

  return diagnostics;
}
