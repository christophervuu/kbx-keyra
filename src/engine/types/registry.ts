import type { ValueType } from './options.js';

export interface ExecutionContext {
  readonly ruleIndex?: number;
  readonly targetPath?: string;
  readonly currentItem?: unknown;
  readonly parentItem?: unknown;
  readonly variables?: Readonly<Record<string, unknown>>;
}

export interface FunctionParameter {
  readonly name: string;
  readonly type: ValueType;
  readonly required: boolean;
  readonly variadic?: boolean;
}

export interface FunctionSignature {
  readonly parameters: readonly FunctionParameter[];
  readonly returnType: ValueType;
}

export type FunctionImplementation = (
  args: readonly unknown[],
  context: ExecutionContext,
) => unknown;

export interface RegisteredFunction {
  readonly name: string;
  readonly signature: FunctionSignature;
  readonly implementation: FunctionImplementation;
}
