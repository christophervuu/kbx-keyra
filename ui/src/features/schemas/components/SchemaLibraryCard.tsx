// SchemaLibraryCard — Single schema card for the Schema Library page (FS-016 T-02)

import { useNavigate } from 'react-router-dom';

import { PATHS } from '@/routes/paths';

import type { SchemaLibraryItem, SyncStatus } from '../types';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface OriginBadgeProps {
  origin: SchemaLibraryItem['origin'];
}

const ORIGIN_CONFIG: Record<
  SchemaLibraryItem['origin'],
  { emoji: string; label: string; className: string }
> = {
  cdm: { emoji: '📚', label: 'CDM', className: 'bg-purple-100 text-purple-800' },
  published: { emoji: '📄', label: 'Published', className: 'bg-blue-100 text-blue-800' },
  local: { emoji: '💾', label: 'Local', className: 'bg-green-100 text-green-800' },
};

function OriginBadge({ origin }: OriginBadgeProps) {
  const config = ORIGIN_CONFIG[origin];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      <span aria-hidden="true">{config.emoji}</span>
      {config.label}
    </span>
  );
}

interface ScopeBadgeProps {
  scope: SchemaLibraryItem['scope'];
}

function ScopeBadge({ scope }: ScopeBadgeProps) {
  const isGlobal = scope === 'global';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isGlobal ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {isGlobal ? 'Global' : 'Project-Level'}
    </span>
  );
}

interface SyncStatusIndicatorProps {
  status: SyncStatus;
}

const SYNC_STATUS_CONFIG: Record<
  SyncStatus,
  { symbol: string; className: string; label: string } | null
> = {
  synced: { symbol: '✓', className: 'text-green-600', label: 'Synced' },
  'not-synced': { symbol: '⚠', className: 'text-amber-600', label: 'Not synced' },
  'local-changes': { symbol: '⚠', className: 'text-amber-600', label: 'Local changes' },
  inferred: { symbol: '⚠', className: 'text-amber-600', label: 'Inferred' },
  local: null, // no indicator for upload-only schemas
};

function SyncStatusIndicator({ status }: SyncStatusIndicatorProps) {
  const config = SYNC_STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${config.className}`}
      aria-label={config.label}
      data-testid={`sync-status-${status}`}
    >
      <span aria-hidden="true">{config.symbol}</span>
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SchemaLibraryCard
// ---------------------------------------------------------------------------

export interface SchemaLibraryCardProps {
  item: SchemaLibraryItem;
}

export function SchemaLibraryCard({ item }: SchemaLibraryCardProps) {
  const navigate = useNavigate();

  const projectLabel =
    item.projectCount === 1 ? '1 project' : `${item.projectCount} projects`;

  const fieldLabel = item.fieldCount === 1 ? '1 field' : `${item.fieldCount} fields`;

  const tooltipContent =
    item.projectCount > 0 && item.projectNames.length > 0
      ? item.projectNames.slice(0, 5).join(', ')
      : undefined;

  function handleNavigate() {
    navigate(PATHS.SCHEMA_DETAIL.replace(':schemaId', item.schemaId));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNavigate();
    }
  }

  return (
    <div
      role="article"
      aria-label={item.name}
      tabIndex={0}
      onClick={handleNavigate}
      onKeyDown={handleKeyDown}
      className="flex cursor-pointer flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-sm transition-shadow hover:border-blue-500 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
      data-testid="schema-library-card"
    >
      {/* Name */}
      <h3 className="truncate text-base font-semibold text-slate-100">{item.name}</h3>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2">
        <OriginBadge origin={item.origin} />
        <ScopeBadge scope={item.scope} />
      </div>

      {/* Description */}
      {item.description && (
        <p className="line-clamp-2 text-sm text-slate-400">{item.description}</p>
      )}

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span data-testid="field-count">{fieldLabel}</span>
        <span aria-hidden="true">·</span>
        <span data-testid="display-format">{item.displayFormat}</span>
        {SYNC_STATUS_CONFIG[item.syncStatus] !== null && (
          <>
            <span aria-hidden="true">·</span>
            <SyncStatusIndicator status={item.syncStatus} />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-slate-800 pt-3">
        <span
          className="text-xs text-slate-500"
          data-testid="project-count"
          title={tooltipContent}
        >
          {item.projectCount > 0 ? `Used by ${projectLabel}` : 'Not used by any project'}
        </span>
      </div>
    </div>
  );
}
