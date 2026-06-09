// SchemaLibraryCard — Single schema card for the Schema Library page (FS-016 T-02)

import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import type { SchemaLibraryItem, SyncStatus } from '../types';
import { SchemaStatusBadge } from './SchemaStatusBadge';

import {
  SchemaSyncStatusBadge,
  getSchemaOriginLabel,
} from '@/features/schemas/components/SchemaPresentationPrimitives';
import { PATHS } from '@/routes/paths';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface OriginBadgeProps {
  origin: SchemaLibraryItem['origin'];
  ownership: SchemaLibraryItem['ownership'];
}

const ORIGIN_CONFIG: Record<
  SchemaLibraryItem['origin'],
  { emoji: string; label: string; className: string }
> = {
  cdm: { emoji: '📚', label: getSchemaOriginLabel('cdm'), className: 'bg-purple-100 text-purple-800' },
  uploaded: { emoji: '📤', label: 'Uploaded', className: 'bg-blue-100 text-blue-800' },
  inferred: { emoji: '✨', label: 'Inferred', className: 'bg-amber-100 text-amber-800' },
  published: { emoji: '📤', label: 'Uploaded', className: 'bg-blue-100 text-blue-800' },
  local: { emoji: '📤', label: 'Uploaded', className: 'bg-blue-100 text-blue-800' },
};

function OriginBadge({ origin, ownership }: OriginBadgeProps) {
  if (ownership !== 'cdm') {
    return null;
  }

  const config = ORIGIN_CONFIG[origin] ?? {
    emoji: '❓',
    label: 'Unknown',
    className: 'bg-slate-200 text-slate-800',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      <span aria-hidden="true">{config.emoji}</span>
      {config.label}
    </span>
  );
}

const SYNC_STATUS_CONFIG: Record<
  SyncStatus,
  true | null
> = {
  synced: true,
  'update-available': true,
  'sync-failed': true,
  inferred: true,
  local: null, // no indicator for upload-only schemas
};

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

  function getFieldSummary(): string {
    if (item.fieldCount > 0) {
      return fieldLabel;
    }

    if (item.status === 'error') {
      return 'No fields detected (error)';
    }

    if (item.status === 'processing') {
      return 'No fields detected yet';
    }

    if (item.status === 'needs_review') {
      return 'No fields detected (needs review)';
    }

    return 'No fields detected';
  }

  const tooltipContent =
    item.projectCount > 0 && item.projectNames.length > 0
      ? item.projectNames.slice(0, 5).join(', ')
      : undefined;

  function handleNavigate() {
    navigate(PATHS.SCHEMA_DETAIL.replace(':schemaId', item.schemaId));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
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
      {/* Name + CDM badge */}
      <div className="flex items-center gap-2">
        <OriginBadge origin={item.origin} ownership={item.ownership} />
        <h3 className="truncate text-base font-semibold text-slate-100">{item.name}</h3>
      </div>

      {/* Disambiguator */}
      {item.disambiguator ? (
        <p className="text-xs text-slate-400" data-testid="schema-disambiguator">
          {item.disambiguator}
        </p>
      ) : null}

      {/* Status */}
      <div>
        <SchemaStatusBadge status={item.status} />
      </div>

      {/* Description */}
      {item.description && (
        <p className="line-clamp-2 text-sm text-slate-400">{item.description}</p>
      )}

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span data-testid="data-format">{item.dataFormat}</span>
        <span aria-hidden="true">·</span>
        <span data-testid="field-count">{getFieldSummary()}</span>
        {SYNC_STATUS_CONFIG[item.syncStatus] !== null && (
          <>
            <span aria-hidden="true">·</span>
            {item.syncStatus === 'inferred' ? (
              <span
                className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-600"
                aria-label="Inferred"
                data-testid="sync-status-inferred"
              >
                <span aria-hidden="true">⚠</span>
                <span>Inferred</span>
              </span>
            ) : (
              <SchemaSyncStatusBadge
                status={item.syncStatus}
                className="text-xs"
                dataTestIdPrefix="sync-status"
              />
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto space-y-1 border-t border-slate-800 pt-3 text-xs">
        <span
          className="block text-slate-500"
          data-testid="project-count"
          title={tooltipContent}
        >
          {item.projectCount > 0 ? `Used by ${projectLabel}` : 'Not used by any project'}
        </span>
        <span className="block text-slate-500" data-testid="updated-at">
          Updated {new Date(item.updatedAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
