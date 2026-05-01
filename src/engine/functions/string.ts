import type { FunctionRegistry } from '../registry/function-registry.js';
import type { FunctionImplementation, FunctionSignature } from '../types/index.js';

const concatSignature: FunctionSignature = {
  parameters: [
    { name: 'value', type: 'string', required: true },
    { name: 'rest', type: 'string', required: false, variadic: true },
  ],
  returnType: 'string',
};

const substringSignature: FunctionSignature = {
  parameters: [
    { name: 'value', type: 'string', required: true },
    { name: 'start', type: 'number', required: true },
    { name: 'end', type: 'number', required: false },
  ],
  returnType: 'string',
};

const upperSignature: FunctionSignature = {
  parameters: [{ name: 'value', type: 'string', required: true }],
  returnType: 'string',
};

const lowerSignature: FunctionSignature = {
  parameters: [{ name: 'value', type: 'string', required: true }],
  returnType: 'string',
};

const trimSignature: FunctionSignature = {
  parameters: [{ name: 'value', type: 'string', required: true }],
  returnType: 'string',
};

const replaceSignature: FunctionSignature = {
  parameters: [
    { name: 'value', type: 'string', required: true },
    { name: 'search', type: 'string', required: true },
    { name: 'replacement', type: 'string', required: true },
  ],
  returnType: 'string',
};

const replaceAllSignature: FunctionSignature = {
  parameters: [
    { name: 'value', type: 'string', required: true },
    { name: 'search', type: 'string', required: true },
    { name: 'replacement', type: 'string', required: true },
  ],
  returnType: 'string',
};

const containsSignature: FunctionSignature = {
  parameters: [
    { name: 'haystack', type: 'string', required: true },
    { name: 'needle', type: 'string', required: true },
  ],
  returnType: 'boolean',
  handlesNull: true,
};

const lengthSignature: FunctionSignature = {
  parameters: [{ name: 'value', type: 'string', required: true }],
  returnType: 'number',
};

const concatImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return (args as readonly string[]).join('');
};

const substringImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  const value = args[0] as string;
  const start = args[1] as number;
  const end = args[2] as number | undefined;

  const resolvedStart = start < 0 ? Math.max(0, value.length + start) : start;

  if (end === undefined) {
    return value.slice(resolvedStart);
  }

  const resolvedEnd = end < 0 ? Math.max(0, value.length + end) : end;
  return value.slice(resolvedStart, resolvedEnd);
};

const upperImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return (args[0] as string).toUpperCase();
};

const lowerImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return (args[0] as string).toLowerCase();
};

const trimImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return (args[0] as string).trim();
};

const replaceImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return (args[0] as string).replace(args[1] as string, args[2] as string);
};

const replaceAllImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return (args[0] as string).replaceAll(args[1] as string, args[2] as string);
};

const containsImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  const haystack = args[0] as string | null;
  const needle = args[1] as string | null;

  if (haystack === null || needle === null) {
    return false;
  }

  return haystack.includes(needle);
};

const lengthImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return (args[0] as string).length;
};

export function registerStringFunctions(registry: FunctionRegistry): void {
  registry.registerFunction('concat', concatSignature, concatImplementation);
  registry.registerFunction('substring', substringSignature, substringImplementation);
  registry.registerFunction('upper', upperSignature, upperImplementation);
  registry.registerFunction('lower', lowerSignature, lowerImplementation);
  registry.registerFunction('trim', trimSignature, trimImplementation);
  registry.registerFunction('replace', replaceSignature, replaceImplementation);
  registry.registerFunction('replaceAll', replaceAllSignature, replaceAllImplementation);
  registry.registerFunction('contains', containsSignature, containsImplementation);
  registry.registerFunction('length', lengthSignature, lengthImplementation);
}
