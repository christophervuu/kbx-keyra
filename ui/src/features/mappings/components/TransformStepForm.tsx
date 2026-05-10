/**
 * TransformStepForm — FS-038 T-08
 *
 * Renders a single transform step in the chain builder.
 *
 * Key design decisions:
 *   - The implicit first argument (current accumulated value) is NOT shown.
 *   - Only additional parameters beyond the first are rendered.
 *   - Reuses ArgumentForm with parameterOffset=1 to skip the implicit arg.
 *   - For unary transforms (upper, lower, trim): no parameter fields shown.
 *   - For variadic transforms (concat): shows [+ Add input] via ArgumentForm.
 *   - Function selection via TransformFunctionPicker (reused from FS-029).
 *   - Step removal via X button fires onRemoveStep.
 *
 * AE-05: upper(current) — no additional params shown
 * AE-06: multiply(current, factor) — one additional param field
 * AE-07: concat(current, ...rest) — variadic [+ Add input]
 */

import { useCallback, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';

import { ArgumentForm } from './ArgumentForm';
import { TransformFunctionPicker } from './TransformFunctionPicker';
import type { SchemaPathEntry } from '../lib/autocomplete-utils';
import type { TransformLogicStep, ArgumentSlotRef } from '../lib/chain-builder-state';
import type { ArgumentSlot } from '../lib/expression-builder-state';

import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';
import { CHAINABLE_TRANSFORMS } from '../lib/transform-chain-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransformStepFormProps {
  /** Zero-based index of this step in the chain. */
  readonly stepIndex: number;
  /** The current transform step state. */
  readonly step: TransformLogicStep;
  /** Fires when any field in this step changes. */
  readonly onStepChange: (index: number, step: TransformLogicStep) => void;
  /** Fires when the user removes this step. */
  readonly onRemoveStep: (index: number) => void;
  /** Source field options for source-mode parameter slots. */
  readonly sourceOptions?: readonly SchemaPathEntry[];
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert ArgumentSlotRef[] (chain model) to ArgumentSlot[] (legacy form model).
 * ArgumentSlotRef is a subset of ArgumentSlot — only source and literal modes.
 */
function refsToSlots(refs: readonly ArgumentSlotRef[]): ArgumentSlot[] {
  return refs.map((ref): ArgumentSlot => {
    if (ref.mode === 'source') return { mode: 'source', path: ref.path };
    return { mode: 'literal', value: ref.value };
  });
}

/**
 * Convert ArgumentSlot[] back to ArgumentSlotRef[].
 * Expression-mode slots are downgraded to literal with the function name as value
 * (chain model does not support nested expression slots in transform args).
 */
function slotsToRefs(slots: ArgumentSlot[]): ArgumentSlotRef[] {
  return slots.map((slot): ArgumentSlotRef => {
    if (slot.mode === 'source') return { mode: 'source', path: slot.path };
    if (slot.mode === 'literal') return { mode: 'literal', value: slot.value };
    // expression mode: downgrade to literal with function name
    return { mode: 'literal', value: slot.node.functionName };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a single transform step card in the chain builder.
 */
export function TransformStepForm({
  stepIndex,
  step,
  onStepChange,
  onRemoveStep,
  sourceOptions,
  className,
}: TransformStepFormProps) {
  const [pickerOpen, setPickerOpen] = useState(step.functionName === '');

  const catalogEntry = DSL_FUNCTION_CATALOG.find((e) => e.name === step.functionName);

  // The set of allowed functions is the chainable transforms set
  const allowedFunctions = CHAINABLE_TRANSFORMS;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleFunctionSelect = useCallback(
    (functionName: string) => {
      setPickerOpen(false);
      // Reset args when function changes
      onStepChange(stepIndex, {
        kind: 'transform',
        functionName,
        args: [],
      });
    },
    [stepIndex, onStepChange],
  );

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false);
  }, []);

  const handleSlotsChange = useCallback(
    (slots: ArgumentSlot[]) => {
      onStepChange(stepIndex, {
        ...step,
        args: slotsToRefs(slots),
      });
    },
    [stepIndex, step, onStepChange],
  );

  const handleRemove = useCallback(() => {
    onRemoveStep(stepIndex);
  }, [stepIndex, onRemoveStep]);

  // -------------------------------------------------------------------------
  // Render: function not yet selected
  // -------------------------------------------------------------------------

  if (step.functionName === '' || pickerOpen) {
    return (
      <div
        className={[
          'rounded-lg border border-zinc-700 bg-zinc-800/60 overflow-hidden',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid={`transform-step-form-${stepIndex}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700 bg-zinc-800">
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
            Select transformation
          </span>
          <button
            type="button"
            onClick={handleRemove}
            aria-label="Remove transform step"
            className="text-zinc-500 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded p-0.5 transition-colors"
            data-testid={`transform-step-remove-${stepIndex}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Function picker inline */}
        <div className="p-2" data-testid={`transform-step-picker-${stepIndex}`}>
          <TransformFunctionPicker
            allowedFunctions={allowedFunctions}
            onSelect={handleFunctionSelect}
            onClose={handlePickerClose}
          />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: function selected
  // -------------------------------------------------------------------------

  // parameterOffset=1 skips the implicit first arg (current value)
  const slots = refsToSlots(step.args);

  // Determine if this function has additional params beyond the implicit first
  const hasAdditionalParams = catalogEntry !== undefined && catalogEntry.parameters.length > 1;

  return (
    <div
      className={[
        'rounded-lg border border-zinc-700 bg-zinc-800/60 overflow-hidden',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`transform-step-form-${stepIndex}`}
    >
      {/* Header: function name + description + remove button */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700 bg-zinc-800">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-mono font-semibold text-blue-300"
              data-testid={`transform-step-function-name-${stepIndex}`}
            >
              {step.functionName}
            </span>
            {/* Change function button */}
            <button
              type="button"
              onClick={() => { setPickerOpen(true); }}
              aria-label={`Change transform function (currently ${step.functionName})`}
              className="inline-flex items-center gap-0.5 text-[11px] text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded px-1 py-0.5 border border-dashed border-zinc-700 hover:border-zinc-500 transition-colors"
              data-testid={`transform-step-change-fn-${stepIndex}`}
            >
              <ChevronDown className="h-2.5 w-2.5" aria-hidden="true" />
              Change
            </button>
          </div>
          {catalogEntry !== undefined && (
            <p
              className="text-[11px] text-zinc-400 mt-0.5 truncate"
              data-testid={`transform-step-description-${stepIndex}`}
            >
              {catalogEntry.description}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleRemove}
          aria-label={`Remove ${step.functionName} transform step`}
          className="shrink-0 text-zinc-500 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded p-0.5 transition-colors"
          data-testid={`transform-step-remove-${stepIndex}`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Implicit first arg notice */}
      <div
        className="px-3 py-1.5 bg-zinc-900/40 border-b border-zinc-700/50"
        data-testid={`transform-step-implicit-arg-${stepIndex}`}
      >
        <span className="text-[11px] text-zinc-500 italic">
          Operates on: <span className="text-zinc-400 not-italic">current value</span>
        </span>
      </div>

      {/* Additional parameter fields */}
      {hasAdditionalParams ? (
        <div className="p-3" data-testid={`transform-step-params-${stepIndex}`}>
          <ArgumentForm
            functionName={step.functionName}
            slots={slots}
            parameterOffset={1}
            onSlotsChange={handleSlotsChange}
            sourceOptions={sourceOptions}
          />
        </div>
      ) : (
        <div
          className="px-3 py-2 text-[11px] text-zinc-500 italic"
          data-testid={`transform-step-no-params-${stepIndex}`}
        >
          No additional parameters required.
        </div>
      )}
    </div>
  );
}
