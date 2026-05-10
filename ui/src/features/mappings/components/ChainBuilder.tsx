/**
 * ChainBuilder.tsx — FS-039 T-06
 *
 * New chain-based builder orchestration surface.
 *
 * This is a NEW component boundary — it does NOT extend or refactor
 * UnifiedExpressionBuilder.tsx. The legacy component is preserved unchanged.
 *
 * Responsibilities:
 *   - Manages ChainState (FS-039 model) internally
 *   - Hydrates from `initialExpression` via decomposeToChain() on mount/change
 *   - Generates DSL via generateChainExpression() on every state change
 *   - Propagates expression via onExpressionChange() on every change
 *   - Renders: source entry → ordered step list → [+ Add Step] button
 *   - [+ Add Step] gated on structural validity of last step
 *   - Step picker: type-filtered transforms + "Add condition" + "Add value map"
 *   - Condition/value map steps render placeholder cards (full editors in T-08/T-09)
 *   - No mode tabs — the chain model subsumes Value/Conditional/ValueMap modes
 *
 * Implements: AE-01, AE-02, AE-03, AE-11, AE-22, AE-23
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, GitBranch, Table2, Zap } from 'lucide-react';

import { TransformFunctionPicker } from './TransformFunctionPicker';
import { ChainSourceCard } from './ChainSourceCard';
import { StaticValueInput } from './StaticValueInput';
import { ChainStepCard } from './ChainStepCard';
import { ConditionStepEditor } from './ConditionStepEditor';
import { ValueMapStepEditor } from './ValueMapStepEditor';
import type { TargetFieldType } from './TargetFieldRow';

import {
  createEmptyChain,
  createEmptyFS039ConditionStep,
  createEmptyFS039ValueMapStep,
  isFS039ConditionStep,
  isFS039TransformStep,
  isFS039ValueMapStep,
  isFieldSource,
  isNoneSource,
  isStaticSource,
} from '../lib/chain-builder-state';
import type {
  ChainState,
  ChainStep,
  FS039TransformStep,
  FS039ConditionStep,
  FS039ValueMapStep,
  StaticValueBranch,
  ArgumentSlotRef,
} from '../lib/chain-builder-state';
import { generateChainExpression } from '../lib/chain-expression-generator';
import { decomposeToChain } from '../lib/chain-decomposer';
import { getCompatibleChainableTransforms } from '../lib/transform-chain-utils';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import { summarizeStep } from '../lib/chain-summary';
import type { ParsedSchema } from '@/lib/types/domain';
import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChainBuilderProps {
  /**
   * Expression to decompose for hydration on mount or when the target field changes.
   * When undefined or empty, the builder starts in empty state.
   */
  readonly initialExpression?: string;
  /**
   * Fires on every state change with the generated DSL expression.
   * The parent (ScalarFieldBuilder) calls updateDraft() with this value.
   */
  readonly onExpressionChange: (expression: string) => void;
  /** Parsed source schema for source field suggestions. */
  readonly parsedSourceSchema?: ParsedSchema | null;
  /**
   * JSON Schema type of the target field.
   * Used for type-compatibility filtering of transform functions.
   */
  readonly targetType?: TargetFieldType | string;
  /** Optional className for the root element. */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Step picker entry types
// ---------------------------------------------------------------------------

type StepPickerMode = 'closed' | 'transform' | 'special';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when a single step is structurally complete (can collapse).
 */
function isStepComplete(step: ChainStep): boolean {
  if (isFS039TransformStep(step)) {
    return step.functionName.trim().length > 0;
  }
  // Condition and value map steps are always considered complete for collapse
  // purposes (placeholder behavior; full validation in T-08/T-09).
  return true;
}

/**
 * Returns true when the last step in the chain is structurally complete,
 * meaning [+ Add Step] should be shown.
 *
 * Rules:
 *   - Empty steps list → true (can always add first step when source is set)
 *   - Last step is a transform with a function name → true
 *   - Last step is a condition with all branches non-empty → true
 *   - Last step is a value map with at least one mapping and a default → true
 *   - Otherwise → false
 */
