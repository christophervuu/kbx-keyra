import { DIAGNOSTIC_CODES } from '../diagnostics/codes.js';
import { formatDiagnosticMessage } from '../diagnostics/format.js';
import type { EvaluationContext } from '../dsl/types.js';
import type { FunctionImplementation, FunctionSignature } from '../types/index.js';
import type { ValueType } from '../types/options.js';
import type { FunctionRegistry } from '../registry/function-registry.js';

type CastTargetType = 'string' | 'number' | 'boolean';

const castSignature: FunctionSignature = {
  parameters: [
    { name: 'value', type: 'any', required: true },
    { name: 'targetType', type: 'string', required: true },
  ],
  returnType: 'any',
  handlesNull: true,
};

function getValueType(value: unknown): ValueType {
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

  return 'any';
}

function isCastTargetType(value: string): value is CastTargetType {
  return value === 'string' || value === 'number' || value === 'boolean';
}

function emitUnsupportedCast(
  context: EvaluationContext,
  fromType: ValueType,
  toType: string,
): null {
  context.addDiagnostic({
    code: DIAGNOSTIC_CODES['KEYRA-E020'].code,
    severity: DIAGNOSTIC_CODES['KEYRA-E020'].severity,
    message: formatDiagnosticMessage('KEYRA-E020', {
      fromType,
      toType,
    }),
    location: { function: 'cast' },
  });

  return null;
}

const castImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const value = args[0];
  const targetType = args[1] as string;

  if (value === null) {
    return null;
  }

  if (!isCastTargetType(targetType)) {
    context.addDiagnostic({
      code: DIAGNOSTIC_CODES['KEYRA-E021'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-E021'].severity,
      message: formatDiagnosticMessage('KEYRA-E021', {
        targetType,
      }),
      location: { function: 'cast', argumentIndex: 1 },
    });

    return null;
  }

  const fromType = getValueType(value);

  if (fromType === targetType) {
    return value;
  }

  if (fromType === 'string') {
    const stringValue = value as string;

    if (targetType === 'number') {
      if (stringValue.trim() === '') {
        return emitUnsupportedCast(context, fromType, targetType);
      }

      const parsed = Number(stringValue);

      if (Number.isNaN(parsed) || Number.isFinite(parsed) === false) {
        return emitUnsupportedCast(context, fromType, targetType);
      }

      return parsed;
    }

    if (targetType === 'boolean') {
      if (stringValue === 'true') {
        return true;
      }

      if (stringValue === 'false' || stringValue === '') {
        return false;
      }

      return true;
    }
  }

  if (fromType === 'number') {
    const numberValue = value as number;

    if (targetType === 'string') {
      return String(numberValue);
    }

    if (targetType === 'boolean') {
      return numberValue !== 0;
    }
  }

  if (fromType === 'boolean') {
    const booleanValue = value as boolean;

    if (targetType === 'string') {
      return booleanValue ? 'true' : 'false';
    }

    if (targetType === 'number') {
      return booleanValue ? 1 : 0;
    }
  }

  return emitUnsupportedCast(context, fromType, targetType);
};

export function registerTypeConversionFunctions(registry: FunctionRegistry): void {
  registry.registerFunction('cast', castSignature, castImplementation);
}
