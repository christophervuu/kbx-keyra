import { DIAGNOSTIC_CODES } from '../diagnostics/codes.js';
import { formatDiagnosticMessage } from '../diagnostics/format.js';
import type { EvaluationContext } from '../dsl/types.js';
import type { FunctionRegistry } from '../registry/function-registry.js';
import type {
  FunctionImplementation,
  FunctionSignature,
  MappingRuleNoMatchBehavior,
  MappingRuleProjectValueTableRef,
  ValueTablePrimitiveValue,
} from '../types/index.js';

const valueMapSignature: FunctionSignature = {
  parameters: [
    { name: 'value', type: 'any', required: true },
    { name: 'mappings', type: 'any', required: true },
    { name: 'fallback', type: 'any', required: false },
  ],
  returnType: 'any',
  handlesNull: true,
};

const valueTableSignature: FunctionSignature = {
  parameters: [
    { name: 'tableKey', type: 'string', required: true },
    { name: 'inputSideKey', type: 'string', required: true },
    { name: 'outputSideKey', type: 'string', required: true },
  ],
  returnType: 'object',
};

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValueTableRef(value: unknown): value is MappingRuleProjectValueTableRef {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    value.scope === 'project'
    && typeof value.tableKey === 'string'
    && typeof value.inputSideKey === 'string'
    && typeof value.outputSideKey === 'string'
    && Array.isArray(value.resolvedEntries)
  );
}

function resolveNoMatch(
  value: unknown,
  fallback: unknown,
  hasFallback: boolean,
  behavior: MappingRuleNoMatchBehavior | undefined,
): unknown {
  if (!behavior) {
    return hasFallback ? fallback : null;
  }

  switch (behavior.mode) {
    case 'return_input':
      return value;
    case 'fallback_value':
      return behavior.fallbackValue ?? (hasFallback ? fallback : null);
    case 'return_null':
    default:
      return null;
  }
}

function isPrimitiveValue(value: unknown): value is ValueTablePrimitiveValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

const valueMapImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const value = args[0];
  const mappings = args[1];
  const hasFallback = args.length >= 3;
  const fallback = hasFallback ? args[2] : null;
  const currentRule = context.currentRule;

  if (value === null) {
    return resolveNoMatch(value, fallback, hasFallback, currentRule?.noMatchBehavior);
  }

  if (isValueTableRef(mappings)) {
    const key = String(value);
    const match = mappings.resolvedEntries.find((entry) => String(entry.in) === key);

    if (match) {
      return match.out;
    }

    context.addDiagnostic({
      code: DIAGNOSTIC_CODES['KEYRA-W003'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-W003'].severity,
      message: formatDiagnosticMessage('KEYRA-W003', { value: key }),
      location: { function: 'valueMap', argumentIndex: 0 },
    });

    return resolveNoMatch(value, fallback, hasFallback, currentRule?.noMatchBehavior);
  }

  if (!isPlainObject(mappings)) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES['KEYRA-E060'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E060'].severity,
      message: formatDiagnosticMessage('KEYRA-E060', {}),
      location: { function: 'valueMap', argumentIndex: 1 },
    });

    return null;
  }

  const key = String(value);

  if (Object.hasOwn(mappings, key)) {
    return mappings[key];
  }

  context.addDiagnostic({
    code: DIAGNOSTIC_CODES['KEYRA-W003'].code,
    severity: DIAGNOSTIC_CODES['KEYRA-W003'].severity,
    message: formatDiagnosticMessage('KEYRA-W003', { value: key }),
    location: { function: 'valueMap', argumentIndex: 0 },
  });

  return resolveNoMatch(value, fallback, hasFallback, currentRule?.noMatchBehavior);
};

const valueTableImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const tableKey = args[0];
  const inputSideKey = args[1];
  const outputSideKey = args[2];

  if (typeof tableKey !== 'string' || typeof inputSideKey !== 'string' || typeof outputSideKey !== 'string') {
    return null;
  }

  const currentRule = context.currentRule;
  const ref = currentRule?.valueTableRef;

  if (!ref || ref.scope !== 'project') {
    return null;
  }

  if (
    ref.tableKey !== tableKey
    || ref.inputSideKey !== inputSideKey
    || ref.outputSideKey !== outputSideKey
    || !Array.isArray(ref.resolvedEntries)
  ) {
    return null;
  }

  const tableRecord: Record<string, ValueTablePrimitiveValue> = {};
  for (const entry of ref.resolvedEntries) {
    if (!isPrimitiveValue(entry.in) || !isPrimitiveValue(entry.out)) {
      continue;
    }

    tableRecord[String(entry.in)] = entry.out;
  }

  return {
    ...tableRecord,
    scope: ref.scope,
    valueTableId: ref.valueTableId,
    tableKey: ref.tableKey,
    revision: ref.revision,
    inputSideKey: ref.inputSideKey,
    outputSideKey: ref.outputSideKey,
    inputType: ref.inputType,
    outputType: ref.outputType,
    resolvedEntries: ref.resolvedEntries,
  };
};

export function registerLookupFunctions(registry: FunctionRegistry): void {
  registry.registerFunction('valueMap', valueMapSignature, valueMapImplementation);
  registry.registerFunction('valueTable', valueTableSignature, valueTableImplementation);
}
