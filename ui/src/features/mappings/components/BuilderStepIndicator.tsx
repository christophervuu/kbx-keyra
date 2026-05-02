/**
 * BuilderStepIndicator — horizontal step progress indicator for the guided builder.
 *
 * Renders step circles connected by lines. Supports:
 * - Active step (blue ring, white text)
 * - Completed steps (blue fill, check mark, clickable to navigate back)
 * - Pending steps (gray fill)
 *
 * Uses `aria-current="step"` on the active circle and descriptive aria-labels.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuilderStepIndicatorProps {
  /** 1-based index of the currently active step */
  readonly currentStep: number;
  readonly totalSteps: number;
  /** Labels for each step, indexed from 0 */
  readonly stepLabels: readonly string[];
  /** Called when a completed step circle is clicked — enables back-navigation */
  readonly onStepClick?: (step: number) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BuilderStepIndicator({
  currentStep,
  totalSteps,
  stepLabels,
  onStepClick,
  className,
}: BuilderStepIndicatorProps) {
  return (
    <nav
      aria-label="Builder steps"
      className={['flex items-start gap-0', className ?? ''].filter(Boolean).join(' ')}
    >
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;
        const isPending = step > currentStep;
        const label = stepLabels[i] ?? `Step ${step}`;
        const isClickable = isCompleted && onStepClick !== undefined;

        const circleClass = [
          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
          isCompleted
            ? 'bg-blue-500 text-white'
            : isActive
              ? 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-zinc-900'
              : 'bg-zinc-700 text-zinc-400',
          isClickable ? 'cursor-pointer hover:bg-blue-400' : 'cursor-default',
        ]
          .filter(Boolean)
          .join(' ');

        const connectorClass = [
          'h-0.5 w-8 mt-3.5 shrink-0',
          isCompleted ? 'bg-blue-500' : 'bg-zinc-600',
        ].join(' ');

        return (
          <div key={step} className="flex items-start">
            {/* Connector line between steps */}
            {step > 1 && <div className={connectorClass} aria-hidden="true" />}

            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1 min-w-[3rem]">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => {
                  if (isClickable) onStepClick?.(step);
                }}
                aria-label={`${label}${isCompleted ? ', completed' : isActive ? ', current step' : ', not yet reached'}`}
                aria-current={isActive ? 'step' : undefined}
                aria-disabled={!isClickable}
                className={circleClass}
              >
                {isCompleted ? '✓' : step}
              </button>
              <span
                className={[
                  'text-xs text-center leading-tight',
                  isActive ? 'text-zinc-200' : isPending ? 'text-zinc-500' : 'text-zinc-400',
                ].join(' ')}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
