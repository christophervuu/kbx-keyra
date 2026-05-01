import { DIAGNOSTIC_CODES } from '../diagnostics/codes.js';
import { formatDiagnosticMessage } from '../diagnostics/format.js';
import type { EvaluationContext } from '../dsl/types.js';
import type { FunctionRegistry } from '../registry/function-registry.js';
import type { FunctionImplementation, FunctionSignature } from '../types/index.js';

const valueMapSignature: FunctionSignature = {
  parameters: [
    { name: 'value', type: 'any', required: true },
    { name: 'mappings', type: 'any', required: true },
    { name: 'fallback', type: 'any', required: false },
  ],
  returnType: 'any',
  handlesNull: true,
};

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const valueMapImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const value = args[0];
  const mappings = args[1];
  const hasFallback = args.length >= 3;
  const fallback = hasFallback ? args[2] : null;

  if (value === null) {
    return fallback;
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

  return fallback;
};

export function registerLookupFunctions(registry: FunctionRegistry): void {
  registry.registerFunction('valueMap', valueMapSignature, valueMapImplementation);
}
