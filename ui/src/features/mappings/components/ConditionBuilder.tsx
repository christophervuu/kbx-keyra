/**
 * ConditionBuilder
 *
 * Mini builder for a single boolean condition expression used in filter()
 * inside a map/filter array context.
 *
 * Renders:
 *  - A comparison function picker (eq, neq, gt, gte, lt, lte)
 *  - Two ArgumentSlots: left (typically item()) and right (literal or item())
 *
 * Generates a BuilderState like:
 *   { functionName: 'eq', arguments: [item("status"), literal("active")] }
 *
 * Which the parent (GuidedBuilder) wraps in a nested-function argument for
 * the filter() call.
 */

import { useCallback, useState } from 'react';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';
import type { BuilderArgument, BuilderState } from '../lib/expression-generator';
import type { ArrayContext } from './ArgumentSlot';
import { ArgumentSlot } from './ArgumentSlot';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPARISON_FUNCTIONS = [
  { name: 'eq', label: '= equals' },
  { name: 'neq', label: '≠ not equals' },
  { name: 'gt', label: '> greater than' },
  { name: 'gte', label: '≥ greater than or equal' },
  { name: 'lt', label: '< less than' },
  { name: 'lte', label: '≤ less than or equal' },
] as const;

type ComparisonFunctionName = (typeof COMPARISON_FUNCTIONS)[number]['name'];

// Synthetic parameter descriptors for the two ArgumentSlots
const LEFT_PARAM = {
  name: 'left',
  type: 'any' as const,
  required: true,
  variadic: false,
  description: 'Left operand (usually the element field via item())',
};

const RIGHT_PARAM = {
  name: 'right',
  type: 'any' as const,
  required: true,
  variadic: false,
  description: 'Right operand (comparison target)',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConditionBuilderProps {
  /** Current condition state (null = not yet configured). */
  readonly condition: BuilderState | null;
  /** Called whenever the condition changes. */
  readonly onChange: (condition: BuilderState | null) => void;
  readonly parsedSourceSchema: ParsedSchema | null;
  /** The array item schema for item() suggestions in the left/right slots. */
  readonly arrayItemSchema: SchemaTreeNode | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCondition(
  fn: ComparisonFunctionName,
  left: BuilderArgument | undefined,
  right: BuilderArgument | undefined,
): BuilderState | null {
  if (!left || !right) return null;
  return { functionName: fn, arguments: [left, right] };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConditionBuilder({
  condition,
  onChange,
  parsedSourceSchema,
  arrayItemSchema,
}: ConditionBuilderProps) {
  const [selectedFn, setSelectedFn] = useState<ComparisonFunctionName>(() => {
    if (condition?.functionName && COMPARISON_FUNCTIONS.some((c) => c.name === condition.functionName)) {
      return condition.functionName as ComparisonFunctionName;
    }
    return 'eq';
  });

  const [leftArg, setLeftArg] = useState<BuilderArgument | undefined>(() =>
    condition?.arguments[0],
  );
  const [rightArg, setRightArg] = useState<BuilderArgument | undefined>(() =>
    condition?.arguments[1],
  );

  const arrayContext: ArrayContext = {
    inArrayContext: true,
    arrayItemSchema,
  };

  const emitChange = useCallback(
    (fn: ComparisonFunctionName, left: BuilderArgument | undefined, right: BuilderArgument | undefined) => {
      onChange(buildCondition(fn, left, right));
    },
    [onChange],
  );

  const handleFnChange = useCallback(
    (fn: ComparisonFunctionName) => {
      setSelectedFn(fn);
      emitChange(fn, leftArg, rightArg);
    },
    [leftArg, rightArg, emitChange],
  );

  const handleLeftChange = useCallback(
    (arg: BuilderArgument) => {
      setLeftArg(arg);
      emitChange(selectedFn, arg, rightArg);
    },
    [selectedFn, rightArg, emitChange],
  );

  const handleRightChange = useCallback(
    (arg: BuilderArgument) => {
      setRightArg(arg);
      emitChange(selectedFn, leftArg, arg);
    },
    [selectedFn, leftArg, emitChange],
  );

  return (
    <div className="flex flex-col gap-3" data-testid="condition-builder">
      {/* Comparison function picker */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-zinc-400 uppercase tracking-wide">Comparison</label>
        <select
          value={selectedFn}
          aria-label="Comparison function"
          onChange={(e) => { handleFnChange(e.target.value as ComparisonFunctionName); }}
          className="w-full px-2 py-1.5 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
        >
          {COMPARISON_FUNCTIONS.map((fn) => (
            <option key={fn.name} value={fn.name}>
              {fn.label}
            </option>
          ))}
        </select>
      </div>

      {/* Left operand */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400 uppercase tracking-wide">Left operand</span>
        <ArgumentSlot
          parameter={LEFT_PARAM}
          value={leftArg}
          onChange={handleLeftChange}
          parsedSourceSchema={parsedSourceSchema}
          arrayContext={arrayContext}
          nestingLevel={1}
        />
      </div>

      {/* Right operand */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400 uppercase tracking-wide">Right operand</span>
        <ArgumentSlot
          parameter={RIGHT_PARAM}
          value={rightArg}
          onChange={handleRightChange}
          parsedSourceSchema={parsedSourceSchema}
          arrayContext={arrayContext}
          nestingLevel={1}
        />
      </div>
    </div>
  );
}
