import type { FunctionRegistry } from '../registry/function-registry.js';
import type { FunctionImplementation, FunctionSignature } from '../types/index.js';

const ifSignature: FunctionSignature = {
  parameters: [
    { name: 'condition', type: 'boolean', required: true },
    { name: 'then', type: 'any', required: true },
    { name: 'else', type: 'any', required: true },
  ],
  returnType: 'any',
  handlesNull: true,
};

const eqSignature: FunctionSignature = {
  parameters: [
    { name: 'a', type: 'any', required: true },
    { name: 'b', type: 'any', required: true },
  ],
  returnType: 'boolean',
  handlesNull: true,
};

const neqSignature: FunctionSignature = {
  parameters: [
    { name: 'a', type: 'any', required: true },
    { name: 'b', type: 'any', required: true },
  ],
  returnType: 'boolean',
  handlesNull: true,
};

const gtSignature: FunctionSignature = {
  parameters: [
    { name: 'a', type: 'number', required: true },
    { name: 'b', type: 'number', required: true },
  ],
  returnType: 'boolean',
};

const gteSignature: FunctionSignature = {
  parameters: [
    { name: 'a', type: 'number', required: true },
    { name: 'b', type: 'number', required: true },
  ],
  returnType: 'boolean',
};

const ltSignature: FunctionSignature = {
  parameters: [
    { name: 'a', type: 'number', required: true },
    { name: 'b', type: 'number', required: true },
  ],
  returnType: 'boolean',
};

const lteSignature: FunctionSignature = {
  parameters: [
    { name: 'a', type: 'number', required: true },
    { name: 'b', type: 'number', required: true },
  ],
  returnType: 'boolean',
};

const andSignature: FunctionSignature = {
  parameters: [
    { name: 'a', type: 'boolean', required: true },
    { name: 'b', type: 'boolean', required: true },
  ],
  returnType: 'boolean',
  handlesNull: true,
};

const orSignature: FunctionSignature = {
  parameters: [
    { name: 'a', type: 'boolean', required: true },
    { name: 'b', type: 'boolean', required: true },
  ],
  returnType: 'boolean',
  handlesNull: true,
};

const notSignature: FunctionSignature = {
  parameters: [{ name: 'a', type: 'boolean', required: true }],
  returnType: 'boolean',
};

const ifImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return args[0] === true ? args[1] : args[2];
};

const eqImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  const [a, b] = args;

  if (a === null && b === null) {
    return true;
  }

  if (a === null || b === null) {
    return false;
  }

  return a === b;
};

const neqImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  const [a, b] = args;

  if (a === null && b === null) {
    return false;
  }

  if (a === null || b === null) {
    return true;
  }

  return a !== b;
};

const gtImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return (args[0] as number) > (args[1] as number);
};

const gteImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return (args[0] as number) >= (args[1] as number);
};

const ltImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return (args[0] as number) < (args[1] as number);
};

const lteImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return (args[0] as number) <= (args[1] as number);
};

const andImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  const [a, b] = args as readonly [boolean | null, boolean | null];

  if (a === false || b === false) {
    return false;
  }

  if (a === null || b === null) {
    return null;
  }

  return true;
};

const orImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  const [a, b] = args as readonly [boolean | null, boolean | null];

  if (a === true || b === true) {
    return true;
  }

  if (a === null || b === null) {
    return null;
  }

  return false;
};

const notImplementation: FunctionImplementation = (args: readonly unknown[]): unknown => {
  return !(args[0] as boolean);
};

export function registerConditionalFunctions(registry: FunctionRegistry): void {
  registry.registerFunction('if', ifSignature, ifImplementation);
  registry.registerFunction('eq', eqSignature, eqImplementation);
  registry.registerFunction('neq', neqSignature, neqImplementation);
  registry.registerFunction('gt', gtSignature, gtImplementation);
  registry.registerFunction('gte', gteSignature, gteImplementation);
  registry.registerFunction('lt', ltSignature, ltImplementation);
  registry.registerFunction('lte', lteSignature, lteImplementation);
  registry.registerFunction('and', andSignature, andImplementation);
  registry.registerFunction('or', orSignature, orImplementation);
  registry.registerFunction('not', notSignature, notImplementation);
}
