/**
 * ArgumentConfigurator — Step 3 of the guided DSL builder.
 *
 * Renders one ArgumentSlot per parameter for the selected function.
 * Handles:
 *  - Fixed (non-variadic) parameters — one slot each, always present
 *  - Variadic parameters — one or more slots with "Add argument" button
 *  - Known enum options for specific parameters (e.g. cast → targetType)
 *  - nestingLevel threading to suppress recursive function mode
 */

import { useCallback, useMemo, useState } from 'react';

import type { FunctionCatalogParameter } from '@/lib/data/dsl-functions';
import type { ParsedSchema } from '@/lib/types/domain';
import type { BuilderArgument, BuilderState } from '../lib/expression-generator';
import { ArgumentSlot } from './ArgumentSlot';
import { NestedFunctionBuilder } from './NestedFunctionBuilder';

// ---------------------------------------------------------------------------
// Known enum options per function → parameter name
// ---------------------------------------------------------------------------

const ENUM_OPTIONS: Readonly<Record<string, Record<string, readonly string[]>>> = {
  cast: { targetType: ['string', 'number', 'boolean'] },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArgumentConfiguratorProps {
  readonly functionName: string;
  readonly parameters: readonly FunctionCatalogParameter[];
  readonly values: readonly BuilderArgument[];
  readonly onChange: (values: BuilderArgument[]) => void;
  readonly parsedSourceSchema: ParsedSchema | null;
  /** Current nesting level — threads through to ArgumentSlot / NestedFunctionBuilder. */
  readonly nestingLevel?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split parameters into fixed (non-variadic) and the variadic descriptor
 * (there can be at most one variadic param, always the last one).
 */
function splitParameters(params: readonly FunctionCatalogParameter[]): {
  fixed: FunctionCatalogParameter[];
  variadic: FunctionCatalogParameter | null;
} {
  const last = params[params.length - 1];
  if (last?.variadic) {
    return { fixed: params.slice(0, -1) as FunctionCatalogParameter[], variadic: last };
  }
  return { fixed: params as FunctionCatalogParameter[], variadic: null };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArgumentConfigurator({
  functionName,
  parameters,
  values,
  onChange,
  parsedSourceSchema,
  nestingLevel = 0,
}: ArgumentConfiguratorProps) {
  const { fixed, variadic } = useMemo(() => splitParameters(parameters), [parameters]);

  // Track how many variadic slots are shown (minimum 1 if variadic param exists and required)
  const [variadicCount, setVariadicCount] = useState<number>(() =>
    variadic ? (variadic.required ? 1 : 0) : 0,
  );

  // -----------------------------------------------------------------------
  // Value helpers
  // -----------------------------------------------------------------------

  const getFixedValue = useCallback(
    (idx: number): BuilderArgument | undefined => values[idx],
    [values],
  );

  const getVariadicValue = useCallback(
    (varIdx: number): BuilderArgument | undefined => values[fixed.length + varIdx],
    [values, fixed.length],
  );

  const setFixedValue = useCallback(
    (idx: number, arg: BuilderArgument) => {
      const next = [...values];
      next[idx] = arg;
      onChange(next as BuilderArgument[]);
    },
    [values, onChange],
  );

  const setVariadicValue = useCallback(
    (varIdx: number, arg: BuilderArgument) => {
      const next = [...values];
      next[fixed.length + varIdx] = arg;
      onChange(next as BuilderArgument[]);
    },
    [values, fixed.length, onChange],
  );

  const removeVariadicSlot = useCallback(
    (varIdx: number) => {
      const next = [...values];
      next.splice(fixed.length + varIdx, 1);
      setVariadicCount((c) => Math.max(0, c - 1));
      onChange(next as BuilderArgument[]);
    },
    [values, fixed.length, onChange],
  );

  const addVariadicSlot = useCallback(() => {
    setVariadicCount((c) => c + 1);
  }, []);

  // -----------------------------------------------------------------------
  // Render nested builder factory (passed as renderNestedBuilder to slots)
  // -----------------------------------------------------------------------
  const makeRenderNestedBuilder = useCallback(
    (slotOnChange: (arg: BuilderArgument) => void) =>
      ({
        onStateChange,
        currentState,
      }: {
        onStateChange: (state: BuilderState | null) => void;
        currentState: BuilderState | null;
      }) => (
        <NestedFunctionBuilder
          parsedSourceSchema={parsedSourceSchema}
          nestingLevel={nestingLevel + 1}
          initialState={currentState}
          onStateChange={(state) => {
            onStateChange(state);
            if (state) slotOnChange({ kind: 'nested-function', value: state });
          }}
        />
      ),
    [parsedSourceSchema, nestingLevel],
  );

  // -----------------------------------------------------------------------
  // Empty parameters guard
  // -----------------------------------------------------------------------
  if (parameters.length === 0) {
    return (
      <p className="text-sm text-zinc-500 italic px-2 py-4">
        This function takes no arguments.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="argument-configurator">
      {/* Fixed parameters */}
      {fixed.map((param, idx) => {
        const enumOpts = ENUM_OPTIONS[functionName]?.[param.name];
        const slotOnChange = (arg: BuilderArgument) => { setFixedValue(idx, arg); };
        return (
          <ArgumentSlot
            key={`${param.name}-${idx}`}
            parameter={param}
            value={getFixedValue(idx)}
            onChange={slotOnChange}
            parsedSourceSchema={parsedSourceSchema}
            enumOptions={enumOpts}
            nestingLevel={nestingLevel}
            renderNestedBuilder={nestingLevel < 1 ? makeRenderNestedBuilder(slotOnChange) : undefined}
          />
        );
      })}

      {/* Variadic parameter slots */}
      {variadic !== null &&
        Array.from({ length: variadicCount }, (_, varIdx) => {
          const slotOnChange = (arg: BuilderArgument) => { setVariadicValue(varIdx, arg); };
          return (
            <ArgumentSlot
              key={`${variadic.name}-variadic-${varIdx}`}
              parameter={variadic}
              value={getVariadicValue(varIdx)}
              onChange={slotOnChange}
              onRemove={variadicCount > (variadic.required ? 1 : 0) ? () => { removeVariadicSlot(varIdx); } : undefined}
              parsedSourceSchema={parsedSourceSchema}
              nestingLevel={nestingLevel}
              renderNestedBuilder={nestingLevel < 1 ? makeRenderNestedBuilder(slotOnChange) : undefined}
            />
          );
        })}

      {/* Add variadic argument button */}
      {variadic !== null && (
        <button
          type="button"
          onClick={addVariadicSlot}
          aria-label={`Add ${variadic.name} argument`}
          className="self-start text-xs text-blue-400 hover:text-blue-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded px-1 py-0.5"
        >
          + Add {variadic.name}
        </button>
      )}
    </div>
  );
}
