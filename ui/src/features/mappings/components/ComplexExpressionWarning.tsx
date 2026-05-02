/**
 * ComplexExpressionWarning
 *
 * Shown when the user tries to switch from Editor → Builder mode but the
 * current expression is too complex to decompose (e.g. too deeply nested
 * or uses an unsupported function).
 *
 * Offers two actions per AE-07:
 *  - "Stay in Editor" — dismiss, remain in editor mode
 *  - "Try Builder anyway" — switch anyway (partial population)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComplexExpressionWarningProps {
  /** User-facing reason why decomposition failed. */
  readonly reason: string;
  /** Called when the user clicks "Stay in Editor". */
  readonly onStayInEditor: () => void;
  /** Called when the user clicks "Try Builder anyway". */
  readonly onTryBuilder: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ComplexExpressionWarning({
  reason,
  onStayInEditor,
  onTryBuilder,
}: ComplexExpressionWarningProps) {
  return (
    <div
      role="alert"
      data-testid="complex-expression-warning"
      className="flex flex-col gap-3 rounded-md border border-amber-700/60 bg-amber-950/60 px-4 py-3"
    >
      {/* Header */}
      <div className="flex items-start gap-2.5">
        {/* Warning icon */}
        <svg
          aria-hidden="true"
          focusable="false"
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>

        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-amber-300">
            Expression too complex for Builder
          </p>
          <p className="text-sm text-amber-200/80">
            {reason}
          </p>
          <p className="text-xs text-amber-400/70 mt-0.5">
            You can continue editing in raw mode, or switch to Builder to see a partial view.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pl-6">
        <button
          type="button"
          onClick={onStayInEditor}
          className="px-3 py-1.5 text-sm rounded font-medium bg-amber-600 text-white hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 transition-colors"
        >
          Stay in Editor
        </button>
        <button
          type="button"
          onClick={onTryBuilder}
          className="px-3 py-1.5 text-sm rounded font-medium border border-amber-700 text-amber-300 hover:bg-amber-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 transition-colors"
        >
          Try Builder anyway
        </button>
      </div>
    </div>
  );
}
