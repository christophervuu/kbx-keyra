import { formatDiagnosticMessage } from '../diagnostics/format.js';
import type { Diagnostic, MappingRule } from '../types/index.js';
import type { SchemaTree } from './schema-tree.js';

export function validateTargetPaths(
  rules: readonly MappingRule[],
  targetSchemaTree: SchemaTree,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const [ruleIndex, rule] of rules.entries()) {
    if (targetSchemaTree.hasPath(rule.target)) {
      continue;
    }

    diagnostics.push({
      code: 'KEYRA-E031',
      severity: 'error',
      message: formatDiagnosticMessage('KEYRA-E031', { path: rule.target }),
      ruleIndex,
      targetPath: rule.target,
      expression: rule.expression,
      location: {
        function: 'target',
      },
    });
  }

  return diagnostics;
}

export function detectDuplicateTargets(rules: readonly MappingRule[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const targetRuleIndexes = new Map<string, number[]>();

  for (const [ruleIndex, rule] of rules.entries()) {
    const indexes = targetRuleIndexes.get(rule.target) ?? [];
    indexes.push(ruleIndex);
    targetRuleIndexes.set(rule.target, indexes);
  }

  for (const [targetPath, indexes] of targetRuleIndexes.entries()) {
    if (indexes.length < 2) {
      continue;
    }

    const indexList = indexes.join(', ');

    for (let i = 1; i < indexes.length; i += 1) {
      const duplicateRuleIndex = indexes[i];
      if (duplicateRuleIndex === undefined) {
        continue;
      }

      const duplicateRule = rules[duplicateRuleIndex];
      if (!duplicateRule) {
        continue;
      }

      diagnostics.push({
        code: 'KEYRA-W006',
        severity: 'warning',
        message: formatDiagnosticMessage('KEYRA-W006', {
          path: targetPath,
          indices: indexList,
        }),
        ruleIndex: duplicateRuleIndex,
        targetPath,
        expression: duplicateRule.expression,
        location: {
          function: 'target',
        },
      });
    }
  }

  return diagnostics;
}
