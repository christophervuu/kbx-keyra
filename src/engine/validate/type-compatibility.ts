import type { FunctionRegistry } from '../registry/function-registry.js';
import type { Diagnostic, ValueType } from '../types/index.js';
import type { SchemaTree } from './schema-tree.js';
import { inferType } from './type-inference.js';
import type { ParsedRuleAst } from './source-paths.js';

function isTypeKnown(type: ValueType | undefined): type is ValueType {
  return type !== undefined && type !== 'any';
}

function areTypesCompatible(actual: ValueType, expected: ValueType): boolean {
  if (actual === 'null') {
    return true;
  }

  if (actual === expected) {
    return true;
  }

  return false;
}

function mapRuleTypeToValueType(ruleType: ParsedRuleAst['rule']['type']): ValueType {
  return ruleType;
}

export function validateTypeCompatibility(
  parsedRules: readonly ParsedRuleAst[],
  sourceSchema: SchemaTree,
  targetSchema: SchemaTree,
  registry: FunctionRegistry,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const parsedRule of parsedRules) {
    if (parsedRule.ast === null) {
      continue;
    }

    const expectedTargetType = targetSchema.getTypeAtPath(parsedRule.rule.target);
    if (!isTypeKnown(expectedTargetType)) {
      continue;
    }

    const inferredExpressionType = inferType(parsedRule.ast, {
      registry,
      sourceSchema,
      arrayDepth: 0,
    });

    const actualType = isTypeKnown(inferredExpressionType)
      ? inferredExpressionType
      : mapRuleTypeToValueType(parsedRule.rule.type);

    if (!isTypeKnown(actualType)) {
      continue;
    }

    if (areTypesCompatible(actualType, expectedTargetType)) {
      continue;
    }

    diagnostics.push({
      code: 'KEYRA-E005',
      severity: 'error',
      message: `Type mismatch: rule produces \`${actualType}\`, target field \`${parsedRule.rule.target}\` expects \`${expectedTargetType}\``,
      ruleIndex: parsedRule.ruleIndex,
      targetPath: parsedRule.rule.target,
      expression: parsedRule.rule.expression,
      location: {
        function: 'validateTypeCompatibility',
      },
    });
  }

  return diagnostics;
}
