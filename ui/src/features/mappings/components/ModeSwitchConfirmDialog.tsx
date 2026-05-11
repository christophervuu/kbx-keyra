/**
 * ModeSwitchConfirmDialog.tsx — FS-043 T-08
 *
 * Confirmation dialog for incompatible Array Builder mode switches.
 *
 * Shows:
 *   - "Switching from [X] to [Y]"
 *   - What will be kept (green checkmarks)
 *   - What will be discarded (red X marks)
 *   - Confirm / Cancel buttons
 *   - Optional "Restore previous draft" button when returning from Custom Expression
 *
 * Built on top of the existing ConfirmDialog focus-trap infrastructure but
 * rendered as a custom dialog to support the richer content layout.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';

import type { ArrayBuilderMode } from '../lib/array-builder-state';
import { getModePreservationRules } from '../lib/array-builder-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<ArrayBuilderMode, string> = {
  map: 'Map source array',
  filterMap: 'Filter + Map',
  buildFromValues: 'Build from values',
  mergeArrayBranches: 'Merge array branches',
  customExpression: 'Custom expression',
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModeSwitchConfirmDialogProps {
  /** Whether the dialog is open. */
  readonly open: boolean;
  /** The mode being switched from. */
  readonly fromMode: ArrayBuilderMode;
  /** The mode being switched to. */
  readonly toMode: ArrayBuilderMode;
  /**
   * When true, shows a "Restore previous draft" button.
   * Used when returning from Custom Expression with a stored structured draft.
   */
  readonly canRestorePrevious?: boolean;
  /** Called when the user confirms the switch. */
  readonly onConfirm: () => void;
  /** Called when the user cancels. */
  readonly onCancel: () => void;
  /** Called when the user chooses to restore the previous structured draft. */
  readonly onRestorePrevious?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModeSwitchConfirmDialog({
  open,
  fromMode,
  toMode,
  canRestorePrevious = false,
  onConfirm,
  onCancel,
  onRestorePrevious,
}: ModeSwitchConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const rules = getModePreservationRules(fromMode, toMode);
  const fromLabel = MODE_LABELS[fromMode];
  const toLabel = MODE_LABELS[toMode];

  // Focus trap
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    const frame = requestAnimationFrame(() => {
      if (!dialogRef.current) return;
      const focusable = getFocusableElements(dialogRef.current);
      focusable[0]?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = getFocusableElements(dialogRef.current);
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onCancel],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mode-switch-dialog-title"
      data-testid="mode-switch-confirm-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onCancel}
      />

      {/* Dialog panel */}
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="border-b border-slate-700 px-5 py-4">
          <h2
            id="mode-switch-dialog-title"
            className="text-sm font-semibold text-slate-100"
          >
            Switch to {toLabel}?
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Switching from <span className="font-medium text-slate-300">{fromLabel}</span>
          </p>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Kept items */}
          {rules.preserved.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Will be kept
              </p>
              <ul className="space-y-1">
                {rules.preserved.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check
                      size={12}
                      className="mt-0.5 shrink-0 text-green-400"
                      aria-hidden="true"
                    />
                    <span className="text-xs text-slate-300">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Discarded items */}
          {rules.discarded.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Will be discarded
              </p>
              <ul className="space-y-1">
                {rules.discarded.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <X
                      size={12}
                      className="mt-0.5 shrink-0 text-red-400"
                      aria-hidden="true"
                    />
                    <span className="text-xs text-slate-300">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* No changes message */}
          {rules.preserved.length === 0 && rules.discarded.length === 0 && (
            <p className="text-xs text-slate-400">
              All current configuration will be reset.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-700 px-5 py-3">
          {/* Restore previous draft (Custom Expression → structured) */}
          {canRestorePrevious && onRestorePrevious && (
            <button
              type="button"
              data-testid="mode-switch-restore-btn"
              onClick={onRestorePrevious}
              className="mr-auto flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              <RotateCcw size={11} aria-hidden="true" />
              Restore previous draft
            </button>
          )}

          <button
            type="button"
            data-testid="mode-switch-cancel-btn"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-500"
          >
            Cancel
          </button>

          <button
            type="button"
            data-testid="mode-switch-confirm-btn"
            onClick={onConfirm}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
          >
            Switch mode
          </button>
        </div>
      </div>
    </div>
  );
}
