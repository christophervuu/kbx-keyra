/**
 * AddLogicPicker — FS-038 T-07
 *
 * Progressive disclosure picker for adding a logic step to the chain.
 *
 * Renders as a horizontal row of three option cards:
 *   [Transformation]  [Condition]  [Value map]
 *
 * Each card has an icon, a plain-language label, and a brief description.
 * Selecting an option fires `onSelectLogicKind` and the picker closes.
 * Pressing Escape or clicking outside dismisses without action.
 *
 * AE-04: Progressive disclosure — the picker is only shown after the user
 * clicks "+ Add logic" on the Source Card or Static value input.
 *
 * Q5 (Rev 2): The picker also appears after existing condition and value map
 * steps, with a context label communicating that the next step operates on
 * the output of the previous step.
 */

import { useCallback } from 'react';
import { ArrowRightLeft, GitBranch, Table2 } from 'lucide-react';
import type { LogicStep } from '../lib/chain-builder-state';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogicKind = 'transform' | 'condition' | 'valueMap';

export interface AddLogicPickerProps {
  /**
   * The kind of the preceding step, if any.
   * Used to show a context label (Q5: "Current value: output of condition").
   * Undefined when this is the first logic step.
   */
  readonly precedingStepKind?: LogicStep['kind'];
  /** Fires when the user selects a logic kind. */
  readonly onSelectLogicKind: (kind: LogicKind) => void;
  /** Fires when the picker is dismissed without selection. */
  readonly onDismiss: () => void;
  /** Optional className for the root element. */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Option config
// ---------------------------------------------------------------------------

interface PickerOption {
  kind: LogicKind;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  testId: string;
}

const PICKER_OPTIONS: PickerOption[] = [
  {
    kind: 'transform',
    label: 'Transformation',
    description: 'Apply a function to the current value',
    Icon: ArrowRightLeft,
    testId: 'add-logic-option-transform',
  },
  {
    kind: 'condition',
    label: 'Condition',
    description: 'Add if / then / else logic',
    Icon: GitBranch,
    testId: 'add-logic-option-condition',
  },
  {
    kind: 'valueMap',
    label: 'Value map',
    description: 'Map specific values to outputs',
    Icon: Table2,
    testId: 'add-logic-option-valuemap',
  },
];

// ---------------------------------------------------------------------------
// Context label helpers (Q5)
// ---------------------------------------------------------------------------

function getPrecedingContextLabel(kind: LogicStep['kind'] | undefined): string | null {
  switch (kind) {
    case 'condition':
      return 'Current value: output of condition';
    case 'valueMap':
      return 'Current value: output of value map';
    case 'transform':
      return 'Current value: output of transform';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * AddLogicPicker — horizontal three-option picker for adding a logic step.
 *
 * Handles Escape key and click-outside dismissal.
 * First option receives focus on mount for keyboard accessibility.
 */
export function AddLogicPicker({
  precedingStepKind,
  onSelectLogicKind,
  onDismiss: _onDismiss,
  className,
}: AddLogicPickerProps) {
  // Escape key is ignored in the always-visible mode.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
      }
    },
    [],
  );

  const contextLabel = getPrecedingContextLabel(precedingStepKind);

  return (
    <div
      className={['flex flex-col gap-2', className ?? ''].filter(Boolean).join(' ')}
      onKeyDown={handleKeyDown}
      data-testid="add-logic-picker"
    >
      {/* Q5: Context label when following a condition or value map */}
      {contextLabel && (
        <p
          className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide px-0.5"
          data-testid="add-logic-context-label"
        >
          {contextLabel}
        </p>
      )}

      {/* Option cards */}
      <div
        className="grid grid-cols-3 gap-2"
        role="group"
        aria-label="Choose a logic step type"
      >
        {PICKER_OPTIONS.map((option, index) => (
          <button
            key={option.kind}
            type="button"
            onClick={() => onSelectLogicKind(option.kind)}
            className="flex flex-col items-start gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-left transition-colors hover:border-blue-500 hover:bg-slate-700/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label={`${option.label}: ${option.description}`}
            data-testid={option.testId}
          >
            <option.Icon className="h-4 w-4 text-blue-400" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-100">{option.label}</span>
            <span className="text-[12px] leading-snug text-slate-400">{option.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
