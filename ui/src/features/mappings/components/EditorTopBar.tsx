import { Clock, ExternalLink, Save, SlidersHorizontal } from 'lucide-react';
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
  /** Current saved version number */
  version: number;
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
   * Number of rules modified since last save.
   * Displayed in the unsaved state indicator.
   * T-02 computes this; T-01 accepts it as a prop.
   */
  unsavedCount: number;
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

const ENV_ORDER: Environment[] = ['DEV', 'QA', 'PROD'];

function getDeployBadgeContent(
  deployStatus: HighestDeployStatus | null,
  savedVersion: number,
): { label: string; dotClass: string } {
  if (!deployStatus) {
    return { label: 'Not deployed', dotClass: 'bg-slate-500' };
  }

  const isStale = savedVersion > deployStatus.deployedVersion;
  const envLabel = deployStatus.environment;

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
  deployStatus,
  saveStatus,
  unsavedCount,
  onSave,
  sourceSchemaName,
  targetSchemaName,
  onConfigToggle,
  onHistoryToggle,
}: EditorTopBarProps) {
  const saveConfig = saveStatusConfig[saveStatus];
  const saveLabel = saveConfig.label(unsavedCount);
  const isSaved = saveStatus === 'saved';
  const isSaving = saveStatus === 'saving';

  const deployPath = PATHS.MAPPING_DEPLOYMENT.replace(':projectId', projectId).replace(
    ':mappingId',
    mappingId,
  );
  const projectPath = PATHS.PROJECT_OVERVIEW.replace(':projectId', projectId);

  const { label: deployLabel, dotClass } = getDeployBadgeContent(deployStatus, version);

  return (
    <header
      className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-700 bg-slate-900 px-4 py-2"
      data-testid="editor-top-bar"
    >
      {/* Left: project / mapping breadcrumb + version */}
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
        <span
          className="rounded bg-slate-700 px-1.5 py-0.5 text-xs font-medium text-slate-300"
          data-testid="version-badge"
        >
          v{version}
        </span>
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

      {/* Save button */}
      <button
        type="button"
        onClick={onSave}
        disabled={isSaved || isSaving}
        className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        data-testid="save-button"
        aria-label="Save mapping"
      >
        <Save size={12} aria-hidden="true" />
        Save
      </button>

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
    </header>
  );
}
