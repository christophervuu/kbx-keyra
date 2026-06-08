import { AlertTriangle, Eye, Trash2 } from 'lucide-react';


import type { SchemaCardData } from '../types';

import { Button } from '@/components/Button';
import {
  SchemaSyncStatusBadge,
  getSchemaOriginLabel,
} from '@/features/schemas/components/SchemaPresentationPrimitives';
import { isSchemaActionAllowed } from '@/features/schemas/lib';


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
      {isXsd ? 'XSD' : 'JSON'}
    </span>
  );
}

/**
 * Color-coded origin badge (AE-13):
 * - CDM → blue
 * - Uploaded → purple
 * - Inferred → amber
 */
function OriginBadge({ origin }: { origin: string }) {
  const config: Record<string, { cls: string; label: string }> = {
    cdm: { cls: 'bg-blue-100 text-blue-800', label: getSchemaOriginLabel('cdm') },
    uploaded: { cls: 'bg-purple-100 text-purple-800', label: 'Uploaded' },
    inferred: { cls: 'bg-amber-100 text-amber-800', label: 'Inferred' },
    published: { cls: 'bg-purple-100 text-purple-800', label: 'Uploaded' },
    local: { cls: 'bg-purple-100 text-purple-800', label: 'Uploaded' },
  };
  const { cls, label } = config[origin] ?? { cls: 'bg-gray-100 text-gray-700', label: origin };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`} data-testid={`origin-badge-${origin}`}>
      {label}
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
  onResync?: (schemaId: string) => Promise<void>;
  isResyncing?: boolean;
  resyncFeedback?:
    | {
        type: 'success' | 'error';
        message: string;
      }
    | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Card displaying schema metadata with enhanced badges (FS-050 T-05, AE-13):
 * - Color-coded origin badge (CDM=blue, Uploaded=purple, Inferred=amber)
 * - Sync status indicator (non-local schemas only)
 * - "Used by N mappings" count
 * - Field count
 */
export function SchemaCard({
  schema,
  usageCount,
  onView,
  onRemove,
  onResync,
  isResyncing = false,
  resyncFeedback = null,
}: SchemaCardProps) {
  const usageLabel = usageCount === 0 ? 'Not used' : `Used by ${usageCount} mapping${usageCount !== 1 ? 's' : ''}`;
  const canUnlink = isSchemaActionAllowed(schema.origin, 'project-overview', 'unlink');
  const canResync =
    isSchemaActionAllowed(schema.origin, 'project-overview', 'resync') &&
    schema.sourceType === 'github';

  async function handleResync() {
    if (!onResync) return;
    await onResync(schema.schemaId);
  }

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
          {canResync && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Re-sync schema ${schema.name}`}
              onClick={() => void handleResync()}
              loading={isResyncing}
              data-testid="action-resync"
            >
              Re-sync
            </Button>
          )}

          {canUnlink && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Unlink schema ${schema.name}`}
              onClick={() => onRemove(schema.schemaId)}
              className="text-red-400 hover:text-red-300"
            >
              <Trash2 size={14} aria-hidden="true" />
              Unlink
            </Button>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        <FormatBadge format={schema.format} />
        <OriginBadge origin={schema.origin} />
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
        <span>{schema.fieldCount} fields</span>

        {/* Sync status — only for non-local schemas */}
        {schema.origin !== 'local' && (
          <SchemaSyncStatusBadge
            status={schema.syncStatus}
            className="text-xs"
            dataTestIdPrefix="sync-status"
          />
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

      {resyncFeedback && (
        <p
          role={resyncFeedback.type === 'error' ? 'alert' : 'status'}
          data-testid={resyncFeedback.type === 'error' ? 'resync-error' : 'resync-success'}
          className={`text-xs ${
            resyncFeedback.type === 'error' ? 'text-amber-300' : 'text-slate-300'
          }`}
        >
          {resyncFeedback.message}
        </p>
      )}
    </div>
  );
}
