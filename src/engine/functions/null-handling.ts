import type { FunctionRegistry } from '../registry/function-registry.js';
import type { FunctionImplementation, FunctionSignature } from '../types/index.js';

const defaultSignature: FunctionSignature = {
  parameters: [
    { name: 'value', type: 'any', required: true },
    { name: 'fallback', type: 'any', required: true },
  ],
  returnType: 'any',
  handlesNull: true,
};

const coalesceSignature: FunctionSignature = {
  parameters: [
    { name: 'value', type: 'any', required: true },
    { name: 'rest', type: 'any', required: false, variadic: true },
  ],
  returnType: 'any',
  handlesNull: true,
};

const isNullSignature: FunctionSignature = {
  parameters: [{ name: 'value', type: 'any', required: true }],
  returnType: 'boolean',
  handlesNull: true,
};

const defaultImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return args[0] === null ? args[1] : args[0];
};

const coalesceImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  for (const value of args) {
    if (value !== null) {
      return value;
    }
  }

  return null;
};

const isNullImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return args[0] === null;
};

export function registerNullHandlingFunctions(registry: FunctionRegistry): void {
  registry.registerFunction('default', defaultSignature, defaultImplementation);
  registry.registerFunction('coalesce', coalesceSignature, coalesceImplementation);
  registry.registerFunction('isNull', isNullSignature, isNullImplementation);
}
