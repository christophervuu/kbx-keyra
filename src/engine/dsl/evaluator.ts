import { DIAGNOSTIC_CODES } from '../diagnostics/codes.js';
import { formatDiagnosticMessage } from '../diagnostics/format.js';
import type { Diagnostic } from '../types/results.js';
import type { FunctionParameter, RegisteredFunction } from '../types/registry.js';
import type {
  AstNode,
  EvaluationContext,
  EvaluationResult,
  EvaluatorTraceEntry,
} from './types.js';

const DEFAULT_MAX_RECURSION_DEPTH = 32;

interface InternalState {
  readonly depth: number;
  readonly diagnostics: Diagnostic[];
  readonly trace: EvaluatorTraceEntry[];
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

function addDiagnostic(state: InternalState, diagnostic: Diagnostic): void {
  state.diagnostics.push(diagnostic);
}

function addTrace(
  state: InternalState,
  context: EvaluationContext,
  node: AstNode,
  outputValue: unknown,
  inputValue?: unknown,
): void {
  if (context.options.trace !== true) {
    return;
  }

  const verbosity = context.options.traceVerbosity ?? 'functions';
  if (verbosity === 'functions' && node.type !== 'FunctionCall') {
    return;
  }

  state.trace.push({
    nodeType: node.type,
    functionName: node.type === 'FunctionCall' ? node.name : undefined,
    inputValue,
    outputValue,
  });
}

function getArityInfo(parameters: readonly FunctionParameter[]): { min: number; max: number } {
  const min = parameters.filter((parameter) => parameter.required && parameter.variadic !== true).length;
  const hasVariadic = parameters.some((parameter) => parameter.variadic === true);

  return {
    min,
    max: hasVariadic ? Number.POSITIVE_INFINITY : parameters.length,
  };
}

function formatExpectedArity(min: number, max: number): string {
  if (max === Number.POSITIVE_INFINITY) {
    return `${min}+`;
  }

  if (min === max) {
    return String(min);
  }

  return `${min}-${max}`;
}

function matchesType(value: unknown, expectedType: FunctionParameter['type']): boolean {
  if (expectedType === 'any') {
    return true;
  }

  if (expectedType === 'null') {
    return value === null;
  }

  if (expectedType === 'array') {
    return Array.isArray(value);
  }

  if (expectedType === 'object') {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  return typeof value === expectedType;
}

function withExecutionContext(context: EvaluationContext): EvaluationContext {
  const stack = context.scopeStack;
  const currentItem = stack.length >= 1 ? stack[stack.length - 1] : undefined;
  const parentItem = stack.length >= 2 ? stack[stack.length - 2] : undefined;

  return {
    ...context,
    currentItem,
    parentItem,
  };
}

function evaluateNode(node: AstNode, context: EvaluationContext, state: InternalState): unknown {
  const maxDepth = context.options.maxRecursionDepth ?? DEFAULT_MAX_RECURSION_DEPTH;

  if (state.depth >= maxDepth) {
    addDiagnostic(state, {
      code: DIAGNOSTIC_CODES['KEYRA-E004'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E004'].severity,
      message: formatDiagnosticMessage('KEYRA-E004', {
        depth: String(maxDepth),
      }),
      location: node.type === 'FunctionCall' ? { function: node.name } : undefined,
    });

    addTrace(state, context, node, null);
    return null;
  }

  const nextState: InternalState = {
    depth: state.depth + 1,
    diagnostics: state.diagnostics,
    trace: state.trace,
  };

  if (node.type === 'StringLiteral') {
    addTrace(state, context, node, node.value, node.value);
    return node.value;
  }

  if (node.type === 'NumberLiteral') {
    addTrace(state, context, node, node.value, node.value);
    return node.value;
  }

  if (node.type === 'BooleanLiteral') {
    addTrace(state, context, node, node.value, node.value);
    return node.value;
  }

  if (node.type === 'NullLiteral') {
    addTrace(state, context, node, null, null);
    return null;
  }

  if (node.type === 'ObjectTemplate') {
    const obj: Record<string, unknown> = {};

    for (const property of node.properties) {
      obj[property.key] = evaluateNode(property.value, context, nextState);
    }

    addTrace(state, context, node, obj);
    return obj;
  }

  return evaluateFunctionCall(node, context, nextState);
}

function evaluateFunctionCall(
  node: Extract<AstNode, { type: 'FunctionCall' }>,
  context: EvaluationContext,
  state: InternalState,
): unknown {
  const registered = context.registry.getFunction(node.name);

  if (registered === undefined) {
    addDiagnostic(state, {
      code: DIAGNOSTIC_CODES['KEYRA-E002'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E002'].severity,
      message: formatDiagnosticMessage('KEYRA-E002', { name: node.name }),
      location: { function: node.name },
    });
    addTrace(state, context, node, null);
    return null;
  }

  const actualArgCount = node.arguments.length;
  const arity = getArityInfo(registered.signature.parameters);
  if (actualArgCount < arity.min || actualArgCount > arity.max) {
    addDiagnostic(state, {
      code: DIAGNOSTIC_CODES['KEYRA-E003'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E003'].severity,
      message: formatDiagnosticMessage('KEYRA-E003', {
        name: node.name,
        expected: formatExpectedArity(arity.min, arity.max),
        actual: String(actualArgCount),
      }),
      location: { function: node.name },
    });
    addTrace(state, context, node, null);
    return null;
  }

  const args = node.arguments.map((argument) => evaluateNode(argument, context, state));

  if (registered.signature.handlesNull !== true) {
    for (let index = 0; index < registered.signature.parameters.length; index += 1) {
      const parameter = registered.signature.parameters[index];
      const arg = args[index];

      if (parameter?.required === true && arg === null) {
        addDiagnostic(state, {
          code: DIAGNOSTIC_CODES['KEYRA-W001'].code,
          severity: DIAGNOSTIC_CODES['KEYRA-W001'].severity,
          message: formatDiagnosticMessage('KEYRA-W001', {
            function: node.name,
            argName: parameter.name,
          }),
          location: {
            function: node.name,
            argumentIndex: index,
          },
        });
        addTrace(state, context, node, null, args);
        return null;
      }
    }
  }

  const typeMismatch = findTypeMismatch(registered, args);
  if (typeMismatch !== null) {
    addDiagnostic(state, {
      code: DIAGNOSTIC_CODES['KEYRA-E005'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E005'].severity,
      message: formatDiagnosticMessage('KEYRA-E005', {
        function: node.name,
        expected: typeMismatch.expected,
        actual: typeMismatch.actual,
        argName: typeMismatch.argName,
      }),
      location: {
        function: node.name,
        argumentIndex: typeMismatch.argumentIndex,
      },
    });
    addTrace(state, context, node, null, args);
    return null;
  }

  const invocationContext = withExecutionContext(context);

  if (node.name === 'item' && invocationContext.currentItem === undefined) {
    addDiagnostic(state, {
      code: DIAGNOSTIC_CODES['KEYRA-E010'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E010'].severity,
      message: formatDiagnosticMessage('KEYRA-E010', {}),
      location: { function: node.name },
    });
    addTrace(state, context, node, null, args);
    return null;
  }

  if (node.name === 'parent' && invocationContext.parentItem === undefined) {
    addDiagnostic(state, {
      code: DIAGNOSTIC_CODES['KEYRA-E013'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E013'].severity,
      message: formatDiagnosticMessage('KEYRA-E013', {}),
      location: { function: node.name },
    });
    addTrace(state, context, node, null, args);
    return null;
  }

  try {
    const value = registered.implementation(args, invocationContext);
    addTrace(state, context, node, value, args);
    return value;
  } catch (error) {
    addDiagnostic(state, {
      code: DIAGNOSTIC_CODES['KEYRA-E002'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E002'].severity,
      message: formatDiagnosticMessage('KEYRA-E002', {
        name: `${node.name} (implementation error: ${String(error)})`,
      }),
      location: { function: node.name },
    });
    addTrace(state, context, node, null, args);
    return null;
  }
}

function findTypeMismatch(
  registered: RegisteredFunction,
  args: readonly unknown[],
): {
  argumentIndex: number;
  expected: string;
  actual: string;
  argName: string;
} | null {
  const parameters = registered.signature.parameters;

  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    if (parameter === undefined) {
      continue;
    }

    const arg = args[index];

    if (arg === undefined || arg === null) {
      continue;
    }

    if (!matchesType(arg, parameter.type)) {
      return {
        argumentIndex: index,
        expected: parameter.type,
        actual: getTypeName(arg),
        argName: parameter.name,
      };
    }
  }

  return null;
}

export function evaluate(node: AstNode, context: EvaluationContext): EvaluationResult {
  const diagnostics: Diagnostic[] = [];
  const trace: EvaluatorTraceEntry[] = [];

  const state: InternalState = {
    depth: 0,
    diagnostics,
    trace,
  };

  const rootContext: EvaluationContext = {
    ...context,
    evaluate,
    addDiagnostic: (diagnostic: Diagnostic): void => {
      diagnostics.push(diagnostic);
    },
  };

  const value = evaluateNode(node, rootContext, state);

  return {
    value,
    diagnostics,
    trace: rootContext.options.trace === true ? trace : undefined,
  };
}
