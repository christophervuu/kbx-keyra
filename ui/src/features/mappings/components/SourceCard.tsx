/**
 * SourceCard — displays a selected source field path with an optional inline
 * transformation chain for the Source Card expression builder (FS-029 / FS-030).
 *
 * States:
 *   - Base: shows source path chip + [+ Add Transformation] button
 *   - Transform (single step): shows source path chip + 1 step pipeline
 *   - Transform (multi-step): shows source path chip + N-step vertical pipeline
 *
 * The pipeline renders each TransformChainStep as a labelled row with a remove
 * button and an argument form (via the `renderArgumentForm` render prop).
 * Steps are connected by a visual arrow connector.
 *
 * The component is intentionally decoupled from ArgumentForm internals.
 * The parent wires the ArgumentForm via `renderArgumentForm`.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { X, Plus, Zap, ArrowDown } from 'lucide-react';

import type {
  ArgumentSlot,
  DirectCopyState,
  InlineTransform,
  SourceWithTransformState,
  TransformChainStep,
} from '../lib/expression-builder-state';
import {
  createDirectCopyState,
  createSourceWithTransformState,
} from '../lib/expression-builder-state';
import { TransformFunctionPicker } from './TransformFunctionPicker';
import {
  getChainOutputType,
  getCompatibleChainableTransforms,
} from '../lib/transform-chain-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceCardProps {
  /** The source field path this card represents. */
  readonly source: string;
  /**
   * Optional type of the source field (e.g. `'string'`, `'number'`).
   * Used to filter the [+ Add Step] picker to type-compatible transforms (FS-030 AE-02).
   * When omitted, all chainable transforms are shown.
   */
  readonly sourceFieldType?: string;
  /** The inline transform chain currently applied, if any. */
  readonly transform?: InlineTransform;
  /**
   * Fires whenever the card's state changes.
   * Emits either a DirectCopyState (no transform) or SourceWithTransformState.
   */
  readonly onStateChange: (state: DirectCopyState | SourceWithTransformState) => void;
  /** Optional: fires when the card itself is removed from the builder. */
  readonly onRemove?: () => void;
  /**
   * Render prop for the Argument Form.
   * Called once per chain step when a transform is active. Receives the step's
   * function name, the full transform, the step index, and callbacks to update
   * the step's args or the full transform.
   *
   * All new fields (stepIndex, step, onStepArgsChange) are optional for
   * backward compatibility with consumers that only use the base fields.
   */
  readonly renderArgumentForm?: (props: {
    functionName: string;
    transform: InlineTransform;
    sourcePath: string;
    onTransformChange: (updated: InlineTransform) => void;
    /** Index of the step in the chain (0-based). */
    stepIndex?: number;
    /** The specific step being rendered. */
    step?: TransformChainStep;
    /** Callback to update a specific step's args within the chain. */
    onStepArgsChange?: (stepIndex: number, args: readonly ArgumentSlot[]) => void;
  }) => React.ReactNode;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Source Card: the primary UX element for single-source paths in the
 * Source Card expression builder (FS-029 / FS-030).
 */
