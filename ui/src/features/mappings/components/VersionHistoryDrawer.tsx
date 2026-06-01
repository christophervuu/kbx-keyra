import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { MappingRevision, MappingVersion } from '@/lib/types/domain';
import type { VersionHistoryEntry } from '../hooks/use-version-history';

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

export type HistoryTab = 'revisions' | 'versions';

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
// RevisionListItem (FS-063 Revisions tab)
// ---------------------------------------------------------------------------

export interface RevisionListItemProps {
  revision: MappingRevision;
  isSelected: boolean;
  onSelect: (revision: number) => void;
}

export function RevisionListItem({ revision, isSelected, onSelect }: RevisionListItemProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(revision.revision);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={() => onSelect(revision.revision)}
      onKeyDown={handleKeyDown}
      data-testid={`revision-item-${revision.revision}`}
      className={[
        'flex flex-col gap-1 rounded-lg px-3 py-3 transition-colors cursor-pointer',
        isSelected
          ? 'border border-blue-500 bg-slate-700/80'
          : 'border border-transparent hover:bg-slate-700/60',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span
          className="rounded bg-slate-600 px-1.5 py-0.5 text-xs font-mono font-semibold text-slate-200"
          data-testid={`revision-badge-${revision.revision}`}
        >
          Rev {revision.revision}
        </span>
        <span className="ml-auto text-xs text-slate-400">
          {formatRelativeTime(revision.savedAt)}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>{revision.ruleCount} rules</span>
      </div>
      <div className="text-xs text-slate-500">
        Saved by {revision.savedBy}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MappingVersionListItem (FS-063 Versions tab)
// ---------------------------------------------------------------------------

export interface MappingVersionListItemProps {
  version: MappingVersion;
  isSelected: boolean;
  onSelect: (version: number) => void;
}

export function MappingVersionListItem({
  version,
  isSelected,
  onSelect,
}: MappingVersionListItemProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(version.version);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={() => onSelect(version.version)}
      onKeyDown={handleKeyDown}
      data-testid={`version-item-${version.version}`}
      className={[
        'flex flex-col gap-1 rounded-lg px-3 py-3 transition-colors cursor-pointer',
        isSelected
          ? 'border border-blue-500 bg-slate-700/80'
          : 'border border-transparent hover:bg-slate-700/60',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span
          className="rounded bg-slate-600 px-1.5 py-0.5 text-xs font-mono font-semibold text-slate-200"
          data-testid={`version-badge-${version.version}`}
        >
          v{version.version}
        </span>
        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-400">
          → Rev {version.revisionNumber}
        </span>
        <span className="ml-auto text-xs text-slate-400">
          {formatRelativeTime(version.createdAt)}
        </span>
      </div>
      <div className="text-xs text-slate-500">
        Created by {version.createdBy}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VersionListItem (legacy — kept for backward compat)
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

  // -------------------------------------------------------------------------
  // FS-063 two-tab mode — Revisions tab
  // -------------------------------------------------------------------------

  /** List of revisions for the Revisions tab. When provided, tab UI is rendered. */
  revisions?: readonly MappingRevision[];
  /** Whether the revisions list is loading */
  isLoadingRevisions?: boolean;
  /** Currently selected revision number (null = none) */
  selectedRevision?: number | null;
  /** Called when a revision row is clicked */
  onSelectRevision?: (revision: number) => void;

  // -------------------------------------------------------------------------
  // FS-063 two-tab mode — Versions tab
  // -------------------------------------------------------------------------

  /** List of milestone versions for the Versions tab. */
  mappingVersions?: readonly MappingVersion[];
  /** Whether the versions list is loading */
  isLoadingMappingVersions?: boolean;
  /** Currently selected version number for the new-style Versions tab */
  selectedMappingVersion?: number | null;
  /** Called when a version row is clicked in the new-style Versions tab */
  onSelectMappingVersion?: (version: number) => void;

  // -------------------------------------------------------------------------
  // Legacy props (backward compat with useVersionHistory)
  // -------------------------------------------------------------------------

  /** @deprecated Use `mappingVersions` + `revisions`. Kept for backward compat. */
  versions?: readonly VersionHistoryEntry[];
  /** @deprecated Use `isLoadingRevisions` / `isLoadingMappingVersions`. */
  isLoading?: boolean;
  /** @deprecated */
  isEmpty?: boolean;
  /** @deprecated */
  selectedVersion?: number | null;
  /** @deprecated */
  onSelectVersion?: (version: number | null) => void;
  /** @deprecated */
  currentVersion?: number;

  /** Slot for diff view or preview content below the list */
  children?: ReactNode;
}

export function VersionHistoryDrawer({
  isOpen,
  onClose,
  revisions,
  isLoadingRevisions = false,
  selectedRevision = null,
  onSelectRevision,
  mappingVersions,
  isLoadingMappingVersions = false,
  selectedMappingVersion = null,
  onSelectMappingVersion,
  // legacy
  versions,
  isLoading = false,
  isEmpty = false,
  selectedVersion,
  onSelectVersion,
  currentVersion,
  children,
}: VersionHistoryDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Tab state — only active when FS-063 data (revisions / mappingVersions) is provided
  const tabMode = revisions !== undefined || mappingVersions !== undefined;
  const [activeTab, setActiveTab] = useState<HistoryTab>('revisions');

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

  // ---------------------------------------------------------------------------
  // Revisions tab body
  // ---------------------------------------------------------------------------

  function renderRevisionsTab() {
    if (isLoadingRevisions) {
      return (
        <div aria-label="Loading revisions">
          <SkeletonItem />
          <SkeletonItem />
          <SkeletonItem />
        </div>
      );
    }

    const list = revisions ?? [];

    if (list.length === 0) {
      return (
        <div
          className="flex flex-col items-center justify-center py-12 text-center"
          data-testid="revisions-empty-state"
        >
          <p className="text-sm text-slate-400">
            No revisions yet. Click Save to create your first revision.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-1" data-testid="revisions-list">
        {list.map((rev) => (
          <RevisionListItem
            key={rev.revision}
            revision={rev}
            isSelected={selectedRevision === rev.revision}
            onSelect={onSelectRevision ?? (() => undefined)}
          />
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Versions tab body
  // ---------------------------------------------------------------------------

  function renderVersionsTab() {
    if (isLoadingMappingVersions) {
      return (
        <div aria-label="Loading versions">
          <SkeletonItem />
          <SkeletonItem />
          <SkeletonItem />
        </div>
      );
    }

    const list = mappingVersions ?? [];

    if (list.length === 0) {
      return (
        <div
          className="flex flex-col items-center justify-center py-12 text-center"
          data-testid="versions-empty-state"
        >
          <p className="text-sm text-slate-400">
            No versions yet. Click Version to create your first milestone.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-1" data-testid="versions-list">
        {list.map((ver) => (
          <MappingVersionListItem
            key={ver.version}
            version={ver}
            isSelected={selectedMappingVersion === ver.version}
            onSelect={onSelectMappingVersion ?? (() => undefined)}
          />
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Legacy body (when revisions/mappingVersions not provided)
  // ---------------------------------------------------------------------------

  function renderLegacyBody() {
    if (isLoading) {
      return (
        <div aria-label="Loading version history">
          <SkeletonItem />
          <SkeletonItem />
          <SkeletonItem />
          <SkeletonItem />
        </div>
      );
    }

    if (isEmpty) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-slate-400">
            This is the first version. Save changes to build version history.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-1">
        {(versions ?? []).map((entry) => (
          <VersionListItem
            key={entry.version}
            entry={entry}
            isSelected={selectedVersion === entry.version}
            isCurrent={entry.version === (currentVersion ?? -1)}
            onSelect={onSelectVersion ?? (() => undefined)}
          />
        ))}
      </div>
    );
  }

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

        {/* Tab strip — only shown in FS-063 two-tab mode */}
        {tabMode && (
          <div
            className="flex shrink-0 border-b border-slate-700"
            role="tablist"
            aria-label="History tabs"
            data-testid="history-tabs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'revisions'}
              aria-controls="history-panel-revisions"
              id="history-tab-revisions"
              data-testid="tab-revisions"
              onClick={() => setActiveTab('revisions')}
              className={[
                'flex-1 px-4 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
                activeTab === 'revisions'
                  ? 'border-b-2 border-blue-500 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
            >
              Revisions
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'versions'}
              aria-controls="history-panel-versions"
              id="history-tab-versions"
              data-testid="tab-versions"
              onClick={() => setActiveTab('versions')}
              className={[
                'flex-1 px-4 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
                activeTab === 'versions'
                  ? 'border-b-2 border-blue-500 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
            >
              Versions
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {tabMode ? (
            <>
              <div
                id="history-panel-revisions"
                role="tabpanel"
                aria-labelledby="history-tab-revisions"
                hidden={activeTab !== 'revisions'}
              >
                {renderRevisionsTab()}
              </div>
              <div
                id="history-panel-versions"
                role="tabpanel"
                aria-labelledby="history-tab-versions"
                hidden={activeTab !== 'versions'}
              >
                {renderVersionsTab()}
              </div>
            </>
          ) : (
            renderLegacyBody()
          )}

          {/* Diff view / preview slot */}
          {children}
        </div>
      </div>
    </>
  );
}
