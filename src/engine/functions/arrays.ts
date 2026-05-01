import { DIAGNOSTIC_CODES } from '../diagnostics/codes.js';
import { formatDiagnosticMessage } from '../diagnostics/format.js';
import { resolvePath } from '../dsl/resolve-path.js';
import type { Diagnostic } from '../types/results.js';
import type { AstNode, EvaluationContext } from '../dsl/types.js';
import type { FunctionImplementation, FunctionSignature } from '../types/index.js';
import type { FunctionRegistry } from '../registry/function-registry.js';

const mapSignature: FunctionSignature = {
  parameters: [
    { name: 'array', type: 'array', required: true },
    { name: 'templateOrExpression', type: 'any', required: true },
  ],
  returnType: 'array',
  handlesNull: true,
  lazyArgs: [1],
};

const filterSignature: FunctionSignature = {
  parameters: [
    { name: 'array', type: 'array', required: true },
    { name: 'condition', type: 'any', required: true },
  ],
  returnType: 'array',
  handlesNull: true,
  lazyArgs: [1],
};

const findSignature: FunctionSignature = {
  parameters: [
    { name: 'array', type: 'array', required: true },
    { name: 'condition', type: 'any', required: true },
  ],
  returnType: 'any',
  handlesNull: true,
  lazyArgs: [1],
};

const arraySignature: FunctionSignature = {
  parameters: [
    { name: 'value', type: 'any', required: true },
    { name: 'rest', type: 'any', required: false, variadic: true },
  ],
  returnType: 'array',
  handlesNull: true,
};

const mergeSignature: FunctionSignature = {
  parameters: [
    { name: 'array', type: 'any', required: true },
    { name: 'rest', type: 'any', required: false, variadic: true },
  ],
  returnType: 'array',
  handlesNull: true,
};

const flattenSignature: FunctionSignature = {
  parameters: [{ name: 'array', type: 'array', required: true }],
  returnType: 'array',
};

const firstSignature: FunctionSignature = {
  parameters: [{ name: 'array', type: 'array', required: true }],
  returnType: 'any',
};

const nthSignature: FunctionSignature = {
  parameters: [
    { name: 'array', type: 'array', required: true },
    { name: 'index', type: 'number', required: true },
  ],
  returnType: 'any',
};

const joinSignature: FunctionSignature = {
  parameters: [
    { name: 'array', type: 'array', required: true },
    { name: 'separator', type: 'string', required: true },
  ],
  returnType: 'string',
  handlesNull: true,
};

const countSignature: FunctionSignature = {
  parameters: [{ name: 'array', type: 'array', required: true }],
  returnType: 'number',
  handlesNull: true,
};

const getSignature: FunctionSignature = {
  parameters: [
    { name: 'object', type: 'any', required: true },
    { name: 'path', type: 'string', required: true },
  ],
  returnType: 'any',
  handlesNull: true,
};

function isAstNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && 'type' in value;
}

const mapImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const arrayValue = args[0];
  const templateNode = args[1];

  if (arrayValue === null) {
    return null;
  }

  if (!Array.isArray(arrayValue)) {
    return null;
  }

  if (!isAstNode(templateNode)) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES['KEYRA-E015'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E015'].severity,
      message: formatDiagnosticMessage('KEYRA-E015', {}),
      location: {
        function: 'map',
        argumentIndex: 1,
      },
    });

    return null;
  }

  const result: unknown[] = [];

  for (const element of arrayValue) {
    context.pushScope(element);

    try {
      const evaluation = context.evaluate(templateNode, context);
      for (const diagnostic of evaluation.diagnostics) {
        context.addDiagnostic(diagnostic);
      }

      result.push(evaluation.value);
    } finally {
      context.popScope();
    }
  }

  return result;
};

function appendDiagnostics(context: EvaluationContext, diagnostics: readonly Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    context.addDiagnostic(diagnostic);
  }
}

function emitConditionTypeDiagnostic(context: EvaluationContext, functionName: 'filter' | 'find'): void {
  context.addDiagnostic({
    code: DIAGNOSTIC_CODES['KEYRA-E017'].code,
    severity: DIAGNOSTIC_CODES['KEYRA-E017'].severity,
    message: formatDiagnosticMessage('KEYRA-E017', {}),
    location: {
      function: functionName,
      argumentIndex: 1,
    },
  });
}

function getTypeName(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (typeof value === 'string') {
    return 'string';
  }

  if (typeof value === 'number') {
    return 'number';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (typeof value === 'object') {
    return 'object';
  }

  return typeof value;
}

const filterImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const arrayValue = args[0];
  const conditionNode = args[1];

  if (arrayValue === null) {
    return null;
  }

  if (!Array.isArray(arrayValue)) {
    return null;
  }

  if (!isAstNode(conditionNode)) {
    emitConditionTypeDiagnostic(context, 'filter');
    return [];
  }

  const result: unknown[] = [];

  for (const element of arrayValue) {
    context.pushScope(element);

    try {
      const conditionResult = context.evaluate(conditionNode, context);
      appendDiagnostics(context, conditionResult.diagnostics);

      if (conditionResult.value === true) {
        result.push(element);
        continue;
      }

      if (conditionResult.value !== null && typeof conditionResult.value !== 'boolean') {
        emitConditionTypeDiagnostic(context, 'filter');
      }
    } finally {
      context.popScope();
    }
  }

  if (arrayValue.length > 0 && result.length === 0) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES['KEYRA-E016'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E016'].severity,
      message: formatDiagnosticMessage('KEYRA-E016', {}),
      location: {
        function: 'filter',
      },
    });
  }

  return result;
};

const findImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const arrayValue = args[0];
  const conditionNode = args[1];

  if (arrayValue === null) {
    return null;
  }

  if (!Array.isArray(arrayValue)) {
    return null;
  }

  if (arrayValue.length === 0) {
    return null;
  }

  if (!isAstNode(conditionNode)) {
    emitConditionTypeDiagnostic(context, 'find');
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES['KEYRA-E019'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E019'].severity,
      message: formatDiagnosticMessage('KEYRA-E019', {}),
      location: {
        function: 'find',
      },
    });
    return null;
  }

  for (const element of arrayValue) {
    context.pushScope(element);

    try {
      const conditionResult = context.evaluate(conditionNode, context);
      appendDiagnostics(context, conditionResult.diagnostics);

      if (conditionResult.value === true) {
        return element;
      }

      if (conditionResult.value !== null && typeof conditionResult.value !== 'boolean') {
        emitConditionTypeDiagnostic(context, 'find');
      }
    } finally {
      context.popScope();
    }
  }

  context.addDiagnostic({
    code: DIAGNOSTIC_CODES['KEYRA-E019'].code,
    severity: DIAGNOSTIC_CODES['KEYRA-E019'].severity,
    message: formatDiagnosticMessage('KEYRA-E019', {}),
    location: {
      function: 'find',
    },
  });
  return null;
};

const arrayImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return [...args];
};

const mergeImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const result: unknown[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === null) {
      continue;
    }

    if (!Array.isArray(arg)) {
      context.addDiagnostic({
        code: DIAGNOSTIC_CODES['KEYRA-E005'].code,
        severity: DIAGNOSTIC_CODES['KEYRA-E005'].severity,
        message: formatDiagnosticMessage('KEYRA-E005', {
          function: 'merge',
          expected: 'array',
          actual: getTypeName(arg),
          argName: 'array',
        }),
        location: {
          function: 'merge',
          argumentIndex: index,
        },
      });
      continue;
    }

    result.push(...arg);
  }

  return result;
};

const flattenImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  const input = args[0] as unknown[];
  const result: unknown[] = [];

  for (const element of input) {
    if (Array.isArray(element)) {
      result.push(...element);
      continue;
    }

    result.push(element);
  }

  return result;
};

const firstImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  const input = args[0] as unknown[];
  if (input.length === 0) {
    return null;
  }

  return input[0];
};

const nthImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const input = args[0] as unknown[];
  const rawIndex = args[1] as number;

  const normalizedIndex = rawIndex < 0 ? input.length + rawIndex : rawIndex;
  if (normalizedIndex < 0 || normalizedIndex >= input.length) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES['KEYRA-W004'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-W004'].severity,
      message: formatDiagnosticMessage('KEYRA-W004', {
        index: String(rawIndex),
        length: String(input.length),
      }),
      location: {
        function: 'nth',
        argumentIndex: 1,
      },
    });
    return null;
  }

  return input[normalizedIndex];
};

const joinImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const input = args[0];
  const separator = args[1] as string;

  if (input === null) {
    return null;
  }

  if (!Array.isArray(input)) {
    return null;
  }

  const parts: string[] = [];

  for (let index = 0; index < input.length; index += 1) {
    const element = input[index];

    if (element === null) {
      continue;
    }

    if (typeof element !== 'string') {
      context.addDiagnostic({
        code: DIAGNOSTIC_CODES['KEYRA-E005'].code,
        severity: DIAGNOSTIC_CODES['KEYRA-E005'].severity,
        message: formatDiagnosticMessage('KEYRA-E005', {
          function: 'join',
          expected: 'string',
          actual: getTypeName(element),
          argName: 'array',
        }),
        location: {
          function: 'join',
          argumentIndex: 0,
        },
      });

      continue;
    }

    parts.push(element);
  }

  return parts.join(separator);
};

const countImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  const input = args[0];

  if (input === null) {
    return 0;
  }

  if (!Array.isArray(input)) {
    return 0;
  }

  return input.length;
};

const getImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const objectValue = args[0];
  const path = args[1] as string;

  if (objectValue === null) {
    return null;
  }

  if (typeof objectValue !== 'object' || Array.isArray(objectValue)) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES['KEYRA-E018'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E018'].severity,
      message: formatDiagnosticMessage('KEYRA-E018', {
        type: getTypeName(objectValue),
      }),
      location: {
        function: 'get',
        argumentIndex: 0,
      },
    });

    return null;
  }

  const resolved = resolvePath(objectValue, path);
  return resolved === undefined ? null : resolved;
};

export function registerArrayFunctions(registry: FunctionRegistry): void {
  registry.registerFunction('map', mapSignature, mapImplementation);
  registry.registerFunction('filter', filterSignature, filterImplementation);
  registry.registerFunction('find', findSignature, findImplementation);
  registry.registerFunction('array', arraySignature, arrayImplementation);
  registry.registerFunction('merge', mergeSignature, mergeImplementation);
  registry.registerFunction('flatten', flattenSignature, flattenImplementation);
  registry.registerFunction('first', firstSignature, firstImplementation);
  registry.registerFunction('nth', nthSignature, nthImplementation);
  registry.registerFunction('join', joinSignature, joinImplementation);
  registry.registerFunction('count', countSignature, countImplementation);
  registry.registerFunction('get', getSignature, getImplementation);
}
