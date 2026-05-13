/**
 * LogicStepList — FS-038 T-11
 *
 * Renders the ordered list of logic steps in the chain builder.
 *
 * Responsibilities:
 *   - Renders each step in a CollapsibleStepContainer
 *   - Manages single-expansion constraint: only one step expanded at a time
 *   - Renders step connectors (vertical line) between steps to indicate chain flow
 *   - Renders the AddLogicPicker at the bottom when showAddPicker is true
 *   - Fires onStepChange, onRemoveStep, onAddStep callbacks
 *
 * AE-10: collapsible step summaries with single-step expansion
 */

import { useCallback, useState } from 'react';

import { CollapsibleStepContainer } from './CollapsibleStepContainer';
import { AddLogicPicker } from './AddLogicPicker';
import { TransformStepForm } from './TransformStepForm';
import { ChainConditionForm } from './ChainConditionForm';
import { ChainValueMapForm } from './ChainValueMapForm';
import type { LogicKind } from './AddLogicPicker';
import type { SchemaPathEntry } from '../lib/autocomplete-utils';
import type {
  LogicStep,
  TransformLogicStep,
  ConditionLogicStep,
  ValueMapLogicStep,
} from '../lib/chain-builder-state';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogicStepListProps {
  /** The ordered list of logic steps. */
  readonly steps: readonly LogicStep[];
  /** Index of the currently expanded step (null = none). */
  readonly expandedStepIndex: number | null;
  /** Fires when expandedStepIndex should change. */
  readonly onExpandedStepIndexChange: (index: number | null) => void;
  /** Fires when a step changes. */
  readonly onStepChange: (index: number, step: LogicStep) => void;
  /** Fires when a step is removed. */
  readonly onRemoveStep: (index: number) => void;
  /** Fires when a new logic kind is selected from the picker. */
  readonly onAddStep: (kind: LogicKind) => void;
  /** Source field options for transform step parameter slots. */
  readonly sourceOptions?: readonly SchemaPathEntry[];
  /** Label for the current accumulated value (passed to condition/value map forms). */
  readonly currentValueLabel?: string;
  /** Forces the add-logic picker open from external controls (e.g., SourceCard button). */
  readonly forcePickerOpen?: boolean;
  /** Fires when the list picker open state changes. */
  readonly onPickerOpenChange?: (open: boolean) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the ordered list of logic steps with collapsible containers and connectors.
 */
export function LogicStepList({
  steps,
  expandedStepIndex,
  onExpandedStepIndexChange,
  onStepChange,
  onRemoveStep,
  onAddStep,
  sourceOptions,
  currentValueLabel,
  forcePickerOpen = false,
  onPickerOpenChange,
  className,
}: LogicStepListProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const isPickerOpen = pickerOpen || forcePickerOpen;

  // -------------------------------------------------------------------------
  // Expansion management
  // -------------------------------------------------------------------------

  const handleToggle = useCallback(
    (index: number) => {
      onExpandedStepIndexChange(expandedStepIndex === index ? null : index);
    },
    [expandedStepIndex, onExpandedStepIndexChange],
  );

  // -------------------------------------------------------------------------
  // Step form render prop factory
  // -------------------------------------------------------------------------

  const renderStepForm = useCallback(
    (step: LogicStep, index: number): React.ReactNode => {
      if (step.kind === 'transform') {
        return (
          <TransformStepForm
            stepIndex={index}
            step={step as TransformLogicStep}
            onStepChange={(i, s) => { onStepChange(i, s); }}
            onRemoveStep={onRemoveStep}
            sourceOptions={sourceOptions}
          />
        );
      }
      if (step.kind === 'condition') {
        return (
          <ChainConditionForm
            stepIndex={index}
            step={step as ConditionLogicStep}
            onStepChange={(i, s) => { onStepChange(i, s); }}
            onRemoveStep={onRemoveStep}
            currentValueLabel={currentValueLabel}
          />
        );
      }
      if (step.kind === 'valueMap') {
        return (
          <ChainValueMapForm
            stepIndex={index}
            step={step as ValueMapLogicStep}
            onStepChange={(i, s) => { onStepChange(i, s); }}
            onRemoveStep={onRemoveStep}
            currentValueLabel={currentValueLabel}
          />
        );
      }
      return null;
    },
    [onStepChange, onRemoveStep, sourceOptions, currentValueLabel],
  );

  // -------------------------------------------------------------------------
  // Add step handler
  // -------------------------------------------------------------------------

  const handleAddStep = useCallback(
    (kind: LogicKind) => {
      setPickerOpen(false);
      onPickerOpenChange?.(false);
      onAddStep(kind);
    },
    [onAddStep, onPickerOpenChange],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const lastStep = steps.length > 0 ? steps[steps.length - 1] : undefined;

  return (
    <div
      className={['space-y-0', className ?? ''].filter(Boolean).join(' ')}
      data-testid="logic-step-list"
    >
      {steps.map((step, index) => (
        <div key={index} data-testid={`logic-step-list-item-${index}`}>
          <CollapsibleStepContainer
            step={step}
            index={index}
            isExpanded={expandedStepIndex === index}
            onToggle={handleToggle}
            onRemoveStep={onRemoveStep}
            renderForm={() => renderStepForm(step, index)}
          />

          {/* Step connector — vertical line between steps */}
          {index < steps.length - 1 && (
            <div
              className="flex justify-center py-1"
              aria-hidden="true"
              data-testid={`logic-step-connector-${index}`}
            >
              <div className="w-px h-4 bg-zinc-600" />
            </div>
          )}
        </div>
      ))}

      {/* Bottom connector before add picker */}
      {steps.length > 0 && (
        <div
          className="flex justify-center py-1"
          aria-hidden="true"
          data-testid="logic-step-list-bottom-connector"
        >
          <div className="w-px h-4 bg-zinc-600" />
        </div>
      )}

      {/* Add logic picker */}
      {isPickerOpen ? (
        <div data-testid="logic-step-list-picker">
          <AddLogicPicker
            precedingStepKind={lastStep?.kind}
            onSelectLogicKind={handleAddStep}
            onDismiss={() => {
              setPickerOpen(false);
              onPickerOpenChange?.(false);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setPickerOpen(true);
            onPickerOpenChange?.(true);
          }}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded-lg px-3 py-2 border border-dashed border-zinc-700 hover:border-zinc-500 transition-colors"
          data-testid="logic-step-list-add-logic"
        >
          Add Transformation, conditional logic, or value mapping
        </button>
      )}
    </div>
  );
}
