// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InheritanceIndicatorProps {
  /**
   * Whether the field has a non-undefined (explicitly set) value.
   * True → shows "Custom" badge.
   * False → shows "Using project default" text.
   */
  isCustom: boolean;
  /** Called when the user clicks "Reset to project default". */
  onReset: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Shows whether a config field is overriding the project default or using it.
 *
 * Phase 0 behaviour:
 * - "Custom" (blue badge) when the field has an explicit non-undefined value.
 * - "Using project default" (gray text) when the field is undefined.
 * - "Reset to project default" button visible only in the "Custom" state.
 *   Clicking it calls `onReset`, which the parent maps to `onUpdateConfig({ field: undefined })`.
 */
export function InheritanceIndicator({ isCustom, onReset }: InheritanceIndicatorProps) {
  if (isCustom) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="rounded bg-blue-900/60 px-1.5 py-0.5 text-xs font-medium text-blue-300"
          data-testid="inheritance-custom-badge"
        >
          Custom
        </span>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          data-testid="inheritance-reset-button"
          aria-label="Reset to project default"
        >
          Reset to project default
        </button>
      </div>
    );
  }

  return (
    <span
      className="text-xs text-slate-500"
      data-testid="inheritance-default-text"
    >
      Using project default
    </span>
  );
}
