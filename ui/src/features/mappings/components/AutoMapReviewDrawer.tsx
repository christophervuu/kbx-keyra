import { AlertTriangle, Loader2, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import type { AutoMapReviewSummary } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoMapReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sectionPath: string | null;
  summary: AutoMapReviewSummary;
  onAcceptAllValid: () => void;
  /** Current async status from useAutoMapReview */
  status?: 'idle' | 'loading' | 'success' | 'error';
  /** Error message when status === 'error' */
  error?: string | null;
  /** Called when user clicks "Try Again" in error state */
  onRetry?: () => void;
  /** Number of suggestion items (drives empty-state detection) */
  itemCount?: number;
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Summary badges
// ---------------------------------------------------------------------------

interface BadgeProps {
  label: string;
  colorClass: string;
}

function Badge({ label, colorClass }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
        colorClass,
      ].join(' ')}
    >
      {label}
    </span>
  );
}

interface SummaryBadgesProps {
  summary: AutoMapReviewSummary;
}

function SummaryBadges({ summary }: SummaryBadgesProps) {
  const hasValidationData =
    summary.validCount + summary.warningCount + summary.invalidCount > 0;

  if (!hasValidationData) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <Badge
          label={`${summary.total} suggestion${summary.total !== 1 ? 's' : ''}`}
          colorClass="bg-slate-700 text-slate-300"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      {summary.validCount > 0 && (
        <Badge
          label={`${summary.validCount} valid`}
          colorClass="bg-green-900/60 text-green-300"
        />
      )}
      {summary.warningCount > 0 && (
        <Badge
          label={`${summary.warningCount} warning${summary.warningCount !== 1 ? 's' : ''}`}
          colorClass="bg-amber-900/60 text-amber-300"
        />
      )}
      {summary.invalidCount > 0 && (
        <Badge
          label={`${summary.invalidCount} invalid`}
          colorClass="bg-red-900/60 text-red-300"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk actions bar
// ---------------------------------------------------------------------------

interface BulkActionsBarProps {
  summary: AutoMapReviewSummary;
  onAcceptAllValid: () => void;
  hidden?: boolean;
}

function BulkActionsBar({ summary, onAcceptAllValid, hidden }: BulkActionsBarProps) {
  const hasValidationData =
    summary.validCount + summary.warningCount + summary.invalidCount > 0;

  // "Accept All Valid" is disabled when no pending suggestions remain
  const isDisabled = hidden || summary.pending === 0;

  const buttonLabel = hasValidationData ? 'Accept All Valid' : 'Accept All';

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-2.5">
      <button
        type="button"
        onClick={onAcceptAllValid}
        disabled={isDisabled}
        className={[
          'rounded px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500',
          isDisabled
            ? 'cursor-not-allowed bg-blue-800/40 text-blue-400/50'
            : 'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700',
        ].join(' ')}
      >
        {buttonLabel}
      </button>

      {summary.accepted > 0 && (
        <span className="text-xs text-slate-400">
          {summary.accepted} of {summary.total} accepted
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Completion banner
// ---------------------------------------------------------------------------

function CompletionBanner({ summary }: { summary: AutoMapReviewSummary }) {
  const parts: string[] = [];
  if (summary.accepted > 0) parts.push(`${summary.accepted} accepted`);
  if (summary.edited > 0) parts.push(`${summary.edited} edited`);
  if (summary.dismissed > 0) parts.push(`${summary.dismissed} dismissed`);

  return (
    <div
      className="mb-3 flex items-start gap-2 rounded-lg border border-green-800/50 bg-green-900/20 px-3 py-2.5"
      data-testid="completion-banner"
    >
      {/* CheckCircle icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-px shrink-0 text-green-400"
        aria-hidden="true"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      <div>
        <p className="text-sm font-medium text-green-300">
          All {summary.total} suggestion{summary.total !== 1 ? 's' : ''} reviewed
        </p>
        {parts.length > 0 && (
          <p className="mt-0.5 text-xs text-slate-400">{parts.join(', ')}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading state (AE-15)
// ---------------------------------------------------------------------------

function DrawerLoadingState({ sectionPath }: { sectionPath: string | null }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center"
      data-testid="drawer-loading-state"
    >
      <Loader2 size={24} className="animate-spin text-blue-400" aria-hidden="true" />
      <p className="text-sm text-slate-300">
        Generating suggestions
        {sectionPath ? (
          <>
            {' for '}
            <span className="font-mono text-slate-200">{sectionPath}</span>
          </>
        ) : null}
        {'…'}
      </p>
      <p className="text-xs text-slate-500">This may take a moment.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state (AE-10)
// ---------------------------------------------------------------------------

function DrawerEmptyState({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center"
      data-testid="drawer-empty-state"
    >
      <Inbox size={32} className="text-slate-600" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-300">No suggestions generated</p>
      <p className="max-w-[280px] text-xs text-slate-500">
        All target fields in this section may already be mapped, or the AI could not determine
        appropriate mappings.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-1 rounded border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        Close
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state (AE-11)
// ---------------------------------------------------------------------------

interface DrawerErrorStateProps {
  error: string | null;
  onRetry?: () => void;
  onClose: () => void;
}

function DrawerErrorState({ error, onRetry, onClose }: DrawerErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center"
      data-testid="drawer-error-state"
    >
      <AlertTriangle size={28} className="text-amber-400" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-300">Failed to generate suggestions</p>
      <p className="max-w-[280px] text-xs text-slate-400">
        {error ?? 'An unexpected error occurred. Please try again.'}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Try Again
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AutoMapReviewDrawer
// ---------------------------------------------------------------------------

/**
 * Right-side fixed drawer for reviewing Auto-Map suggestions.
 *
 * Follows the VersionHistoryDrawer pattern:
 * - fixed right-0 top-0 z-50, full height, w-[520px]
 * - Backdrop overlay (z-40) with click-to-close
 * - role="dialog", aria-modal="true"
 * - Focus trap on mount
 * - Escape key closes
 *
 * Renders one of four body states based on `status`:
 * - loading  → spinner + contextual message (AE-15)
 * - error    → error message + retry/close (AE-11)
 * - success + itemCount === 0 → empty state (AE-10)
 * - success + itemCount > 0  → completion banner (when pending=0) + children cards
 *
 * Returns null when isOpen is false (no DOM rendered).
 */
export function AutoMapReviewDrawer({
  isOpen,
  onClose,
  sectionPath,
  summary,
  onAcceptAllValid,
  status = 'success',
  error = null,
  onRetry,
  itemCount,
  children,
}: AutoMapReviewDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus close button when drawer opens
  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  // Escape key closes drawer
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !drawerRef.current) return;

    const drawer = drawerRef.current;

    function handleFocusTrap(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      const focusable = drawer.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const focusableArray = Array.from(focusable);
      if (focusableArray.length === 0) return;

      const first = focusableArray[0];
      const last = focusableArray[focusableArray.length - 1];

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

    document.addEventListener('keydown', handleFocusTrap);
    return () => {
      document.removeEventListener('keydown', handleFocusTrap);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Bulk actions bar is hidden during loading/error states
  const hideBulkActions = status === 'loading' || status === 'error';

  // Resolved item count: prefer explicit prop, fall back to summary.total
  const resolvedItemCount = itemCount ?? summary.total;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-label="Auto-Map Review"
        aria-modal="true"
        className="fixed right-0 top-0 z-50 flex h-full w-[520px] flex-col bg-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 flex-col gap-1 border-b border-slate-700 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">Auto-Map Review</h2>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close Auto-Map review"
              onClick={onClose}
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {sectionPath !== null && (
            <p className="text-xs text-slate-400" data-testid="section-path-subtitle">
              {sectionPath}
            </p>
          )}

          {/* Only show summary badges when we have results */}
          {status === 'success' && resolvedItemCount > 0 && (
            <SummaryBadges summary={summary} />
          )}
        </div>

        {/* Bulk actions bar — hidden during loading/error */}
        {!hideBulkActions && (
          <BulkActionsBar summary={summary} onAcceptAllValid={onAcceptAllValid} />
        )}

        {/* Scrollable body — conditional on status */}
        <div className="flex flex-1 flex-col overflow-y-auto px-3 py-2">
          {status === 'loading' && (
            <DrawerLoadingState sectionPath={sectionPath} />
          )}

          {status === 'error' && (
            <DrawerErrorState error={error} onRetry={onRetry} onClose={onClose} />
          )}

          {status === 'success' && resolvedItemCount === 0 && (
            <DrawerEmptyState onClose={onClose} />
          )}

          {status === 'success' && resolvedItemCount > 0 && (
            <>
              {/* Completion summary banner — shown when all suggestions are resolved */}
              {summary.pending === 0 && summary.total > 0 && (
                <CompletionBanner summary={summary} />
              )}
              {children}
            </>
          )}
        </div>
      </div>
    </>
  );
}
