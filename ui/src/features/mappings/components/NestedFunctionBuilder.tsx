/**
 * NestedFunctionBuilder — inline mini builder for nested function arguments.
 *
 * Allows selecting a DSL transform function and configuring its arguments
 * inline within an ArgumentSlot (accordion-style).
 *
 * Limited to nestingLevel < 2 to prevent infinite recursion in the UI:
 *  nestingLevel 0 = top-level ArgumentConfigurator
 *  nestingLevel 1 = NestedFunctionBuilder inside an ArgumentSlot
 *  nestingLevel >= 2 = no further nesting (ArgumentSlot hides the "Function" mode)
 *
 * Emits a BuilderState (or null when cleared) via `onStateChange`.
 * The parent ArgumentSlot wraps this in a `{ kind: 'nested-function', value: state }` arg.
 */

import { useCallback, useMemo, useState } from 'react';

import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';
import type { ParsedSchema } from '@/lib/types/domain';
import type { BuilderArgument, BuilderState } from '../lib/expression-generator';
import { ArgumentConfigurator } from './ArgumentConfigurator';
import { TransformPicker } from './TransformPicker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NestedFunctionBuilderProps {
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly nestingLevel: number;
  readonly initialState?: BuilderState | null;
  readonly onStateChange: (state: BuilderState | null) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NestedFunctionBuilder({
  parsedSourceSchema,
  nestingLevel,
  initialState = null,
  onStateChange,
}: NestedFunctionBuilderProps) {
  const [selectedFunction, setSelectedFunction] = useState<string | null>(
    initialState?.functionName ?? null,
  );
  const [argumentValues, setArgumentValues] = useState<readonly BuilderArgument[]>(
    initialState?.arguments ?? [],
  );

  // Resolve parameter metadata for the selected function
  const functionEntry = useMemo(
    () => DSL_FUNCTION_CATALOG.find((e) => e.name === selectedFunction) ?? null,
    [selectedFunction],
  );

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleFunctionSelect = useCallback(
    (name: string) => {
      setSelectedFunction(name);
      setArgumentValues([]);
      // Emit partial state (no args yet)
      onStateChange({ functionName: name, arguments: [] });
    },
    [onStateChange],
  );

  const handleArgsChange = useCallback(
    (values: BuilderArgument[]) => {
      setArgumentValues(values);
      if (selectedFunction) {
        onStateChange({ functionName: selectedFunction, arguments: values });
      }
    },
    [selectedFunction, onStateChange],
  );

  const handleClearFunction = useCallback(() => {
    setSelectedFunction(null);
    setArgumentValues([]);
    onStateChange(null);
  }, [onStateChange]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (selectedFunction === null || functionEntry === null) {
    return (
      <div data-testid="nested-function-builder">
        <TransformPicker
          selectedSourceFields={[]}
          onFunctionSelect={handleFunctionSelect}
          catalog={DSL_FUNCTION_CATALOG}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="nested-function-builder">
      {/* Selected function header with clear button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">
          Function:{' '}
          <span className="font-mono text-blue-300">{selectedFunction}()</span>
        </span>
        <button
          type="button"
          onClick={handleClearFunction}
          aria-label="Change nested function"
          className="text-xs text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded px-1"
        >
          Change
        </button>
      </div>

      {/* Argument configurator for the nested function */}
      <ArgumentConfigurator
        functionName={selectedFunction}
        parameters={functionEntry.parameters}
        values={argumentValues}
        onChange={handleArgsChange}
        parsedSourceSchema={parsedSourceSchema}
        nestingLevel={nestingLevel}
      />
    </div>
  );
}
