/**
 * ErrorTooltip — small tooltip card shown when the cursor is inside an error range.
 *
 * Positioned absolutely within the editor container (not portal-rendered),
 * placed below the editor area. Styled by severity:
 * - error → red left border
 * - warning → yellow left border
 * - info → blue left border
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ErrorTooltipProps {
  readonly code: string;
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'info';
  /** Position in pixels relative to nearest positioned ancestor (the editor container) */
  readonly position: { readonly top: number; readonly left: number };
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function borderClass(severity: ErrorTooltipProps['severity']): string {
  switch (severity) {
    case 'error':   return 'border-l-red-500';
    case 'warning': return 'border-l-yellow-500';
    case 'info':    return 'border-l-blue-400';
  }
}

function codeClass(severity: ErrorTooltipProps['severity']): string {
  switch (severity) {
    case 'error':   return 'bg-red-900 text-red-300';
    case 'warning': return 'bg-yellow-900 text-yellow-300';
    case 'info':    return 'bg-blue-900 text-blue-300';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Inline error tooltip displayed below the editor when the cursor is inside an
 * error-decorated range. Severity drives the color scheme (red / yellow / blue).
 */
export function ErrorTooltip({ code, message, severity, position, className }: ErrorTooltipProps) {
  return (
    <div
      role="tooltip"
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        zIndex: 10,
        maxWidth: '400px',
        pointerEvents: 'none',
      }}
      className={[
        'flex items-start gap-2 px-3 py-2 rounded-md shadow-lg',
        'bg-zinc-800 border border-zinc-600 border-l-4',
        borderClass(severity),
        'text-sm',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Code badge */}
      <span
        className={[
          'shrink-0 rounded px-1.5 py-0.5 text-xs font-mono font-bold',
          codeClass(severity),
        ].join(' ')}
      >
        {code}
      </span>

      {/* Message */}
      <span className="text-slate-200 leading-snug">{message}</span>
    </div>
  );
}