export function SourceCard({
  source,
  sourceFieldType,
  transform,
  onStateChange,
  onRemove,
  renderArgumentForm,
  className,
}: SourceCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addStepPickerOpen, setAddStepPickerOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const addStepBtnRef = useRef<HTMLButtonElement>(null);
  // Refs for step remove buttons (for focus management)
  const stepRemoveBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const hasTransform = transform !== undefined && transform.steps.length > 0;

  // Compute the set of type-compatible functions for the [+ Add Step] picker (FS-030 AE-02).
  // Re-computed whenever the chain steps or source field type changes.
  const addStepAllowedFunctions = useMemo<ReadonlySet<string>>(() => {
    const steps = transform?.steps ?? [];
    const outputType = getChainOutputType(steps, sourceFieldType);
    const compatible = getCompatibleChainableTransforms(outputType);
    return new Set(compatible.map((e) => e.name));
  }, [transform?.steps, sourceFieldType]);

  // -------------------------------------------------------------------------
  // Handlers — initial transform selection
  // -------------------------------------------------------------------------

  const handleFunctionSelect = useCallback(
    (functionName: string) => {
      setPickerOpen(false);
      const newTransform: InlineTransform = {
        steps: [{ functionName, args: [] }],
      };
      onStateChange(createSourceWithTransformState(source, newTransform));
    },
    [source, onStateChange],
  );

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false);
    setTimeout(() => { addBtnRef.current?.focus(); }, 0);
  }, []);

  // -------------------------------------------------------------------------
  // Handlers — chain step management
  // -------------------------------------------------------------------------

  const handleAddStep = useCallback(
    (functionName: string) => {
      setAddStepPickerOpen(false);
      if (transform === undefined) return;
      const newSteps = [...transform.steps, { functionName, args: [] }];
      onStateChange(createSourceWithTransformState(source, { steps: newSteps }));
    },
    [source, transform, onStateChange],
  );

  const handleAddStepPickerClose = useCallback(() => {
    setAddStepPickerOpen(false);
    setTimeout(() => { addStepBtnRef.current?.focus(); }, 0);
  }, []);

  const handleRemoveStep = useCallback(
    (stepIndex: number) => {
      if (transform === undefined) return;
      const remaining = transform.steps.filter((_, i) => i !== stepIndex);
      if (remaining.length === 0) {
        onStateChange(createDirectCopyState(source));
        // Focus returns to the card area; no specific element to target
      } else {
        onStateChange(createSourceWithTransformState(source, { steps: remaining }));
        // Move focus to the next step's remove button, or the add-step button
        setTimeout(() => {
          const nextRef = stepRemoveBtnRefs.current[stepIndex] ?? stepRemoveBtnRefs.current[stepIndex - 1];
          if (nextRef) {
            nextRef.focus();
          } else {
            addStepBtnRef.current?.focus();
          }
        }, 0);
      }
    },
    [source, transform, onStateChange],
  );

  const handleTransformChange = useCallback(
    (updated: InlineTransform) => {
      onStateChange(createSourceWithTransformState(source, updated));
    },
    [source, onStateChange],
  );

  const handleStepArgsChange = useCallback(
    (stepIndex: number, args: readonly ArgumentSlot[]) => {
      if (transform === undefined) return;
      const newSteps = transform.steps.map((step, i) =>
        i === stepIndex ? { ...step, args } : step,
      );
      onStateChange(createSourceWithTransformState(source, { steps: newSteps }));
    },
    [source, transform, onStateChange],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={[
        'rounded-lg border border-zinc-700 bg-zinc-900',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="source-card"
    >
      {/* Card header: source path chip + remove card button */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Source path chip */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-900/60 border border-blue-700 min-w-0 flex-1"
          data-testid="source-card-path"
        >
          <span
            className="text-xs font-mono text-blue-400 shrink-0"
            aria-hidden="true"
          >
            ⬡
          </span>
          <span className="font-mono text-xs text-blue-100 truncate" title={source}>
            {source}
          </span>
        </div>

        {/* Remove card button */}
        {onRemove !== undefined && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove source ${source}`}
            title="Remove source"
            className="shrink-0 text-zinc-600 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded p-0.5 transition-colors"
            data-testid="source-card-remove"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Transform pipeline (when transform is active) */}
      {hasTransform && transform !== undefined && (
        <div
          className="border-t border-zinc-700"
          data-testid="source-card-argument-form"
        >
          <ol
            role="list"
            aria-label="Transform pipeline"
            className="divide-y divide-zinc-700/50"
            data-testid="source-card-pipeline"
          >
            {transform.steps.map((step, stepIndex) => (
              <li
                key={stepIndex}
                role="listitem"
                className="px-3 py-3 bg-zinc-800/50"
                data-testid={`source-card-step-${stepIndex}`}
              >
                {/* Step header: badge + remove button */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-900/50 border border-amber-700 text-xs text-amber-300 shrink-0"
                    data-testid={`source-card-step-badge-${stepIndex}`}
                    aria-label={`Step ${stepIndex + 1}: ${step.functionName}`}
                  >
                    <Zap className="h-3 w-3" aria-hidden="true" />
                    <span className="font-mono">{step.functionName}</span>
                  </span>

                  <span className="text-xs text-zinc-600 flex-1">
                    Step {stepIndex + 1}
                  </span>

                  <button
                    ref={(el) => { stepRemoveBtnRefs.current[stepIndex] = el; }}
                    type="button"
                    onClick={() => { handleRemoveStep(stepIndex); }}
                    aria-label={`Remove ${step.functionName} step`}
                    title={`Remove ${step.functionName}`}
                    className="shrink-0 text-zinc-500 hover:text-zinc-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded p-0.5 transition-colors"
                    data-testid={`source-card-remove-step-${stepIndex}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                {/* Argument form for this step */}
                <div data-testid={`source-card-step-form-${stepIndex}`}>
                  {renderArgumentForm !== undefined ? (
                    renderArgumentForm({
                      functionName: step.functionName,
                      transform,
                      sourcePath: source,
                      onTransformChange: handleTransformChange,
                      stepIndex,
                      step,
                      onStepArgsChange: handleStepArgsChange,
                    })
                  ) : (
                    <StepArgumentFormPlaceholder
                      step={step}
                      stepIndex={stepIndex}
                      sourcePath={source}
                      onStepArgsChange={handleStepArgsChange}
                    />
                  )}
                </div>

                {/* Visual connector between steps (not after last step) */}
                {stepIndex < transform.steps.length - 1 && (
                  <div
                    className="flex items-center gap-2 mt-3 text-zinc-600"
                    aria-hidden="true"
                    data-testid={`source-card-step-connector-${stepIndex}`}
                  >
                    <div className="flex-1 h-px bg-zinc-700" />
                    <ArrowDown className="h-3 w-3 shrink-0" />
                    <div className="flex-1 h-px bg-zinc-700" />
                  </div>
                )}
              </li>
            ))}
          </ol>

          {/* Add Step button */}
          <div className="border-t border-zinc-700/50 px-3 py-2 relative">
            <button
              ref={addStepBtnRef}
              type="button"
              onClick={() => { setAddStepPickerOpen((v) => !v); }}
              aria-expanded={addStepPickerOpen}
              aria-haspopup="listbox"
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 hover:border-zinc-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 transition-colors"
              data-testid="source-card-add-step"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Step
            </button>

            {addStepPickerOpen && (
              <div className="absolute left-3 top-full mt-1 z-30" data-testid="source-card-add-step-picker-popover">
                <TransformFunctionPicker
                  onSelect={handleAddStep}
                  onClose={handleAddStepPickerClose}
                  allowedFunctions={addStepAllowedFunctions}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Transformation button (base state only — no transform active) */}
      {!hasTransform && (
        <div className="border-t border-zinc-700/50 px-3 py-2 relative">
          <button
            ref={addBtnRef}
            type="button"
            onClick={() => { setPickerOpen((v) => !v); }}
            aria-expanded={pickerOpen}
            aria-haspopup="listbox"
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 hover:border-zinc-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 transition-colors"
            data-testid="source-card-add-transform"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add Transformation
          </button>

          {pickerOpen && (
            <div className="absolute left-3 top-full mt-1 z-30" data-testid="source-card-picker-popover">
              <TransformFunctionPicker
                onSelect={handleFunctionSelect}
                onClose={handlePickerClose}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepArgumentFormPlaceholder
//
// Minimal per-step inline form used when the real ArgumentForm is not yet wired.
// Renders the implicit first argument (source/previous step output) as a locked
// chip, and shows editable inputs for additional args.
// ---------------------------------------------------------------------------

interface StepArgumentFormPlaceholderProps {
  readonly step: TransformChainStep;
  readonly stepIndex: number;
  readonly sourcePath: string;
  readonly onStepArgsChange: (stepIndex: number, args: readonly ArgumentSlot[]) => void;
}

function StepArgumentFormPlaceholder({
  step,
  stepIndex,
  sourcePath,
  onStepArgsChange,
}: StepArgumentFormPlaceholderProps) {
  const implicitLabel = stepIndex === 0 ? `source("${sourcePath}")` : `[output of step ${stepIndex}]`;

  return (
    <div className="space-y-2" data-testid={`argument-form-placeholder-${stepIndex}`}>
      {/* Implicit first argument (locked) */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 w-16 shrink-0">arg 1</span>
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-900/40 border border-blue-800 text-xs font-mono text-blue-200"
          data-testid={`argument-form-placeholder-first-arg-${stepIndex}`}
          aria-label={`First argument (implicit): ${implicitLabel}`}
        >
          {implicitLabel}
        </div>
      </div>

      {/* Additional args */}
      {step.args.map((slot, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 w-16 shrink-0">arg {i + 2}</span>
          {slot.mode === 'literal' ? (
            <input
              type="text"
              value={slot.value}
              onChange={(e) => {
                const newArgs = step.args.map((a, idx) =>
                  idx === i ? { mode: 'literal' as const, value: e.target.value } : a,
                );
                onStepArgsChange(stepIndex, newArgs);
              }}
              aria-label={`Step ${stepIndex + 1} argument ${i + 2} value`}
              className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
              data-testid={`argument-form-placeholder-arg-${stepIndex}-${i + 2}`}
            />
          ) : slot.mode === 'source' ? (
            <span className="text-xs font-mono text-blue-200">source("{slot.path}")</span>
          ) : (
            <span className="text-xs text-zinc-400 italic">[expression]</span>
          )}
        </div>
      ))}

      <p className="text-xs text-zinc-600 italic">
        Full argument form available after integration.
      </p>
    </div>
  );
}
