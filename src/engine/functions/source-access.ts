import { DIAGNOSTIC_CODES } from '../diagnostics/codes.js';
import { formatDiagnosticMessage } from '../diagnostics/format.js';
import { resolvePath } from '../dsl/resolve-path.js';
import type { EvaluationContext } from '../dsl/types.js';
import type { FunctionImplementation, FunctionSignature } from '../types/index.js';
import type { FunctionRegistry } from '../registry/function-registry.js';

const sourceSignature: FunctionSignature = {
  parameters: [{ name: 'path', type: 'string', required: true }],
  returnType: 'any',
};

const itemSignature: FunctionSignature = {
  parameters: [{ name: 'path', type: 'string', required: true }],
  returnType: 'any',
};

const parentSignature: FunctionSignature = {
  parameters: [{ name: 'path', type: 'string', required: true }],
  returnType: 'any',
};

const constantSignature: FunctionSignature = {
  parameters: [{ name: 'name', type: 'string', required: true }],
  returnType: 'any',
};

const externalSignature: FunctionSignature = {
  parameters: [{ name: 'name', type: 'string', required: true }],
  returnType: 'any',
};

const staticSignature: FunctionSignature = {
  parameters: [{ name: 'value', type: 'any', required: true }],
  returnType: 'any',
  handlesNull: true,
};

const sourceImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const path = args[0] as string;
  const resolved = resolvePath(context.sourceData, path);

  if (resolved === null || resolved === undefined) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES['KEYRA-W002'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-W002'].severity,
      message: formatDiagnosticMessage('KEYRA-W002', { path }),
      location: { function: 'source', argumentIndex: 0 },
    });

    return null;
  }

  return resolved;
};

const itemImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  return resolvePath(context.currentItem, args[0] as string);
};

const parentImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  return resolvePath(context.parentItem, args[0] as string);
};

const constantImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const name = args[0] as string;

  if (!Object.hasOwn(context.constants, name)) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES['KEYRA-E011'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E011'].severity,
      message: formatDiagnosticMessage('KEYRA-E011', { name }),
      location: { function: 'constant', argumentIndex: 0 },
    });

    return null;
  }

  return context.constants[name];
};

const externalImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const name = args[0] as string;

  if (!Object.hasOwn(context.externalSources, name)) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES['KEYRA-E012'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E012'].severity,
      message: formatDiagnosticMessage('KEYRA-E012', { name }),
      location: { function: 'external', argumentIndex: 0 },
    });

    return null;
  }

  return context.externalSources[name];
};

const staticImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return args[0];
};

export function registerSourceAccessFunctions(registry: FunctionRegistry): void {
  registry.registerFunction('source', sourceSignature, sourceImplementation);
  registry.registerFunction('item', itemSignature, itemImplementation);
  registry.registerFunction('parent', parentSignature, parentImplementation);
  registry.registerFunction('constant', constantSignature, constantImplementation);
  registry.registerFunction('external', externalSignature, externalImplementation);
  registry.registerFunction('static', staticSignature, staticImplementation);
}
