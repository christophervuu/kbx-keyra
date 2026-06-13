import { COMPARISON_MODES } from '../../types';

import type { ComparisonMode } from '@/lib/types';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModeAvailabilityEntry {
  available: boolean;
  reason?: string;
}

export interface ComparisonModeSelectorProps {
  selectedMode: ComparisonMode;
  onModeChange: (mode: ComparisonMode) => void;
  modeAvailability: Record<ComparisonMode, ModeAvailabilityEntry>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODE_ORDER: ComparisonMode[] = [
  'current-vs-saved',
  'current-vs-dev',
  'current-vs-preprod',
  'dev-vs-preprod',
  'preprod-vs-prod',
];

function getModeLabel(mode: ComparisonMode): string {
  const cfg = COMPARISON_MODES[mode];
  return `${cfg.left.label} vs ${cfg.right.label}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Segmented selector for choosing a comparison mode.
 *
 * - Renders all 5 modes as radio-style buttons
 * - Disables unavailable modes and shows the reason as a tooltip
 * - Highlights the currently selected mode
 * - Keyboard navigable (native button focus)
 *
 * AE-02, AE-10, AE-12 (FS-037 T-05)
 */
export function ComparisonModeSelector({
  selectedMode,
  onModeChange,
  modeAvailability,
}: ComparisonModeSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Comparison mode"
      data-testid="comparison-mode-selector"
      className="flex flex-wrap gap-1"
    >
      {MODE_ORDER.map((mode) => {
        const { available, reason } = modeAvailability[mode];
        const isSelected = mode === selectedMode;
        const label = getModeLabel(mode);

        return (
          <button
            key={mode}
            role="radio"
            aria-checked={isSelected}
            aria-disabled={!available}
            disabled={!available}
            title={!available && reason ? reason : undefined}
            data-testid={`comparison-mode-option-${mode}`}
            onClick={() => {
              if (available) onModeChange(mode);
            }}
            className={[
              'rounded px-3 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
              isSelected
                ? 'bg-blue-600 text-white'
                : available
                  ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                  : 'cursor-not-allowed bg-slate-800 text-slate-500 opacity-50',
            ].join(' ')}
          >
            {label}
            {!available && reason && (
              <span className="sr-only"> — {reason}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
