import type {
  FunctionImplementation,
  FunctionSignature,
  RegisteredFunction,
} from '../types/index.js';

export class FunctionRegistry {
  private readonly functions = new Map<string, RegisteredFunction>();

  registerFunction(
    name: string,
    signature: FunctionSignature,
    implementation: FunctionImplementation,
  ): void {
    if (this.functions.has(name)) {
      throw new Error(`Function \`${name}\` is already registered`);
    }

    this.functions.set(name, {
      name,
      signature,
      implementation,
    });
  }

  getFunction(name: string): RegisteredFunction | undefined {
    return this.functions.get(name);
  }

  hasFunction(name: string): boolean {
    return this.functions.has(name);
  }

  listFunctions(): string[] {
    return Array.from(this.functions.keys());
  }
}

export function createRegistry(): FunctionRegistry {
  return new FunctionRegistry();
}

export const defaultRegistry = createRegistry();

export function registerFunction(
  name: string,
  signature: FunctionSignature,
  implementation: FunctionImplementation,
): void {
  defaultRegistry.registerFunction(name, signature, implementation);
}

export function getFunction(name: string): RegisteredFunction | undefined {
  return defaultRegistry.getFunction(name);
}

export function hasFunction(name: string): boolean {
  return defaultRegistry.hasFunction(name);
}

export function listFunctions(): string[] {
  return defaultRegistry.listFunctions();
}
