import { DIAGNOSTIC_CODES } from '../diagnostics/codes.js';
import { formatDiagnosticMessage } from '../diagnostics/format.js';
import type { AstNode } from '../dsl/types.js';
import type {
  Diagnostic,
  MappingRule,
  MappingRuleNoMatchBehavior,
  MappingRuleProjectValueTableRef,
  ValueTablePrimitiveValue,
} from '../types/index.js';
import type { ParsedRuleAst } from './source-paths.js';

const TABLE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPrimitiveValue(value: unknown): value is ValueTablePrimitiveValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function inferPrimitiveType(value: ValueTablePrimitiveValue): 'string' | 'number' | 'boolean' {
  if (typeof value === 'string') {
    return 'string';
  }

  if (typeof value === 'number') {
    return 'number';
  }

  return 'boolean';
}

function findFunctionCall(node: AstNode, name: string): Extract<AstNode, { type: 'FunctionCall' }> | null {
  if (node.type === 'FunctionCall' && node.name === name) {
    return node;
  }

  if (node.type === 'FunctionCall') {
    for (const argument of node.arguments) {
      const match = findFunctionCall(argument, name);
      if (match) {
        return match;
      }
    }
    return null;
  }

  if (node.type === 'ObjectTemplate') {
    for (const property of node.properties) {
      const match = findFunctionCall(property.value, name);
      if (match) {
        return match;
      }
    }
  }

  return null;
}

function addDiagnostic(
  diagnostics: Diagnostic[],
  code: keyof typeof DIAGNOSTIC_CODES,
  ruleIndex: number,
  rule: MappingRule,
  locationFunction: string,
  params: Record<string, string>,
): void {
  diagnostics.push({
    code: DIAGNOSTIC_CODES[code].code,
    severity: DIAGNOSTIC_CODES[code].severity,
    message: formatDiagnosticMessage(code, params),
    ruleIndex,
    targetPath: rule.target,
    expression: rule.expression,
    location: {
      function: locationFunction,
    },
  });
}

function validateNoMatchBehavior(
  diagnostics: Diagnostic[],
  ruleIndex: number,
  rule: MappingRule,
  ref: MappingRuleProjectValueTableRef,
): void {
  const behavior = rule.noMatchBehavior;
  if (!behavior) {
    return;
  }

  if (behavior.mode !== 'fallback_value') {
    return;
  }

  if (!Object.hasOwn(behavior, 'fallbackValue')) {
    addDiagnostic(diagnostics, 'KEYRA-E066', ruleIndex, rule, 'valueMap', {});
    return;
  }

  const fallback = behavior.fallbackValue;
  if (!isPrimitiveValue(fallback)) {
    addDiagnostic(diagnostics, 'KEYRA-E067', ruleIndex, rule, 'valueMap', {
      expected: ref.outputType,
      actual: typeof fallback,
    });
    return;
  }

  if (inferPrimitiveType(fallback) !== ref.outputType) {
    addDiagnostic(diagnostics, 'KEYRA-E067', ruleIndex, rule, 'valueMap', {
      expected: ref.outputType,
      actual: inferPrimitiveType(fallback),
    });
  }
}

function validateProjectValueTableRef(
  diagnostics: Diagnostic[],
  ruleIndex: number,
  rule: MappingRule,
  ref: MappingRuleProjectValueTableRef,
  valueTableCall: Extract<AstNode, { type: 'FunctionCall' }> | null,
): void {
  if (!TABLE_KEY_PATTERN.test(ref.tableKey)) {
    addDiagnostic(diagnostics, 'KEYRA-E061', ruleIndex, rule, 'valueTable', {
      tableKey: ref.tableKey,
    });
  }

  if (!ref.valueTableId || !ref.revision || ref.revision < 1 || ref.resolvedEntries.length === 0) {
    addDiagnostic(diagnostics, 'KEYRA-E062', ruleIndex, rule, 'valueTable', {
      tableKey: ref.tableKey,
    });
  }

  if (ref.inputSideKey === ref.outputSideKey) {
    addDiagnostic(diagnostics, 'KEYRA-E063', ruleIndex, rule, 'valueTable', {
      sideKey: ref.inputSideKey,
    });
  }

  if (valueTableCall) {
    const [tableArg, inputArg, outputArg] = valueTableCall.arguments;
    if (!tableArg || tableArg.type !== 'StringLiteral' || tableArg.value !== ref.tableKey) {
      addDiagnostic(diagnostics, 'KEYRA-E061', ruleIndex, rule, 'valueTable', {
        tableKey: ref.tableKey,
      });
    }

    if (!inputArg || inputArg.type !== 'StringLiteral' || inputArg.value !== ref.inputSideKey) {
      addDiagnostic(diagnostics, 'KEYRA-E064', ruleIndex, rule, 'valueTable', {
        sideKey: ref.inputSideKey,
      });
    }

    if (!outputArg || outputArg.type !== 'StringLiteral' || outputArg.value !== ref.outputSideKey) {
      addDiagnostic(diagnostics, 'KEYRA-E064', ruleIndex, rule, 'valueTable', {
        sideKey: ref.outputSideKey,
      });
    }
  }

  const seenInputs = new Map<string, number>();
  for (const entry of ref.resolvedEntries) {
    if (!isPrimitiveValue(entry.in) || !isPrimitiveValue(entry.out)) {
      addDiagnostic(diagnostics, 'KEYRA-E062', ruleIndex, rule, 'valueTable', {
        tableKey: ref.tableKey,
      });
      continue;
    }

    if (inferPrimitiveType(entry.in) !== ref.inputType || inferPrimitiveType(entry.out) !== ref.outputType) {
      addDiagnostic(diagnostics, 'KEYRA-E064', ruleIndex, rule, 'valueTable', {
        sideKey: inferPrimitiveType(entry.in) !== ref.inputType ? ref.inputSideKey : ref.outputSideKey,
      });
    }

    const key = String(entry.in);
    const existing = seenInputs.get(key);
    if (existing !== undefined) {
      addDiagnostic(diagnostics, 'KEYRA-E065', ruleIndex, rule, 'valueTable', {
        sideKey: ref.inputSideKey,
        value: key,
      });
    } else {
      seenInputs.set(key, 1);
    }
  }

  validateNoMatchBehavior(diagnostics, ruleIndex, rule, ref);
}

export function validateValueTables(parsedRules: readonly ParsedRuleAst[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const parsedRule of parsedRules) {
    const { ruleIndex, rule, ast } = parsedRule;
    if (!ast) {
      continue;
    }

    const valueMapCall = findFunctionCall(ast, 'valueMap');
    if (!valueMapCall) {
      continue;
    }

    const mappingArg = valueMapCall.arguments[1];
    if (!mappingArg) {
      continue;
    }

    if (mappingArg.type !== 'ObjectTemplate' && !(mappingArg.type === 'FunctionCall' && mappingArg.name === 'valueTable')) {
      addDiagnostic(diagnostics, 'KEYRA-E060', ruleIndex, rule, 'valueMap', {});
      continue;
    }

    if (mappingArg.type === 'ObjectTemplate') {
      continue;
    }

    const ref = rule.valueTableRef;
    if (!ref || ref.scope !== 'project') {
      addDiagnostic(diagnostics, 'KEYRA-E062', ruleIndex, rule, 'valueTable', {
        tableKey: 'unknown',
      });
      continue;
    }

    validateProjectValueTableRef(diagnostics, ruleIndex, rule, ref, mappingArg);
  }

  return diagnostics;
}
