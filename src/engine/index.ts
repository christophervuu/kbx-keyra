import { registerAllFunctions } from './functions/index.js';
import { defaultRegistry } from './registry/function-registry.js';

registerAllFunctions(defaultRegistry);

export * from './types/index.js';
export * from './diagnostics/index.js';
export * from './registry/index.js';
export * from './dsl/index.js';
export { registerAllFunctions } from './functions/index.js';
export { execute } from './execute.js';
export { validate } from './validate.js';
