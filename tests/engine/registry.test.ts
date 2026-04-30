import { describe, expect, it } from 'vitest';

import {
  createRegistry,
  type FunctionImplementation,
  type FunctionSignature,
} from '../../src/engine/index.js';

function createTestSignature(): FunctionSignature {
  return {
    parameters: [
      {
        name: 'value',
        type: 'string',
        required: true,
      },
    ],
    returnType: 'string',
  };
}

function createTestImplementation(): FunctionImplementation {
  return (args) => args[0];
}

describe('function registry', () => {
  it('registers and retrieves functions', () => {
    const registry = createRegistry();
    const signature = createTestSignature();
    const implementation = createTestImplementation();

    registry.registerFunction('testFn', signature, implementation);

    expect(registry.hasFunction('testFn')).toBe(true);
    expect(registry.hasFunction('unknown')).toBe(false);
    expect(registry.getFunction('unknown')).toBeUndefined();
    expect(registry.getFunction('testFn')).toEqual({
      name: 'testFn',
      signature,
      implementation,
    });
  });

  it('lists registered function names', () => {
    const registry = createRegistry();

    registry.registerFunction(
      'firstFn',
      createTestSignature(),
      createTestImplementation(),
    );
    registry.registerFunction(
      'secondFn',
      createTestSignature(),
      createTestImplementation(),
    );

    expect(registry.listFunctions()).toEqual(['firstFn', 'secondFn']);
  });

  it('throws on duplicate registration', () => {
    const registry = createRegistry();

    registry.registerFunction(
      'testFn',
      createTestSignature(),
      createTestImplementation(),
    );

    expect(() => {
      registry.registerFunction(
        'testFn',
        createTestSignature(),
        createTestImplementation(),
      );
    }).toThrow('Function `testFn` is already registered');
  });

  it('creates isolated registry instances', () => {
    const registryA = createRegistry();
    const registryB = createRegistry();

    registryA.registerFunction(
      'testFn',
      createTestSignature(),
      createTestImplementation(),
    );

    expect(registryA.hasFunction('testFn')).toBe(true);
    expect(registryB.hasFunction('testFn')).toBe(false);
  });
});
