/**
 * transform-chain-utils.ts
 *
 * Shared utilities for the FS-030 transform chain pipeline:
 *   - getChainOutputType: computes the output type of a chain given its steps
 *   - getCompatibleChainableTransforms: filters the catalog to functions whose
 *     first parameter accepts the given output type
 *
 * These utilities are used by SourceCard (to filter the [+ Add Step] picker)
 * and can be used by any consumer that needs type-aware chain composition.
 *
 * CHAINABLE_TRANSFORMS is re-exported from source-card-decomposer so that
 * both the decomposer and this utility share a single source of truth.
 */

import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';
import type { FunctionCatalogEntry } from '@/lib/data/dsl-functions';

import type { TransformChainStep } from './expression-builder-state';
import { CHAINABLE_TRANSFORMS } from './source-card-decomposer';

// Re-export so consumers can import from one place
export { CHAINABLE_TRANSFORMS };

// ---------------------------------------------------------------------------
// getChainOutputType
// ---------------------------------------------------------------------------

/**
 * Computes the output type of a transform chain.
 *
 * - If the chain has no steps, returns `sourceType` (or `'any'` if unknown).
 * - Otherwise, returns the `returnType` of the last step's function from
 *   `DSL_FUNCTION_CATALOG`, or `'any'` if the function is not in the catalog.
 *
 * @param steps      The chain steps (ordered innermost-first).
 * @param sourceType Optional type of the source field (e.g. `'string'`, `'number'`).
 * @returns          A type string: `'string'`, `'number'`, `'boolean'`, `'any'`, etc.
 */
export function getChainOutputType(
  steps: readonly TransformChainStep[],
  sourceType?: string,
): string {
  if (steps.length === 0) return sourceType ?? 'any';
  const lastStep = steps[steps.length - 1]!;
  const catalogEntry = DSL_FUNCTION_CATALOG.find((e) => e.name === lastStep.functionName);
  return catalogEntry?.returnType ?? 'any';
}

// ---------------------------------------------------------------------------
// getCompatibleChainableTransforms
// ---------------------------------------------------------------------------

/**
 * Returns all chainable catalog entries whose first parameter type is
 * compatible with the given output type.
 *
 * Compatibility rules:
 *   - If `outputType` is `'any'`: all chainable transforms are returned.
 *   - If a function's first parameter type is `'any'`: it accepts all output types.
 *   - Otherwise: first param type must exactly match `outputType`.
 *
 * Functions not in `CHAINABLE_TRANSFORMS` are always excluded.
 *
 * @param outputType The current pipeline output type (from `getChainOutputType`).
 * @returns          Filtered list of compatible chainable catalog entries.
 */
export function getCompatibleChainableTransforms(
  outputType: string,
): readonly FunctionCatalogEntry[] {
  const chainable = DSL_FUNCTION_CATALOG.filter((e) => CHAINABLE_TRANSFORMS.has(e.name));
  if (outputType === 'any') return chainable;
  return chainable.filter((entry) => {
    const firstParam = entry.parameters[0];
    if (firstParam === undefined) return false;
    return firstParam.type === 'any' || firstParam.type === outputType;
  });
}
