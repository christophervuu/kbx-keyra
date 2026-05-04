/**
 * TransformPipeline — ordered list of transform steps for the Value mode
 * of the UnifiedExpressionBuilder (FS-023 T-04).
 *
 * Renders:
 *  - Ordered list of TransformPipelineStep cards with visual flow connectors
 *  - [+ Add Transformation] button that opens TransformFunctionPicker
 *  - Empty state when no transforms are present
 */

import { useCallback, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';
import type { TransformStep } from '../lib/expression-builder-state';
import { TransformFunctionPicker } from './TransformFunctionPicker';
import { TransformPipelineStep } from './TransformPipelineStep';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransformPipelineProps {
  readonly transforms: readonly TransformStep[];
  readonly onTransformsChange: (transforms: TransformStep[]) => void;
  /** Label for what feeds step 1 — e.g. 'source("email")' or 'static("N/A")' */
  readonly sourceDescription: string;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDefaultStep(functionName: string): TransformStep {
  const entry = DSL_FUNCTION_CATALOG.find((e) => e.name === functionName);
  if (!entry) return { functionName, parameters: [] };

  // Pre-populate required additional parameters with sensible defaults
  const additionalParams = entry.parameters.slice(1).filter((p) => !p.variadic && p.required);
  const parameters = additionalParams.map((p) => ({
    name: p.name,
    value: p.type === 'number' ? (0 as number) : p.type === 'boolean' ? (false as boolean) : ('' as string),
    type: p.type,
  }));
  return { functionName, parameters };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Ordered transform pipeline with add/remove/reorder controls.
 */
export function TransformPipeline({
  transforms,
  onTransformsChange,
  sourceDescription,
  className,
}: TransformPipelineProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const handleAddFunction = useCallback(
    (functionName: string) => {
      const newStep = makeDefaultStep(functionName);
      onTransformsChange([...transforms, newStep]);
      setPickerOpen(false);
    },
    [transforms, onTransformsChange],
  );

  const handleUpdate = useCallback(
    (index: number, updated: TransformStep) => {
      const next = transforms.map((t, i) => (i === index ? updated : t));
      onTransformsChange(next);
    },
    [transforms, onTransformsChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onTransformsChange(transforms.filter((_, i) => i !== index));
    },
    [transforms, onTransformsChange],
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const next = [...transforms];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      onTransformsChange(next);
    },
    [transforms, onTransformsChange],
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= transforms.length - 1) return;
      const next = [...transforms];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      onTransformsChange(next);
    },
    [transforms, onTransformsChange],
  );

  const getInputDescription = (index: number): string => {
    if (index === 0) return sourceDescription;
    return `output of step ${index}`;
  };

  return (
    <div
      className={['space-y-2', className ?? ''].filter(Boolean).join(' ')}
      data-testid="transform-pipeline"
    >
      {/* Section header */}
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
        Transforms
      </h3>

      {/* Empty state */}
      {transforms.length === 0 && (
        <p
          className="text-xs text-zinc-500 italic py-1"
          data-testid="transform-pipeline-empty"
        >
          No transforms added. Source value will be used directly.
        </p>
      )}

      {/* Steps */}
      {transforms.length > 0 && (
        <div className="space-y-1">
          {transforms.map((transform, index) => (
            <div key={index} className="relative">
              {/* Flow connector line between steps */}
              {index > 0 && (
                <div
                  className="absolute -top-1 left-4 w-px h-2 bg-zinc-600"
                  aria-hidden="true"
                />
              )}
              <TransformPipelineStep
                stepIndex={index}
                transform={transform}
                inputDescription={getInputDescription(index)}
                onUpdate={(updated) => { handleUpdate(index, updated); }}
                onRemove={() => { handleRemove(index); }}
                onMoveUp={() => { handleMoveUp(index); }}
                onMoveDown={() => { handleMoveDown(index); }}
                isFirst={index === 0}
                isLast={index === transforms.length - 1}
              />
            </div>
          ))}
        </div>
      )}

      {/* Add Transformation button */}
      <div className="relative">
        <button
          ref={addBtnRef}
          type="button"
          onClick={() => { setPickerOpen((v) => !v); }}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 hover:border-zinc-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 transition-colors"
          data-testid="transform-add-btn"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add Transformation
        </button>

        {/* Function picker popover */}
        {pickerOpen && (
          <div className="absolute left-0 top-full mt-1 z-30">
            <TransformFunctionPicker
              onSelect={handleAddFunction}
              onClose={() => { setPickerOpen(false); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
