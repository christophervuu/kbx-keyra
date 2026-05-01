import type { FunctionRegistry } from '../registry/function-registry.js';
import { registerConditionalFunctions } from './conditional.js';
import { registerDateFunctions } from './date.js';
import { registerLookupFunctions } from './lookup.js';
import { registerMathFunctions } from './math.js';
import { registerNullHandlingFunctions } from './null-handling.js';
import { registerSourceAccessFunctions } from './source-access.js';
import { registerStringFunctions } from './string.js';
import { registerTypeConversionFunctions } from './type-conversion.js';

export function registerAllFunctions(registry: FunctionRegistry): void {
  registerSourceAccessFunctions(registry);
  registerTypeConversionFunctions(registry);
  registerNullHandlingFunctions(registry);
  registerConditionalFunctions(registry);
  registerLookupFunctions(registry);
  registerStringFunctions(registry);
  registerDateFunctions(registry);
  registerMathFunctions(registry);
}
