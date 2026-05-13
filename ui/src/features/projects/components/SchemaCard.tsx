import { AlertTriangle, CheckCircle, Eye, PenLine, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';


import type { SchemaCardData } from '../types';

import { Button } from '@/components/Button';


// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function FormatBadge({ format }: { format: string }) {
  const isXsd = format === 'xsd';
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
        isXsd ? 'bg-purple-900/60 text-purple-300' : 'bg-blue-900/60 text-blue-300'
      }`}
    >
      {isXsd ? 'XSD' : 'JSON Schema'}
    </span>
  );
}

/**
 * Color-coded origin badge (AE-13):
 * - CDM → blue
 * - Published → purple
 * - Local → gray
 */
function OriginBadge({ origin }: { origin: string }) {
  const config: Record<string, { cls: string; label: string }> = {
    cdm: { cls: 'bg-blue-100 text-blue-800', label: 'CDM' },
    published: { cls: 'bg-purple-100 text-purple-800', label: 'Published' },
    local: { cls: 'bg-gray-100 text-gray-700', label: 'Local' },
  };
  const { cls, label } = config[origin] ?? { cls: 'bg-gray-100 text-gray-700', label: origin };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`} data-testid={`origin-badge-${origin}`}>
      {label}
    </span>
  );
}

/**
 * Scope badge — Global vs Project (AE-13).
 */
function ScopeBadge({ scope }: { scope: string }) {
  const isGlobal = scope === 'global';
  return (
    <span
      className="rounded border border-slate-600 px-1.5 py-0.5 text-xs font-medium text-slate-400"
      data-testid={`scope-badge-${isGlobal ? 'global' : 'project'}`}
    >
      {isGlobal ? 'Global' : 'Project'}
    </span>
  );
}

/**
 * Sync status indicator — shown only for non-local schemas (AE-13).
 *
 * | Status         | Icon          | Color  |
 * |----------------|---------------|--------|
 * | synced         | CheckCircle   | Green  |
 * | not-synced     | AlertTriangle | Amber  |
 * | local-changes  | PenLine       | Amber  |
 */
function SyncStatusIndicator({ syncStatus }: { syncStatus: string }) {
  const config: Record<string, { icon: ReactNode; cls: string; label: string }> = {
    synced: {
      icon: <CheckCircle size={12} aria-hidden="true" />,
      cls: 'text-green-400',
      label: 'Synced',
    },
    'not-synced': {
      icon: <AlertTriangle size={12} aria-hidden="true" />,
      cls: 'text-amber-400',
      label: 'Not synced',
    },
    'local-changes': {
      icon: <PenLine size={12} aria-hidden="true" />,
      cls: 'text-amber-400',
      label: 'Local changes',
    },
  };

  const entry = config[syncStatus];
  if (!entry) return null;

  return (
    <span
      className={`flex items-center gap-1 ${entry.cls}`}
      data-testid={`sync-status-${syncStatus}`}
    >
      {entry.icon}
      {entry.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaCardProps {
  schema: SchemaCardData;
  usageCount: number;
  onView: (schemaId: string) => void;
  onRemove: (schemaId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Card displaying schema metadata with enhanced badges (FS-050 T-05, AE-13):
 * - Color-coded origin badge (CDM=blue, Published=purple, Local=gray)
 * - Scope badge (Global / Project)
 * - Sync status indicator (non-local schemas only)
 * - "Used by N mappings" count
 * - Field count
 */
export function SchemaCard({ schema, usageCount, onView, onRemove }: SchemaCardProps) {
  const usageLabel = usageCount === 0 ? 'Not used' : `Used by ${usageCount} mapping${usageCount !== 1 ? 's' : ''}`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900 p-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-slate-100 leading-snug">{schema.name}</p>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`View schema ${schema.name}`}
            onClick={() => onView(schema.schemaId)}
          >
            <Eye size={14} aria-hidden="true" />
            View
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Remove schema ${schema.name}`}
            onClick={() => onRemove(schema.schemaId)}
            className="text-red-400 hover:text-red-300"
          >
            <Trash2 size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        <FormatBadge format={schema.format} />
        <OriginBadge origin={schema.origin} />
        <ScopeBadge scope={schema.scope} />
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
        <span>{schema.fieldCount} fields</span>

        {/* Sync status — only for non-local schemas */}
        {schema.origin !== 'local' && (
          <SyncStatusIndicator syncStatus={schema.syncStatus} />
        )}

        {/* Usage count */}
        <span
          className={usageCount === 0 ? 'text-slate-500' : 'text-slate-300'}
          data-testid="schema-usage-count"
        >
          {usageLabel}
        </span>
      </div>

      {/* Inferred warning */}
      {schema.isInferred && (
        <p className="flex items-center gap-1 text-xs text-amber-400">
          <AlertTriangle size={12} aria-hidden="true" />
          Inferred from sample data
        </p>
      )}
    </div>
  );
}