function isLastStepComplete(steps: readonly ChainStep[]): boolean {
  if (steps.length === 0) return true;
  const last = steps[steps.length - 1]!;
  if (isFS039TransformStep(last)) {
    return last.functionName.trim().length > 0;
  }
  if (isFS039ConditionStep(last)) {
    // Condition is complete when it has at least one clause with a predicate
    // and the else branch has a source or static value set.
    // For placeholder purposes: always allow adding after condition (AE-22).
    return true;
  }
  if (isFS039ValueMapStep(last)) {
    // Value map is complete when it has at least one mapping row.
    // For placeholder purposes: always allow adding after value map (AE-23).
    return true;
  }
  return false;
}

/**
 * Returns true when the chain source is set (field or static).
 * [+ Add Step] is only shown when the source is set.
 */
function isSourceSet(chain: ChainState): boolean {
  return !isNoneSource(chain.source);
}

/**
 * Computes the output type of the last step for transform filtering.
 * Falls back to 'any' when the chain has no steps or the function is unknown.
 */
function getLastStepOutputType(chain: ChainState): string {
  if (chain.steps.length === 0) return 'any';
  const last = chain.steps[chain.steps.length - 1]!;
  if (!isFS039TransformStep(last) || !last.functionName) return 'any';
  const entry = DSL_FUNCTION_CATALOG.find((e) => e.name === last.functionName);
  return entry?.returnType ?? 'any';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Body content for a condition step — renders ConditionStepEditor (T-08).
 */
function ConditionStepBody({
  step,
  index,
  onStepChange,
  parsedSourceSchema,
}: {
  step: FS039ConditionStep;
  index: number;
  onStepChange: (updated: FS039ConditionStep) => void;
  parsedSourceSchema?: ParsedSchema | null;
}) {
  return (
    <ConditionStepEditor
      step={step}
      stepIndex={index}
      onChange={onStepChange}
      parsedSourceSchema={parsedSourceSchema}
      data-testid={`chain-step-condition-${index}-body`}
    />
  );
}

/**
 * Body content for a value map step — renders ValueMapStepEditor (T-09).
 */
function ValueMapStepBody({
  step,
  index,
  onStepChange,
  parsedSourceSchema,
}: {
  step: FS039ValueMapStep;
  index: number;
  onStepChange: (updated: FS039ValueMapStep) => void;
  parsedSourceSchema?: ParsedSchema | null;
}) {
  return (
    <ValueMapStepEditor
      step={step}
      stepIndex={index}
      onChange={onStepChange}
      parsedSourceSchema={parsedSourceSchema}
    />
  );
}

/**
 * Body content for a transform step (rendered inside ChainStepCard when expanded).
 */
function TransformStepBody({
  step,
  index,
  onFunctionChange,
  sourceOptions,
}: {
  step: FS039TransformStep;
  index: number;
  onFunctionChange: (functionName: string) => void;
  sourceOptions: readonly string[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const catalogEntry = DSL_FUNCTION_CATALOG.find((e) => e.name === step.functionName);
  const hasFunction = step.functionName.trim().length > 0;

  return (
    <div
      className="flex flex-col gap-2"
      data-testid={`chain-step-transform-${index}-body`}
    >
      {hasFunction ? (
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-xs text-blue-200"
            data-testid={`chain-step-transform-${index}-fn`}
          >
            {step.functionName}
          </span>
          {catalogEntry && (
            <span className="text-xs text-blue-600">{catalogEntry.description}</span>
          )}
          <button
            type="button"
            onClick={() => { setPickerOpen(true); }}
            className="ml-auto text-xs text-blue-500 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded px-1"
            data-testid={`chain-step-transform-${index}-change`}
          >
            Change
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setPickerOpen(true); }}
          className="w-full rounded border border-dashed border-blue-700/60 px-3 py-2 text-xs text-blue-500 hover:border-blue-500 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 transition-colors"
          data-testid={`chain-step-transform-${index}-select`}
        >
          Select function…
        </button>
      )}

      {pickerOpen && (
        <div className="relative z-10">
          <TransformFunctionPicker
            onSelect={(name) => {
              onFunctionChange(name);
              setPickerOpen(false);
            }}
            onClose={() => { setPickerOpen(false); }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step picker panel
// ---------------------------------------------------------------------------

function StepPickerPanel({
  onAddTransform,
  onAddCondition,
  onAddValueMap,
  onClose,
  allowedFunctions,
}: {
  onAddTransform: (functionName: string) => void;
  onAddCondition: () => void;
  onAddValueMap: () => void;
  onClose: () => void;
  allowedFunctions?: ReadonlySet<string>;
}) {
  return (
    <div
      className="rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
      data-testid="chain-step-picker"
    >
      {/* Special step types */}
      <div className="border-b border-zinc-700 p-2 space-y-1">
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Logic
        </p>
        <button
          type="button"
          onClick={() => { onAddCondition(); onClose(); }}
          className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 transition-colors"
          data-testid="chain-step-picker-condition"
        >
          <GitBranch className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
          Add condition
        </button>
        <button
          type="button"
          onClick={() => { onAddValueMap(); onClose(); }}
          className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 transition-colors"
          data-testid="chain-step-picker-valuemap"
        >
          <Table2 className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />
          Add value map
        </button>
      </div>

      {/* Transform function picker */}
      <div className="p-2">
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Transforms
        </p>
        <TransformFunctionPicker
          onSelect={onAddTransform}
          onClose={onClose}
          allowedFunctions={allowedFunctions}
          className="border-0 shadow-none rounded-none max-h-64"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * ChainBuilder — FS-039 chain-based builder orchestration surface.
 *
 * Manages ChainState internally. Hydrates from initialExpression.
 * Fires onExpressionChange on every state mutation.
 */
export function ChainBuilder({
  initialExpression,
  onExpressionChange,
  parsedSourceSchema,
  targetType,
  className = '',
}: ChainBuilderProps) {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [chain, setChain] = useState<ChainState>(() => {
    if (!initialExpression?.trim()) return createEmptyChain();
    const result = decomposeToChain(initialExpression);
    return 'chain' in result ? result.chain : createEmptyChain();
  });

  const [stepPickerOpen, setStepPickerOpen] = useState(false);

  /**
   * Accordion state: index of the currently expanded step, or null if none.
   * Newly added steps auto-expand. Only one step can be expanded at a time.
   */
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);

  // Keep onExpressionChange in a ref to avoid stale closures
  const onExpressionChangeRef = useRef(onExpressionChange);
  useEffect(() => {
    onExpressionChangeRef.current = onExpressionChange;
  });

  // -------------------------------------------------------------------------
  // Hydration: re-decompose when initialExpression changes
  // -------------------------------------------------------------------------

  const prevInitialExpressionRef = useRef(initialExpression);
  useEffect(() => {
    if (initialExpression === prevInitialExpressionRef.current) return;
    prevInitialExpressionRef.current = initialExpression;

    if (!initialExpression?.trim()) {
      setChain(createEmptyChain());
      return;
    }
    const result = decomposeToChain(initialExpression);
    setChain('chain' in result ? result.chain : createEmptyChain());
  }, [initialExpression]);

  // -------------------------------------------------------------------------
  // Expression generation: fire on every chain state change
  // -------------------------------------------------------------------------

  useEffect(() => {
    const expr = generateChainExpression(chain);
    onExpressionChangeRef.current(expr);
  }, [chain]);

  // -------------------------------------------------------------------------
  // Source handlers
  // -------------------------------------------------------------------------

  const handleSourceSelect = useCallback((path: string) => {
    setChain((prev) => ({
      ...prev,
      source: { kind: 'field', path },
    }));
  }, []);

  const handleStaticValueChange = useCallback((value: StaticValueBranch) => {
    setChain((prev) => ({
      ...prev,
      source: { kind: 'static', value },
    }));
  }, []);

  // -------------------------------------------------------------------------
  // Step handlers
  // -------------------------------------------------------------------------

  const handleAddTransformStep = useCallback((functionName: string) => {
    const newStep: FS039TransformStep = {
      kind: 'transform',
      functionName,
      args: [],
    };
    setChain((prev) => {
      const newIndex = prev.steps.length;
      setExpandedStepIndex(newIndex);
      return {
        ...prev,
        steps: [...prev.steps, newStep],
      };
    });
    setStepPickerOpen(false);
  }, []);

  const handleAddConditionStep = useCallback(() => {
    const newStep = createEmptyFS039ConditionStep();
    setChain((prev) => {
      const newIndex = prev.steps.length;
      setExpandedStepIndex(newIndex);
      return {
        ...prev,
        steps: [...prev.steps, newStep],
      };
    });
  }, []);

  const handleAddValueMapStep = useCallback(() => {
    const newStep = createEmptyFS039ValueMapStep();
    setChain((prev) => {
      const newIndex = prev.steps.length;
      setExpandedStepIndex(newIndex);
      return {
        ...prev,
        steps: [...prev.steps, newStep],
      };
    });
  }, []);

  const handleRemoveStep = useCallback((index: number) => {
    setChain((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }));
    setExpandedStepIndex((prev) => {
      if (prev === null) return null;
      if (prev === index) return null;
      if (prev > index) return prev - 1;
      return prev;
    });
  }, []);

  const handleTransformFunctionChange = useCallback((index: number, functionName: string) => {
    setChain((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) => {
        if (i !== index || !isFS039TransformStep(step)) return step;
        return { ...step, functionName, args: [] as readonly ArgumentSlotRef[] };
      }),
    }));
  }, []);

  const handleConditionStepChange = useCallback((index: number, updated: FS039ConditionStep) => {
    setChain((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) => (i === index ? updated : step)),
    }));
  }, []);

  const handleValueMapStepChange = useCallback((index: number, updated: FS039ValueMapStep) => {
    setChain((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) => (i === index ? updated : step)),
    }));
  }, []);

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const sourceOptions = parsedSourceSchema ? flattenSchemaPaths(parsedSourceSchema).map((e) => e.path) : [];
  const canAddStep = isSourceSet(chain) && isLastStepComplete(chain.steps);
  const outputType = getLastStepOutputType(chain);
  const compatibleTransforms = getCompatibleChainableTransforms(outputType);
  const allowedFunctionNames = new Set(compatibleTransforms.map((e) => e.name));

  const isStaticEntry = isStaticSource(chain.source);
  const isFieldEntry = isFieldSource(chain.source);
  const sourcePath = isFieldEntry ? chain.source.path : undefined;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={['flex flex-col gap-3', className].filter(Boolean).join(' ')}
      data-testid="chain-builder"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Source entry                                                         */}
      {/* ------------------------------------------------------------------ */}

      {/* Entry type toggle: Field | Static */}
      <div
        role="group"
        aria-label="Source entry type"
        className="inline-flex overflow-hidden rounded border border-zinc-700 self-start"
        data-testid="chain-builder-entry-toggle"
      >
        {(['field', 'static'] as const).map((kind) => {
          const active = kind === 'field' ? isFieldEntry || isNoneSource(chain.source) : isStaticEntry;
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              data-testid={`chain-builder-entry-${kind}`}
              onClick={() => {
                if (kind === 'field') {
                  setChain((prev) => ({
                    ...prev,
                    source: { kind: 'none' },
                    steps: [],
                  }));
                } else {
                  setChain((prev) => ({
                    ...prev,
                    source: { kind: 'static', value: { type: 'string', value: '' } },
                    steps: [],
                  }));
                }
              }}
              className={[
                'px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
                active
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
              ].join(' ')}
            >
              {kind === 'field' ? 'Source field' : 'Static value'}
            </button>
          );
        })}
      </div>

      {/* Source field picker */}
      {!isStaticEntry && (
        <ChainSourceCard
          sourcePath={sourcePath}
          logicStepCount={chain.steps.length}
          onSourceSelect={handleSourceSelect}
          onAddLogic={() => { setStepPickerOpen(true); }}
          data-testid="chain-builder-source-card"
        />
      )}

      {/* Static value input */}
      {isStaticEntry && (
        <StaticValueInput
          initialValue={
            isStaticSource(chain.source) && chain.source.value.type !== 'null'
              ? String((chain.source.value as { value: string | number | boolean }).value ?? '')
              : ''
          }
          targetType={targetType ?? 'string'}
          onValueChange={handleStaticValueChange}
          onValidChange={() => {}}
          onAddLogic={() => { setStepPickerOpen(true); }}
          data-testid="chain-builder-static-input"
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step list                                                            */}
      {/* ------------------------------------------------------------------ */}

      {chain.steps.length > 0 && (
        <div
          className="flex flex-col gap-2"
          data-testid="chain-step-list"
          aria-label="Chain steps"
        >
          {chain.steps.map((step, index) => {
            const isExpanded = expandedStepIndex === index;
            const isComplete = isStepComplete(step);

            if (isFS039TransformStep(step)) {
              return (
                <ChainStepCard
                  key={index}
                  index={index}
                  isExpanded={isExpanded}
                  isComplete={isComplete}
                  summary={summarizeStep(step)}
                  stepTypeLabel="Transform"
                  icon={<Zap className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />}
                  accentColor="blue"
                  onExpand={() => { setExpandedStepIndex(index); }}
                  onCollapse={() => { setExpandedStepIndex(null); }}
                  onRemove={() => { handleRemoveStep(index); }}
                  data-testid={`chain-step-card-${index}`}
                >
                  <TransformStepBody
                    step={step}
                    index={index}
                    onFunctionChange={(name) => { handleTransformFunctionChange(index, name); }}
                    sourceOptions={sourceOptions}
                  />
                </ChainStepCard>
              );
            }
            if (isFS039ConditionStep(step)) {
              return (
                <ChainStepCard
                  key={index}
                  index={index}
                  isExpanded={isExpanded}
                  isComplete={isComplete}
                  summary={summarizeStep(step)}
                  stepTypeLabel="Condition"
                  icon={<GitBranch className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />}
                  accentColor="amber"
                  onExpand={() => { setExpandedStepIndex(index); }}
                  onCollapse={() => { setExpandedStepIndex(null); }}
                  onRemove={() => { handleRemoveStep(index); }}
                  data-testid={`chain-step-card-${index}`}
                >
                  <ConditionStepBody
                    step={step}
                    index={index}
                    onStepChange={(updated) => { handleConditionStepChange(index, updated); }}
                    parsedSourceSchema={parsedSourceSchema}
                  />
                </ChainStepCard>
              );
            }
            if (isFS039ValueMapStep(step)) {
              return (
                <ChainStepCard
                  key={index}
                  index={index}
                  isExpanded={isExpanded}
                  isComplete={isComplete}
                  summary={summarizeStep(step)}
                  stepTypeLabel="Value Map"
                  icon={<Table2 className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />}
                  accentColor="purple"
                  onExpand={() => { setExpandedStepIndex(index); }}
                  onCollapse={() => { setExpandedStepIndex(null); }}
                  onRemove={() => { handleRemoveStep(index); }}
                  data-testid={`chain-step-card-${index}`}
                >
                  <ValueMapStepBody
                    step={step}
                    index={index}
                    onStepChange={(updated) => { handleValueMapStepChange(index, updated); }}
                    parsedSourceSchema={parsedSourceSchema}
                  />
                </ChainStepCard>
              );
            }
            return null;
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* [+ Add Step] button                                                  */}
      {/* ------------------------------------------------------------------ */}

      {canAddStep && (
        <div className="relative" data-testid="chain-add-step-container">
          <button
            type="button"
            onClick={() => { setStepPickerOpen((prev) => !prev); }}
            aria-expanded={stepPickerOpen}
            aria-haspopup="true"
            className="flex items-center gap-1.5 rounded border border-dashed border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:border-blue-500/60 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 transition-colors w-full justify-center"
            data-testid="chain-add-step-btn"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add step
          </button>

          {stepPickerOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20">
              <StepPickerPanel
                onAddTransform={handleAddTransformStep}
                onAddCondition={handleAddConditionStep}
                onAddValueMap={handleAddValueMapStep}
                onClose={() => { setStepPickerOpen(false); }}
                allowedFunctions={allowedFunctionNames}
              />
            </div>
          )}
        </div>
      )}

      {/* [+ Add Step] hidden message for screen readers when not available */}
      {!canAddStep && chain.steps.length > 0 && (
        <p className="sr-only" aria-live="polite">
          Complete the current step to add another.
        </p>
      )}
    </div>
  );
}
