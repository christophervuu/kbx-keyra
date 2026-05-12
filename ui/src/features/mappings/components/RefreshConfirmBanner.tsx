import { useEffect, useRef, useState } from 'react';

import { AlertCircle, RefreshCw, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RefreshConfirmBannerProps {
  /** Number of suggestions that will be regenerated */
  refreshCount: number;
  /** Number of accepted/edited suggestions that will be preserved */
  preservedCount: number;
  /** Called when the user confirms the refresh */
  onConfirm: () => void;
  /** Called when the user cancels or the banner auto-dismisses */
  onCancel: () => void;
  /** Auto-dismiss timeout in ms (default: 5000) */
  autoTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// RefreshConfirmBanner
// ---------------------------------------------------------------------------

/**
 * Inline confirmation banner for "Refresh All" — renders in the toolbar area.
 * Auto-dismisses after `autoTimeoutMs` (default 5 s) if no action is taken.
 */
export function RefreshConfirmBanner({
  refreshCount,
  preservedCount,
  onConfirm,
  onCancel,
  autoTimeoutMs = 5000,
}: RefreshConfirmBannerProps) {
  const [remaining, setRemaining] = useState(Math.ceil(autoTimeoutMs / 1000));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          onCancel();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="alertdialog"
      aria-label="Confirm refresh all suggestions"
      data-testid="refresh-confirm-banner"
      className={[
        'shrink-0 border-b border-amber-800/40 bg-amber-950/30 px-3 py-2',
        'flex flex-wrap items-center justify-between gap-2',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <AlertCircle size={13} className="mt-px shrink-0 text-amber-400" aria-hidden="true" />
        <p className="text-[10px] text-amber-200" data-testid="refresh-confirm-message">
          This will regenerate{' '}
          <span className="font-semibold">{refreshCount}</span>{' '}
          suggestion{refreshCount !== 1 ? 's' : ''}.
          {preservedCount > 0 && (
            <>
              {' '}
              <span className="font-semibold">{preservedCount}</span> accepted and edited
              suggestion{preservedCount !== 1 ? 's' : ''} will be preserved.
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          data-testid="refresh-confirm-cancel"
          onClick={onCancel}
          className={[
            'flex items-center gap-1 rounded border border-slate-700 bg-slate-800',
            'px-2 py-1 text-[10px] font-medium text-slate-300 transition-colors',
            'hover:bg-slate-700 hover:text-slate-100',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
          ].join(' ')}
        >
          <X size={9} aria-hidden="true" />
          Cancel ({remaining}s)
        </button>
        <button
          type="button"
          data-testid="refresh-confirm-ok"
          onClick={onConfirm}
          className={[
            'flex items-center gap-1 rounded bg-amber-700',
            'px-2 py-1 text-[10px] font-medium text-white transition-colors',
            'hover:bg-amber-600',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500',
          ].join(' ')}
        >
          <RefreshCw size={9} aria-hidden="true" />
          Refresh All
        </button>
      </div>
    </div>
  );
}
