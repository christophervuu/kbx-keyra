/**
 * ArrayContextBanner
 *
 * Info banner shown at the top of Step 3 when the guided builder is in array
 * context mode (i.e. the selected transform is map() or filter() and the
 * selected source field is an array type).
 *
 * Informs the user that `item()` should be used to reference element fields
 * instead of `source()`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArrayContextBannerProps {
  /** The array transform function in use, e.g. "map" or "filter". */
  readonly functionName: string;
  /** The source field path that resolves to an array, e.g. "order.items". */
  readonly sourceField: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArrayContextBanner({ functionName, sourceField }: ArrayContextBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="array-context-banner"
      className="flex items-start gap-2.5 rounded-md border border-blue-700/50 bg-blue-950/60 px-3 py-2.5 text-sm text-blue-200"
    >
      {/* Info icon */}
      <svg
        aria-hidden="true"
        focusable="false"
        className="mt-0.5 h-4 w-4 shrink-0 text-blue-400"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
          clipRule="evenodd"
        />
      </svg>

      <span>
        You are inside{' '}
        <code className="rounded bg-blue-900/60 px-1 font-mono text-blue-300">
          {functionName}()
        </code>
        {' '}on{' '}
        <code className="rounded bg-blue-900/60 px-1 font-mono text-blue-300">
          {sourceField}
        </code>
        {' '}— use{' '}
        <code className="rounded bg-blue-900/60 px-1 font-mono text-blue-300">
          item()
        </code>
        {' '}to access array element fields.
      </span>
    </div>
  );
}
