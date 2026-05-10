import type { ComparisonSideMetadata, Environment } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnvironmentMetadataBarProps {
  metadata: ComparisonSideMetadata;
  label: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}

function envBadgeClass(environment: Environment): string {
  switch (environment) {
    case 'DEV':
      return 'bg-green-900/60 text-green-300 border border-green-700/50';
    case 'QA':
      return 'bg-amber-900/60 text-amber-300 border border-amber-700/50';
    case 'PROD':
      return 'bg-red-900/60 text-red-300 border border-red-700/50';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Compact metadata bar displayed at the top of each comparison side panel.
 *
 * Shows:
 * - Execution context badge (Client-side in blue, or DEV/QA/PROD in env color)
 * - Config/snapshot version
 * - Deployment timestamp (server-side only) with relative time + ISO on hover
 * - Engine version
 * - "unsaved" warning badge when hasUnsavedChanges is true
 * - Saved-at timestamp for client-side saved variant
 *
 * AE-04 (FS-037 T-06)
 */
export function EnvironmentMetadataBar({ metadata, label }: EnvironmentMetadataBarProps) {
  const {
    executionContext,
    environment,
    configVersion,
    snapshotVersion,
    deployedAt,
    engineVersion,
    savedAt,
    hasUnsavedChanges,
  } = metadata;

  const isServer = executionContext === 'server';
  const version = isServer && snapshotVersion !== undefined
    ? `Snapshot v${snapshotVersion}`
    : `v${configVersion}`;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-700 bg-slate-900/60 px-3 py-1.5"
      data-testid="metadata-bar"
      aria-label={`${label} execution metadata`}
    >
      {/* Context badge */}
      {isServer && environment !== undefined ? (
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-semibold ${envBadgeClass(environment)}`}
          data-testid="metadata-context"
        >
          {environment}
        </span>
      ) : (
        <span
          className="rounded bg-blue-900/60 px-1.5 py-0.5 text-xs font-semibold text-blue-300 border border-blue-700/50"
          data-testid="metadata-context"
        >
          Client-side
        </span>
      )}

      {/* Version */}
      <span className="text-xs text-slate-400" data-testid="metadata-version">
        {version}
      </span>

      {/* Deployment timestamp (server-side only) */}
      {isServer && deployedAt !== undefined && (
        <span
          className="text-xs text-slate-500"
          title={deployedAt}
          data-testid="metadata-timestamp"
        >
          {formatRelativeTime(deployedAt)}
        </span>
      )}

      {/* Saved-at timestamp (client-side saved variant) */}
      {!isServer && savedAt !== undefined && (
        <span
          className="text-xs text-slate-500"
          title={savedAt}
          data-testid="metadata-timestamp"
        >
          saved {formatRelativeTime(savedAt)}
        </span>
      )}

      {/* Unsaved changes badge */}
      {hasUnsavedChanges === true && (
        <span
          className="rounded bg-amber-900/60 px-1.5 py-0.5 text-xs font-medium text-amber-300 border border-amber-700/50"
          data-testid="metadata-unsaved"
        >
          unsaved
        </span>
      )}

      {/* Engine version */}
      <span className="ml-auto text-xs text-slate-600" data-testid="metadata-engine">
        engine {engineVersion}
      </span>
    </div>
  );
}
