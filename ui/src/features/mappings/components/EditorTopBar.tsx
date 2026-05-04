import { ArrowRight, Clock, ExternalLink, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';

import { StatusBadge } from '@/components';
import type { DeployStatus, Environment } from '@/lib/types/domain';
import { PATHS } from '@/routes/paths';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

export interface DeployBadgeInfo {
  environment: Environment;
  status: DeployStatus;
}

export interface EditorTopBarProps {
  mappingName: string;
  version: number;
  saveStatus: SaveStatus;
  deployStatuses: readonly DeployBadgeInfo[];
  sourceSchemaName: string | null;
  targetSchemaName: string | null;
  projectId: string;
  mappingId: string;
  /** Optional callback to toggle the configuration modal */
  onConfigToggle?: () => void;
  /** Optional callback to toggle the version history drawer */
  onHistoryToggle?: () => void;
}

// ---------------------------------------------------------------------------
// Save status display config
// ---------------------------------------------------------------------------

const saveStatusConfig: Record<SaveStatus, { label: string; className: string }> = {
  saved: { label: 'Saved', className: 'text-green-400' },
  unsaved: { label: 'Unsaved changes', className: 'text-amber-400' },
  saving: { label: 'Saving\u2026', className: 'text-slate-400' },
  error: { label: 'Save failed', className: 'text-red-400' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Top bar for the Mapping Editor page.
 * Displays mapping metadata: name, version, save status, deploy badges,
 * source/target schema names, and a "Go to Deploy Page" link.
 */
export function EditorTopBar({
  mappingName,
  version,
  saveStatus,
  deployStatuses,
  sourceSchemaName,
  targetSchemaName,
  projectId,
  mappingId,
  onConfigToggle,
  onHistoryToggle,
}: EditorTopBarProps) {
  const saveConfig = saveStatusConfig[saveStatus];
  const deployPath = PATHS.MAPPING_DEPLOYMENT.replace(':projectId', projectId).replace(
    ':mappingId',
    mappingId,
  );

  return (
    <header
      className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-700 bg-slate-900 px-4 py-2"
      data-testid="editor-top-bar"
    >
      {/* Mapping name and version */}
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold text-slate-100">{mappingName}</h1>
        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs font-medium text-slate-300">
          v{version}
        </span>
      </div>

      {/* Save status */}
      <span
        className={`text-xs font-medium ${saveConfig.className}`}
        role="status"
        aria-live="polite"
        data-testid="save-status"
      >
        {saveConfig.label}
      </span>

      {/* Deploy status badges */}
      <div className="flex items-center gap-3" data-testid="deploy-badges">
        {deployStatuses.map((badge) => (
          <div key={badge.environment} className="flex items-center gap-1">
            <span className="text-[10px] font-medium uppercase text-slate-500">
              {badge.environment}
            </span>
            <StatusBadge status={badge.status} />
          </div>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Schema names */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400" data-testid="schema-names">
        <span className="max-w-32 truncate" title={sourceSchemaName ?? 'No source schema'}>
          {sourceSchemaName ?? 'No source'}
        </span>
        <ArrowRight size={12} aria-hidden="true" className="text-slate-600" />
        <span className="max-w-32 truncate" title={targetSchemaName ?? 'No target schema'}>
          {targetSchemaName ?? 'No target'}
        </span>
      </div>

      {/* Deploy page link */}
      <Link
        to={deployPath}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-400 transition-colors hover:bg-slate-800 hover:text-blue-300"
        data-testid="deploy-page-link"
      >
        Deploy
        <ExternalLink size={12} aria-hidden="true" />
      </Link>

      {/* Configuration toggle button */}
      {onConfigToggle && (
        <button
          type="button"
          onClick={onConfigToggle}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          data-testid="config-toggle-button"
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
        >
          <Clock size={12} aria-hidden="true" />
          History
        </button>
      )}
    </header>
  );
}
