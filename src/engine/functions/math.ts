import { DIAGNOSTIC_CODES } from '../diagnostics/codes.js';
import { formatDiagnosticMessage } from '../diagnostics/format.js';
import type { EvaluationContext } from '../dsl/types.js';
import type { FunctionRegistry } from '../registry/function-registry.js';
import type { FunctionImplementation, FunctionSignature } from '../types/index.js';

const addSignature: FunctionSignature = {
  parameters: [
    { name: 'a', type: 'number', required: true },
    { name: 'b', type: 'number', required: true },
  ],
  returnType: 'number',
};

const subtractSignature: FunctionSignature = {
  parameters: [
    { name: 'a', type: 'number', required: true },
    { name: 'b', type: 'number', required: true },
  ],
  returnType: 'number',
};

const multiplySignature: FunctionSignature = {
  parameters: [
    { name: 'a', type: 'number', required: true },
    { name: 'b', type: 'number', required: true },
  ],
  returnType: 'number',
};

const divideSignature: FunctionSignature = {
  parameters: [
    { name: 'a', type: 'number', required: true },
    { name: 'b', type: 'number', required: true },
  ],
  returnType: 'number',
};

const roundSignature: FunctionSignature = {
  parameters: [
    { name: 'value', type: 'number', required: true },
    { name: 'decimals', type: 'number', required: false },
  ],
  returnType: 'number',
};

const absSignature: FunctionSignature = {
  parameters: [{ name: 'value', type: 'number', required: true }],
  returnType: 'number',
};

const addImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return (args[0] as number) + (args[1] as number);
};

const subtractImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return (args[0] as number) - (args[1] as number);
};

const multiplyImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return (args[0] as number) * (args[1] as number);
};

const divideImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const a = args[0] as number;
  const b = args[1] as number;

  if (b === 0) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES['KEYRA-E050'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E050'].severity,
      message: formatDiagnosticMessage('KEYRA-E050', {}),
      location: { function: 'divide', argumentIndex: 1 },
    });

    return null;
  }

  return a / b;
};

const roundImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  const value = args[0] as number;
  const decimals = (args[1] as number | undefined) ?? 0;

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const absImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return Math.abs(args[0] as number);
};

export function registerMathFunctions(registry: FunctionRegistry): void {
  registry.registerFunction('add', addSignature, addImplementation);
  registry.registerFunction('subtract', subtractSignature, subtractImplementation);
  registry.registerFunction('multiply', multiplySignature, multiplyImplementation);
  registry.registerFunction('divide', divideSignature, divideImplementation);
  registry.registerFunction('round', roundSignature, roundImplementation);
  registry.registerFunction('abs', absSignature, absImplementation);
}
