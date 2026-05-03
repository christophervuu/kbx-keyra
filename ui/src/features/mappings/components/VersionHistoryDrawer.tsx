import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import type { VersionHistoryEntry } from '../hooks/use-version-history';

// ---------------------------------------------------------------------------
// Relative time formatter
// ---------------------------------------------------------------------------

export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hours ago`;
  return new Date(isoString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// VersionListItem
// ---------------------------------------------------------------------------

export interface VersionListItemProps {
  entry: VersionHistoryEntry;
  isSelected: boolean;
  isCurrent: boolean;
  onSelect: (version: number) => void;
}

export function VersionListItem({ entry, isSelected, isCurrent, onSelect }: VersionListItemProps) {
  function handleClick() {
    if (!isCurrent) {
      onSelect(entry.version);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isCurrent && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onSelect(entry.version);
    }
  }

  return (
    <div
      role={isCurrent ? undefined : 'button'}
      tabIndex={isCurrent ? undefined : 0}
      aria-pressed={isCurrent ? undefined : isSelected}
      onClick={isCurrent ? undefined : handleClick}
      onKeyDown={isCurrent ? undefined : handleKeyDown}
      className={[
        'flex flex-col gap-1 rounded-lg px-3 py-3 transition-colors',
        isCurrent
          ? 'cursor-default opacity-70'
          : 'cursor-pointer hover:bg-slate-700/60',
        isSelected && !isCurrent
          ? 'border border-blue-500 bg-slate-700/80'
          : 'border border-transparent',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center gap-2">
        <span className="rounded bg-slate-600 px-1.5 py-0.5 text-xs font-mono font-semibold text-slate-200">
          v{entry.version}
        </span>
        {isCurrent && (
          <span className="rounded bg-blue-600/80 px-1.5 py-0.5 text-xs font-medium text-blue-100">
            Current
          </span>
        )}
        <span className="ml-auto text-xs text-slate-400">
          {formatRelativeTime(entry.savedAt)}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>{entry.ruleCount} rules</span>
        <span aria-hidden="true">·</span>
        <span className="text-slate-300">{entry.summary}</span>
      </div>
      <div className="text-xs text-slate-500">
        Saved by {entry.savedBy}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton placeholder
// ---------------------------------------------------------------------------

function SkeletonItem() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-transparent px-3 py-3" aria-hidden="true">
      <div className="flex items-center gap-2">
        <div className="h-5 w-8 animate-pulse rounded bg-slate-700" />
        <div className="ml-auto h-4 w-16 animate-pulse rounded bg-slate-700" />
      </div>
      <div className="h-4 w-3/4 animate-pulse rounded bg-slate-700" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-700" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// VersionHistoryDrawer
// ---------------------------------------------------------------------------

export interface VersionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  versions: readonly VersionHistoryEntry[];
  isLoading: boolean;
  isEmpty: boolean;
  selectedVersion: number | null;
  onSelectVersion: (version: number | null) => void;
  currentVersion: number;
  children?: ReactNode;
}

export function VersionHistoryDrawer({
  isOpen,
  onClose,
  versions,
  isLoading,
  isEmpty,
  selectedVersion,
  onSelectVersion,
  currentVersion,
  children,
}: VersionHistoryDrawerProps) {
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
        aria-label="Version History"
        aria-modal="true"
        className="fixed right-0 top-0 z-50 flex h-full w-[440px] flex-col bg-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">Version History</h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close version history"
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {isLoading ? (
            <div aria-label="Loading version history">
              <SkeletonItem />
              <SkeletonItem />
              <SkeletonItem />
              <SkeletonItem />
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-slate-400">
                This is the first version. Save changes to build version history.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {versions.map((entry) => (
                <VersionListItem
                  key={entry.version}
                  entry={entry}
                  isSelected={selectedVersion === entry.version}
                  isCurrent={entry.version === currentVersion}
                  onSelect={onSelectVersion}
                />
              ))}
            </div>
          )}

          {/* Diff view slot (T-06) */}
          {children}
        </div>
      </div>
    </>
  );
}
