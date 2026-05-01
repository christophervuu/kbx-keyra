import type { AstNode } from '../dsl/types.js';
import type { FunctionRegistry } from '../registry/function-registry.js';
import type { ValueType } from '../types/index.js';
import type { SchemaTree } from './schema-tree.js';

export interface TypeInferenceContext {
  readonly registry: FunctionRegistry;
  readonly sourceSchema: SchemaTree;
  readonly arrayDepth: number;
  readonly currentItemPath?: string;
  readonly parentItemPath?: string;
}

const TYPE_LITERALS: readonly ValueType[] = [
  'string',
  'number',
  'boolean',
  'null',
  'array',
  'object',
  'any',
];

function isValueType(value: string): value is ValueType {
  return TYPE_LITERALS.includes(value as ValueType);
}

export function inferType(node: AstNode, context: TypeInferenceContext): ValueType | undefined {
  switch (node.type) {
    case 'StringLiteral':
      return 'string';
    case 'NumberLiteral':
      return 'number';
    case 'BooleanLiteral':
      return 'boolean';
    case 'NullLiteral':
      return 'null';
    case 'ObjectTemplate':
      return 'object';
    case 'FunctionCall':
      return inferFunctionCallType(node, context);
    default:
      return undefined;
  }
}

function inferFunctionCallType(
  node: Extract<AstNode, { type: 'FunctionCall' }>,
  context: TypeInferenceContext,
): ValueType | undefined {
  switch (node.name) {
    case 'source': {
      const pathArgument = node.arguments[0];
      if (!pathArgument || pathArgument.type !== 'StringLiteral') {
        return 'any';
      }

      return context.sourceSchema.getTypeAtPath(pathArgument.value) ?? 'any';
    }

    case 'cast': {
      const targetTypeArgument = node.arguments[1];
      if (!targetTypeArgument || targetTypeArgument.type !== 'StringLiteral') {
        return undefined;
      }

      return isValueType(targetTypeArgument.value) ? targetTypeArgument.value : undefined;
    }

    case 'map':
    case 'filter':
      return 'array';

    case 'find': {
      const arrayArgument = node.arguments[0];
      if (!arrayArgument) {
        return 'any';
      }

      inferType(arrayArgument, context);
      return 'any';
    }

    case 'if': {
      const thenArgument = node.arguments[1];
      const elseArgument = node.arguments[2];
      if (!thenArgument || !elseArgument) {
        return undefined;
      }

      const thenType = inferType(thenArgument, context);
      const elseType = inferType(elseArgument, context);
      if (!thenType || !elseType) {
        return undefined;
      }

      return thenType === elseType ? thenType : 'any';
    }

    case 'static': {
      const valueArgument = node.arguments[0];
      if (!valueArgument) {
        return undefined;
      }

      return inferType(valueArgument, context);
    }

    case 'item': {
      if (context.arrayDepth < 1) {
        return 'any';
      }

      const pathArgument = node.arguments[0];
      if (!pathArgument || pathArgument.type !== 'StringLiteral') {
        return 'any';
      }

      const scopedPath = context.currentItemPath
        ? pathArgument.value.length === 0
          ? context.currentItemPath
          : `${context.currentItemPath}.${pathArgument.value}`
        : pathArgument.value;

      return context.sourceSchema.getTypeAtPath(scopedPath) ?? 'any';
    }

    case 'parent': {
      if (context.arrayDepth < 2) {
        return 'any';
      }

      const pathArgument = node.arguments[0];
      if (!pathArgument || pathArgument.type !== 'StringLiteral') {
        return 'any';
      }

      const scopedPath = context.parentItemPath
        ? pathArgument.value.length === 0
          ? context.parentItemPath
          : `${context.parentItemPath}.${pathArgument.value}`
        : pathArgument.value;

      return context.sourceSchema.getTypeAtPath(scopedPath) ?? 'any';
    }

    default:
      break;
  }

  const registered = context.registry.getFunction(node.name);
  if (!registered) {
    return undefined;
  }

  if (registered.signature.returnType === 'any') {
    return undefined;
  }

  return registered.signature.returnType;
}
