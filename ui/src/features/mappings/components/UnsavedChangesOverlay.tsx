/**
 * UnsavedChangesOverlay.tsx — FS-039 T-10
 *
 * Modal overlay displaying a diff between draft rules and saved rules.
 *
 * Implements: AE-06, AE-07
 *
 * Structure:
 *   - Header: "N unsaved changes" + close button
 *   - Change list grouped by type: Modified → Added → Removed
 *   - Each entry: clickable field path, saved vs draft expression, Revert button
 *   - Empty state: "No unsaved changes"
 *   - Backdrop dismiss
 *
 * Accessibility: role="dialog", aria-modal, focus trap on mount.
 */

import { useEffect, useRef } from 'react';
import { X, RotateCcw, ArrowRight } from 'lucide-react';
import type { UnsavedChangeSummary, UnsavedChangeType } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnsavedChangesOverlayProps {
  /** The list of unsaved changes to display. */
  readonly changes: UnsavedChangeSummary[];
  /** Called when the user clicks Revert on an entry. */
  readonly onRevert: (targetPath: string) => void;
  /** Called when the user clicks a field path to navigate to it. Overlay should close. */
  readonly onNavigate: (targetPath: string) => void;
  /** Called when the overlay should close (close button or backdrop). */
  readonly onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GROUP_ORDER: UnsavedChangeType[] = ['modified', 'added', 'removed'];

const GROUP_LABELS: Record<UnsavedChangeType, string> = {
  modified: 'Modified',
  added: 'Added',
  removed: 'Removed',
};

const GROUP_ACCENT: Record<UnsavedChangeType, string> = {
  modified: 'text-blue-400',
  added: 'text-green-400',
  removed: 'text-red-400',
};

const GROUP_BADGE: Record<UnsavedChangeType, string> = {
  modified: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
  added: 'bg-green-900/40 text-green-300 border-green-700/50',
  removed: 'bg-red-900/40 text-red-300 border-red-700/50',
};

// ---------------------------------------------------------------------------
// ChangeEntry — a single field change row
// ---------------------------------------------------------------------------

interface ChangeEntryProps {
  readonly entry: UnsavedChangeSummary;
  readonly onRevert: () => void;
  readonly onNavigate: () => void;
}

function ChangeEntry({ entry, onRevert, onNavigate }: ChangeEntryProps) {
  const savedLabel =
    entry.savedExpression === null ? 'unmapped' : entry.savedExpression || '(empty)';
  const draftLabel =
    entry.draftExpression === '' ? 'will be removed' : entry.draftExpression;

  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-zinc-700/60 bg-zinc-900/40 p-3"
      data-testid={`unsaved-change-entry-${entry.targetPath}`}
    >
      {/* Field path — clickable to navigate */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <button
          type="button"
          onClick={onNavigate}
          className="text-left text-xs font-mono text-blue-300 hover:text-blue-100 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded truncate max-w-full block"
          aria-label={`Navigate to field ${entry.targetPath}`}
          data-testid={`unsaved-change-navigate-${entry.targetPath}`}
        >
          {entry.targetPath}
        </button>

        {/* Saved → Draft diff */}
        <div className="flex items-start gap-1.5 text-xs">
          <span
            className="shrink-0 text-zinc-500 font-mono"
            data-testid={`unsaved-change-saved-${entry.targetPath}`}
          >
            {savedLabel}
          </span>
          <ArrowRight className="h-3 w-3 shrink-0 text-zinc-600 mt-0.5" aria-hidden="true" />
          <span
            className="font-mono text-zinc-200 break-all"
            data-testid={`unsaved-change-draft-${entry.targetPath}`}
          >
            {draftLabel}
          </span>
        </div>
      </div>

      {/* Revert button */}
      <button
        type="button"
        onClick={onRevert}
        aria-label={`Revert changes to ${entry.targetPath}`}
        className="shrink-0 flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 transition-colors"
        data-testid={`unsaved-change-revert-${entry.targetPath}`}
      >
        <RotateCcw className="h-3 w-3" aria-hidden="true" />
        Revert
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component: UnsavedChangesOverlay
// ---------------------------------------------------------------------------

/**
 * UnsavedChangesOverlay — modal diff view for unsaved draft changes.
 *
 * Groups changes by type (Modified / Added / Removed).
 * Each entry shows the field path (clickable), saved vs draft expression,
 * and a per-field Revert button.
 */
export function UnsavedChangesOverlay({
  changes,
  onRevert,
  onNavigate,
  onClose,
}: UnsavedChangesOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap: focus the dialog on mount
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    // Find first focusable element
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length > 0) {
      focusable[0]!.focus();
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); };
  }, [onClose]);

  // Group changes by type
  const grouped = GROUP_ORDER.reduce<Record<UnsavedChangeType, UnsavedChangeSummary[]>>(
    (acc, type) => {
      acc[type] = changes.filter((c) => c.changeType === type);
      return acc;
    },
    { modified: [], added: [], removed: [] },
  );

  const totalCount = changes.length;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-start justify-end"
      data-testid="unsaved-changes-overlay"
    >
      {/* Clickable backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
        data-testid="unsaved-changes-backdrop"
      />

      {/* Dialog panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Unsaved changes"
        className="relative z-10 flex flex-col w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl"
        data-testid="unsaved-changes-panel"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
          <h2
            className="flex-1 text-sm font-semibold text-zinc-100"
            data-testid="unsaved-changes-title"
          >
            {totalCount === 0
              ? 'No unsaved changes'
              : `${totalCount} unsaved ${totalCount === 1 ? 'change' : 'changes'}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close unsaved changes"
            className="rounded p-1 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 transition-colors"
            data-testid="unsaved-changes-close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
          {totalCount === 0 ? (
            <p
              className="text-sm text-zinc-500 text-center py-8"
              data-testid="unsaved-changes-empty"
            >
              No unsaved changes.
            </p>
          ) : (
            GROUP_ORDER.map((type) => {
              const entries = grouped[type];
              if (entries.length === 0) return null;
              return (
                <section key={type} data-testid={`unsaved-changes-group-${type}`}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide ${GROUP_ACCENT[type]}`}
                    >
                      {GROUP_LABELS[type]}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${GROUP_BADGE[type]}`}
                    >
                      {entries.length}
                    </span>
                  </div>

                  {/* Entries */}
                  <div className="space-y-2">
                    {entries.map((entry) => (
                      <ChangeEntry
                        key={entry.targetPath}
                        entry={entry}
                        onRevert={() => { onRevert(entry.targetPath); }}
                        onNavigate={() => { onNavigate(entry.targetPath); onClose(); }}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
