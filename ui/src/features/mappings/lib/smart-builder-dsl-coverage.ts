import {
  ALL_REGISTERED_DSL_FUNCTIONS,
  SMART_BUILDER_ACTION_CATALOG,
  UNSUPPORTED_DSL_FUNCTIONS,
} from './smart-builder-action-catalog';

import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';

export type DslCoverageClassification =
  | 'user-facing-action'
  | 'input-type'
  | 'advanced-only'
  | 'intentionally-unsupported';

export interface DslCoverageEntry {
  readonly functionName: string;
  readonly classification: DslCoverageClassification;
  readonly reason?: string;
}

const INPUT_TYPE_FUNCTIONS = new Set(['source', 'external', 'constant', 'static', 'item', 'parent']);
const ADVANCED_ONLY_FUNCTIONS = new Set<string>([]);

export function buildSmartBuilderDslCoverage(): readonly DslCoverageEntry[] {
  const catalogCoverage = new Set(
    SMART_BUILDER_ACTION_CATALOG.flatMap((action) => action.dslFunctions),
  );

  return DSL_FUNCTION_CATALOG.map((fn) => {
    if (Object.prototype.hasOwnProperty.call(UNSUPPORTED_DSL_FUNCTIONS, fn.name)) {
      return {
        functionName: fn.name,
        classification: 'intentionally-unsupported' as const,
        reason: UNSUPPORTED_DSL_FUNCTIONS[fn.name as keyof typeof UNSUPPORTED_DSL_FUNCTIONS],
      };
    }

    if (INPUT_TYPE_FUNCTIONS.has(fn.name)) {
      return { functionName: fn.name, classification: 'input-type' as const };
    }

    if (ADVANCED_ONLY_FUNCTIONS.has(fn.name)) {
      return { functionName: fn.name, classification: 'advanced-only' as const };
    }

    if (catalogCoverage.has(fn.name)) {
      return { functionName: fn.name, classification: 'user-facing-action' as const };
    }

    return {
      functionName: fn.name,
      classification: 'advanced-only' as const,
      reason: 'No guided action entry yet; available through advanced expression mode.',
    };
  });
}

export function findUnregisteredFunctionsInActionCatalog(): readonly string[] {
  const actionFunctions = SMART_BUILDER_ACTION_CATALOG.flatMap((action) => action.dslFunctions);
  const unregistered = actionFunctions.filter((fn) => !ALL_REGISTERED_DSL_FUNCTIONS.has(fn));
  return [...new Set(unregistered)].sort((a, b) => a.localeCompare(b));
}
