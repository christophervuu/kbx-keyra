import {
  SchemaSyncStatusBadge,
} from './SchemaPresentationPrimitives';

import type { SchemaSourceInfo, SchemaSyncStatus } from '@/lib/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaGitStatusProps {
  source: SchemaSourceInfo;
  /** Canonical schema sync status from metadata */
  syncStatus: SchemaSyncStatus;
  /** ISO timestamp used as "last synced" label (typically metadata.updatedAt) */
  lastSyncedAt?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function truncateSha(sha: string | undefined): string {
  return sha ? sha.slice(0, 7) : '—';
}

type SyncState = SchemaSyncStatus;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SyncIndicator({ state }: { state: SyncState }) {
  return (
    <SchemaSyncStatusBadge status={state} dataTestIdPrefix="git-status-indicator" className="text-sm" />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Displays git/repository status for a schema.
 *
 * - Upload-source schemas (local only): renders a minimal "not connected" notice.
 * - GitHub-source schemas: renders full status card with repo, branch, path,
 *   commit SHA, and last synced timestamp.
 */
export function SchemaGitStatus({
  source,
  syncStatus,
  lastSyncedAt,
}: SchemaGitStatusProps) {
  // ---- Upload / local-only ----
  if (source.type === 'upload') {
    return (
      <section
        data-testid="schema-git-status"
        className="border-b border-slate-800 bg-slate-950 px-6 py-4"
        aria-label="Repository status"
      >
        <p
          data-testid="git-status-local-only"
          className="text-sm text-slate-500"
        >
          Local schema — not connected to a repository
        </p>
      </section>
    );
  }

  // ---- GitHub source ----
  const { repo, branch, path, commitSha } = source;
  const syncState = syncStatus;

  return (
    <section
      data-testid="schema-git-status"
      className="border-b border-slate-800 bg-slate-950 px-6 py-4"
      aria-label="Repository status"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Status indicator */}
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Repository
          </h2>
          <SyncIndicator state={syncState} />
        </div>
      </div>

      {/* Fields grid */}
      <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Repo</dt>
          <dd
            data-testid="git-status-repo"
            className="truncate font-mono text-slate-300"
            title={repo}
          >
            {repo}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Branch</dt>
          <dd data-testid="git-status-branch" className="font-mono text-slate-300">
            {branch}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Path</dt>
          <dd
            data-testid="git-status-path"
            className="truncate font-mono text-slate-300"
            title={path}
          >
            {path}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Commit</dt>
          <dd data-testid="git-status-commit" className="font-mono text-slate-300">
            {truncateSha(commitSha)}
          </dd>
        </div>
        {lastSyncedAt && (
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-slate-500">Last synced</dt>
            <dd data-testid="git-status-last-synced" className="text-slate-300">
              {formatDate(lastSyncedAt)}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
