import { BookMarked, Clock, ExternalLink, Save, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { Environment } from '@/lib/types/domain';
import { PATHS } from '@/routes/paths';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

/**
 * The highest deployed environment for this mapping, plus the version
 * that was deployed. Used to derive the single deploy badge.
 */
export interface HighestDeployStatus {
  environment: Environment;
  /** The version number that is currently deployed to this environment */
  deployedVersion: number;
}

export interface EditorTopBarProps {
  /** Human-readable project name */
  projectName: string;
  /** Project ID — used to build the project overview link */
  projectId: string;
  /** Human-readable mapping name */
  mappingName: string;
  /** Mapping ID — used to build the deploy page link */
  mappingId: string;
  /**
   * Current saved version number (legacy compat — used as fallback for `currentRevision`).
   * @deprecated Use `currentRevision` instead.
   */
  version: number;
  /**
   * Current revision number (FS-063). When provided, shown as "Rev N" in the badge.
   * Falls back to `version` when absent.
   */
  currentRevision?: number;
  /**
   * Current version (milestone) number, or null when no version has been created.
   * Shown alongside the revision badge as "vN" or "—".
   */
  currentVersion?: number | null;
  /**
   * Whether there is a local autosaved draft in localStorage.
   * When true, a small draft indicator is shown next to the revision badge.
   */
  hasDraft?: boolean;
  /**
   * Whether the Save button should be enabled.
   * Falls back to `unsavedChangeCount > 0` when absent (backward compat).
   */
  canSave?: boolean;
  /**
   * Callback for the Version button. When provided, the Version button is rendered.
   * On click calls `createVersion()` from the editor hook.
   */
  onCreateVersion?: () => void;
  /**
   * Highest deployed environment info.
   * Null when the mapping has never been deployed.
   */
  deployStatus: HighestDeployStatus | null;
  /**
   * Current save status — controls the save state indicator and Save button.
   * T-02 wires the actual computed state; T-01 accepts it as a prop.
   */
  saveStatus: SaveStatus;
  /**
   * Number of fields with unsaved draft changes.
   * Replaces the old `unsavedCount` prop.
   * Controls Save button disabled state and "View changes" button visibility.
   */
  unsavedChangeCount: number;
  /**
   * Callback fired when the user clicks "View changes".
   * Parent is responsible for opening the UnsavedChangesOverlay.
   */
  onViewUnsavedChanges?: () => void;
  /** Callback for the Save button. T-02 wires the actual save action. */
  onSave: () => void;
  /** Source schema display name (shown in schema context strip) */
  sourceSchemaName: string | null;
  /** Target schema display name (shown in schema context strip) */
  targetSchemaName: string | null;
  /** Optional callback to toggle the configuration modal */
  onConfigToggle?: () => void;
  /** Optional callback to toggle the version history drawer */
  onHistoryToggle?: () => void;
  /** Optional callback fired when the user clicks the "Auto-map" button (header mode). */
  onAutoMap?: () => void;
  /** True while a header-level auto-map request is in flight — disables button and shows spinner. */
  isAutoMapLoading?: boolean;
  /**
   * Number of pending (unreviewed) auto-map suggestions across all sections (FS-048).
   * When > 0, a subtle re-entry affordance is shown in the top bar.
   * When 0, the affordance is hidden.
   */
  autoMapPendingCount?: number;
  /** Section path with pending suggestions — used for display context */
  autoMapSectionPath?: string | null;
  /** Called when the re-entry affordance is clicked — enters workspace mode */
  onReturnToAutoMap?: () => void;
}

// ---------------------------------------------------------------------------
// Save status display config
// ---------------------------------------------------------------------------

const saveStatusConfig: Record<SaveStatus, { label: (count: number) => string; className: string }> = {
  saved: { label: () => 'Saved ✓', className: 'text-green-400' },
  unsaved: {
    label: (count) =>
      count === 1 ? '● 1 unsaved change' : `● ${count} unsaved changes`,
    className: 'text-amber-400',
  },
  saving: { label: () => 'Saving…', className: 'text-slate-400' },
  error: { label: () => 'Save failed', className: 'text-red-400' },
};
// ---------------------------------------------------------------------------
// Deploy badge helpers
// ---------------------------------------------------------------------------

const ENV_ORDER: Environment[] = ['DEV', 'PREPROD', 'PROD'];

function normalizeEnvironmentLabel(environment: Environment): string {
  if (environment === 'QA') {
    return 'PREPROD';
  }

  return environment;
}

function getDeployBadgeContent(
  deployStatus: HighestDeployStatus | null,
  savedVersion: number,
): { label: string; dotClass: string } {
  if (!deployStatus) {
    return { label: 'Not deployed', dotClass: 'bg-slate-500' };
  }

  const isStale = savedVersion > deployStatus.deployedVersion;
  const envLabel = normalizeEnvironmentLabel(deployStatus.environment);

  if (isStale) {
    return { label: `${envLabel} (stale)`, dotClass: 'bg-amber-500' };
  }

  return { label: envLabel, dotClass: 'bg-green-500' };
}

// Keep ENV_ORDER in scope for potential future use (e.g. sorting multi-env arrays)
void ENV_ORDER;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Context bar for the Mapping Editor — Row 2 of the 2-row top area.
 *
 * Displays:
 * - ProjectName / MappingName breadcrumb links
 * - Version badge
 * - Single highest-environment deploy badge with stale indicator
 * - Save state indicator ("Saved ✓" or "N unsaved changes")
 * - Save button (primary, disabled when saved)
 * - History button (optional)
 * - Config button (optional)
 * - Deploy page link
 */
export function EditorTopBar({
  projectName,
  projectId,
  mappingName,
  mappingId,
  version,
  currentRevision,
  currentVersion = null,
  hasDraft = false,
  canSave,
  onCreateVersion,
  deployStatus,
  saveStatus,
  unsavedChangeCount,
  onViewUnsavedChanges,
  onSave,
  sourceSchemaName,
  targetSchemaName,
  onConfigToggle,
  onHistoryToggle,
  onAutoMap,
  isAutoMapLoading = false,
  autoMapPendingCount = 0,
  autoMapSectionPath = null,
  onReturnToAutoMap,
}: EditorTopBarProps) {
  const saveConfig = saveStatusConfig[saveStatus];
  const saveLabel = saveConfig.label(unsavedChangeCount);
  const isSaving = saveStatus === 'saving';

  // Save is enabled when canSave is explicitly set; else fall back to unsavedChangeCount > 0
  const isSaveEnabled = canSave ?? unsavedChangeCount > 0;

  const displayRevision = currentRevision ?? version;

  const hasChanges = unsavedChangeCount > 0;
  const canViewChanges = hasChanges && onViewUnsavedChanges !== undefined;

  const deployPath = PATHS.MAPPING_DEPLOYMENT.replace(':projectId', projectId).replace(
    ':mappingId',
    mappingId,
  );
  const projectPath = PATHS.PROJECT_OVERVIEW.replace(':projectId', projectId);

  const { label: deployLabel, dotClass } = getDeployBadgeContent(deployStatus, displayRevision);

  return (
    <header
      className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-700 bg-slate-900 px-4 py-2"
      data-testid="editor-top-bar"
    >
      {/* Left: project / mapping breadcrumb + revision + version */}
      <div className="flex items-center gap-1.5 text-sm" data-testid="editor-breadcrumb">
        <Link
          to={projectPath}
          className="font-medium text-slate-400 hover:text-slate-200 transition-colors"
          data-testid="project-name-link"
        >
          {projectName}
        </Link>
        <span className="text-slate-600" aria-hidden="true">/</span>
        <span className="font-semibold text-slate-100" data-testid="mapping-name">
          {mappingName}
        </span>
        {/* Revision badge */}
        <span
          className="rounded bg-slate-700 px-1.5 py-0.5 text-xs font-medium text-slate-300"
          data-testid="revision-badge"
          title={`Current revision: ${displayRevision}`}
        >
          Rev {displayRevision}
        </span>
        {/* Version badge */}
        <span
          className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-medium text-slate-400 border border-slate-600"
          data-testid="version-badge"
          title={currentVersion != null ? `Latest version: ${currentVersion}` : 'No version created yet'}
        >
          {currentVersion != null ? `v${currentVersion}` : '—'}
        </span>
        {/* Draft indicator — shown when there is an autosaved local draft */}
        {hasDraft && (
          <span
            className="inline-flex items-center gap-1 rounded bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-700/40"
            data-testid="draft-indicator"
            title="You have an autosaved local draft"
            aria-label="Unsaved local draft"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
            Draft
          </span>
        )}
      </div>

      {/* Deploy badge */}
      <div className="flex items-center gap-1.5" data-testid="deploy-badge">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
        <span className="text-xs font-medium text-slate-300">{deployLabel}</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Schema context (source → target) */}
      {(sourceSchemaName || targetSchemaName) && (
        <div
          className="hidden items-center gap-1 text-xs text-slate-500 xl:flex"
          data-testid="schema-names"
        >
          <span className="max-w-28 truncate" title={sourceSchemaName ?? 'No source schema'}>
            {sourceSchemaName ?? 'No source'}
          </span>
          <span className="text-slate-700" aria-hidden="true">→</span>
          <span className="max-w-28 truncate" title={targetSchemaName ?? 'No target schema'}>
            {targetSchemaName ?? 'No target'}
          </span>
        </div>
      )}

      {/* Save state indicator */}
      <span
        className={`text-xs font-medium ${saveConfig.className}`}
        role="status"
        aria-live="polite"
        data-testid="save-status"
      >
        {saveLabel}
      </span>

      {/* View changes button — visible when there are unsaved changes */}
      {canViewChanges && (
        <button
          type="button"
          onClick={onViewUnsavedChanges}
          className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-amber-300 border border-amber-700/50 bg-amber-900/20 hover:bg-amber-900/40 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
          data-testid="view-changes-button"
          aria-label={`View ${unsavedChangeCount} unsaved ${unsavedChangeCount === 1 ? 'change' : 'changes'}`}
        >
          View changes
          <span
            className="inline-flex items-center justify-center rounded-full bg-amber-700/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100 min-w-[1.25rem]"
            aria-hidden="true"
            data-testid="view-changes-badge"
          >
            {unsavedChangeCount}
          </span>
        </button>
      )}

      {/* Auto-Map re-entry affordance (FS-048) — shown when pending suggestions exist */}
      {autoMapPendingCount > 0 && onReturnToAutoMap && (
        <button
          type="button"
          data-testid="automap-reentry-pill"
          onClick={onReturnToAutoMap}
          aria-label={`Return to Auto-Map review — ${autoMapPendingCount} pending${autoMapSectionPath ? ` for ${autoMapSectionPath}` : ''}`}
          className={[
            'inline-flex items-center gap-1.5 rounded-full border border-violet-700/50 bg-violet-900/20',
            'px-2.5 py-0.5 text-[10px] font-medium text-violet-300 transition-colors',
            'hover:border-violet-600 hover:bg-violet-900/40 hover:text-violet-200',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500',
          ].join(' ')}
        >
          <Sparkles size={10} aria-hidden="true" />
          Auto-Map: {autoMapPendingCount} pending
        </button>
      )}

      <span className="text-slate-600" aria-hidden="true">|</span>

      {/* Auto-map button — live when onAutoMap provided, placeholder otherwise */}
      {onAutoMap ? (
        <button
          type="button"
          onClick={onAutoMap}
          disabled={isAutoMapLoading}
          data-testid="automap-button"
          aria-label="Auto-map all eligible fields"
          className={[
            'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
            isAutoMapLoading
              ? 'cursor-not-allowed text-slate-500 opacity-60'
              : 'text-blue-400 hover:bg-slate-800 hover:text-blue-300',
          ].join(' ')}
        >
          {isAutoMapLoading ? (
            <span
              className="h-3 w-3 animate-spin rounded-full border border-blue-400 border-t-transparent"
              aria-hidden="true"
            />
          ) : (
            <Sparkles size={12} aria-hidden="true" />
          )}
          Auto-map
        </button>
      ) : (
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="AI-powered auto-mapping — coming soon"
          data-testid="automap-button"
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-slate-500 opacity-50"
        >
          <Sparkles size={12} aria-hidden="true" />
          Auto-map
        </button>
      )}

      {/* Config toggle button */}
      {onConfigToggle && (
        <button
          type="button"
          onClick={onConfigToggle}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          data-testid="config-toggle-button"
          aria-label="Open configuration"
        >
          <SlidersHorizontal size={12} aria-hidden="true" />
          Config
        </button>
      )}

      {/* History toggle button */}
      {onHistoryToggle && (
        <button
          type="button"
          onClick={onHistoryToggle}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          data-testid="history-toggle-button"
          aria-label="Open version history"
        >
          <Clock size={12} aria-hidden="true" />
          History
        </button>
      )}

      {/* Deploy page link */}
      <Link
        to={deployPath}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-400 transition-colors hover:bg-slate-800 hover:text-blue-300"
        data-testid="deploy-page-link"
      >
        Deploy
        <ExternalLink size={12} aria-hidden="true" />
      </Link>

      {/* Version button — shown when onCreateVersion is provided */}
      {onCreateVersion && (
        <button
          type="button"
          onClick={onCreateVersion}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 rounded border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:bg-slate-700 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="version-button"
          aria-label="Create a new version milestone"
        >
          <BookMarked size={12} aria-hidden="true" />
          Version
        </button>
      )}

      {/* Save button */}
      <button
        type="button"
        onClick={onSave}
        disabled={!isSaveEnabled || isSaving}
        className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        data-testid="save-button"
        aria-label="Save mapping"
      >
        <Save size={12} aria-hidden="true" />
        Save
      </button>
    </header>
  );
}
