/**
 * BuilderEmptyState — right panel content when no target field is selected.
 *
 * Shown in the target-driven layout when the user has not yet clicked a field
 * in the Target Worklist. Replaces the legacy "No rules yet" empty state in
 * the new three-column view.
 *
 * CTAs:
 *   - "Start with required fields" → fires onFilterRequired()
 *   - "Auto-map this schema"       → disabled, muted, tooltip
 *   - "Select a target field"      → visual hint (no callback needed)
 */

import { ArrowRight, Sparkles, Target } from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_MAP_TOOLTIP = 'AI-powered auto-mapping \u2014 available in a future release';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuilderEmptyStateProps {
  /** Fired when "Start with required fields" is clicked */
  onFilterRequired: () => void;
  /** Optional className for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * BuilderEmptyState — guidance panel shown before any target field is selected.
 */
export function BuilderEmptyState({ onFilterRequired, className = '' }: BuilderEmptyStateProps) {
  return (
    <div
      data-testid="builder-empty-state"
      className={`flex h-full flex-col items-center justify-center gap-6 px-6 py-10 text-center ${className}`}
    >
      {/* Icon */}
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-500">
        <Target size={24} aria-hidden="true" />
      </div>

      {/* Guidance text */}
      <div className="flex flex-col gap-1.5">
        <p
          className="text-sm font-medium text-slate-200"
          data-testid="empty-state-heading"
        >
          Select a target field to create its mapping
        </p>
        <p className="text-xs text-slate-500">
          Click any field in the Target Worklist to open its expression builder here.
        </p>
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-2 w-full max-w-[220px]">
        {/* Start with required fields */}
        <button
          type="button"
          data-testid="cta-required-fields"
          onClick={onFilterRequired}
          className={[
            'flex items-center justify-center gap-2 rounded border border-blue-600 bg-blue-600/20',
            'px-3 py-2 text-xs font-medium text-blue-300 transition-colors',
            'hover:bg-blue-600/30 hover:text-blue-200',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
          ].join(' ')}
        >
          <ArrowRight size={13} aria-hidden="true" />
          Start with required fields
        </button>

        {/* Auto-map — disabled placeholder */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          title={AUTO_MAP_TOOLTIP}
          data-testid="cta-automap"
          className={[
            'flex cursor-not-allowed items-center justify-center gap-2 rounded border border-slate-700',
            'px-3 py-2 text-xs font-medium text-slate-600 opacity-50',
          ].join(' ')}
        >
          <Sparkles size={13} aria-hidden="true" />
          Auto-map this schema
        </button>

        {/* Select a target field — visual hint, no action */}
        <p
          className="text-[11px] text-slate-600"
          data-testid="cta-select-hint"
          aria-live="polite"
        >
          ↑ Or click any field in the worklist
        </p>
      </div>
    </div>
  );
}
