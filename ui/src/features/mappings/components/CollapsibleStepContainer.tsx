/**
 * CollapsibleStepContainer — FS-038 T-11
 *
 * Wraps a single logic step in the chain builder with collapsible behavior.
 *
 * Collapsed state: shows step number badge, one-line summary, chevron, hover remove.
 * Expanded state: shows step number badge, kind label, chevron, full form content.
 *
 * AE-10: collapsible step summaries with single-step expansion
 */

import { useCallback } from 'react';
import { ChevronRight, ChevronDown, X } from 'lucide-react';

import type { LogicStep } from '../lib/chain-builder-state';
import { summarizeLogicStep } from '../lib/chain-builder-state';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollapsibleStepContainerProps {
  /** The logic step to render. */
  readonly step: LogicStep;
  /** Zero-based index of this step in the chain. */
  readonly index: number;
  /** Whether this step is currently expanded. */
  readonly isExpanded: boolean;
  /** Fires when the user clicks to toggle expand/collapse. */
  readonly onToggle: (index: number) => void;
  /** Fires when the user removes this step. */
  readonly onRemoveStep: (index: number) => void;
  /** Render prop for the full step form content. */
  readonly renderForm: () => React.ReactNode;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<LogicStep['kind'], string> = {
  transform: 'Transformation',
  condition: 'Condition',
  valueMap: 'Value map',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Collapsible wrapper for a single logic step in the chain.
 */
export function CollapsibleStepContainer({
  step,
  index,
  isExpanded,
  onToggle,
  onRemoveStep,
  renderForm,
  className,
}: CollapsibleStepContainerProps) {
  const handleToggle = useCallback(() => {
    onToggle(index);
  }, [index, onToggle]);

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemoveStep(index);
    },
    [index, onRemoveStep],
  );

  const summary = summarizeLogicStep(step);
  const kindLabel = KIND_LABEL[step.kind];

  return (
    <div
      className={[
        'rounded-lg border transition-colors',
        isExpanded ? 'border-blue-700/60 bg-transparent overflow-visible' : 'border-zinc-700 bg-transparent overflow-hidden',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`collapsible-step-${index}`}
    >
      {/* Header row — always visible */}
      <div
        className={[
          'flex items-center gap-2 px-3 py-2 cursor-pointer select-none group transition-colors',
          isExpanded ? 'border-b border-zinc-700' : 'hover:bg-zinc-900/40',
        ].join(' ')}
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? `Collapse step ${index + 1}` : `Expand step ${index + 1}: ${summary}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        data-testid={`collapsible-step-header-${index}`}
      >
        {/* Step number badge */}
        <span
          className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-zinc-700 text-[10px] font-semibold text-zinc-300"
          aria-hidden="true"
          data-testid={`collapsible-step-badge-${index}`}
        >
          {index + 1}
        </span>

        {/* Summary or kind label */}
        {isExpanded ? (
          <span
            className="flex-1 text-xs font-semibold text-zinc-300 uppercase tracking-wide"
            data-testid={`collapsible-step-kind-label-${index}`}
          >
            {kindLabel}
          </span>
        ) : (
          <span
            className="flex-1 text-xs text-zinc-400 truncate font-mono"
            data-testid={`collapsible-step-summary-${index}`}
          >
            {summary}
          </span>
        )}

        {/* Chevron */}
        <span className="shrink-0 text-zinc-500" aria-hidden="true">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>

        {/* Remove button — always visible, subtle */}
        <button
          type="button"
          onClick={handleRemove}
          aria-label={`Remove step ${index + 1}`}
          className="shrink-0 text-zinc-600 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded p-0.5 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          data-testid={`collapsible-step-remove-${index}`}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {/* Expanded content — CSS grid transition for smooth animation */}
      <div
        className={[
          'grid transition-all duration-200 ease-in-out',
          isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        ].join(' ')}
        data-testid={`collapsible-step-content-${index}`}
        aria-hidden={!isExpanded}
      >
        <div className={isExpanded ? 'min-h-0 overflow-visible' : 'overflow-hidden'}>
          {isExpanded && (
            <div className="p-2" data-testid={`collapsible-step-form-${index}`}>
              {renderForm()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
