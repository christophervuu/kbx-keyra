import { Trash2, Eye, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/Button';
import type { SchemaCardData } from '../types';

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function FormatBadge({ format }: { format: string }) {
  const isXsd = format === 'xsd';
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
        isXsd
          ? 'bg-purple-900/60 text-purple-300'
          : 'bg-blue-900/60 text-blue-300'
      }`}
    >
      {isXsd ? 'XSD' : 'JSON Schema'}
    </span>
  );
}

function OriginBadge({ origin }: { origin: string }) {
  const config: Record<string, { cls: string; label: string }> = {
    cdm: { cls: 'bg-green-900/60 text-green-300', label: 'CDM' },
    published: { cls: 'bg-blue-900/40 text-blue-200', label: 'Published' },
    local: { cls: 'bg-slate-700 text-slate-300', label: 'Local' },
  };
  const { cls, label } = config[origin] ?? { cls: 'bg-slate-700 text-slate-300', label: origin };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  const isGlobal = scope === 'global';
  return (
    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs font-medium text-slate-300">
      {isGlobal ? 'Global' : 'Project-Level'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaCardProps {
  schema: SchemaCardData;
  onView: (schemaId: string) => void;
  onRemove: (schemaId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Card displaying schema metadata with View and Remove actions.
 */
export function SchemaCard({ schema, onView, onRemove }: SchemaCardProps) {
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
        {/* Phase 0: always show "Not synced" */}
        <span className="flex items-center gap-1 text-amber-400">
          <AlertTriangle size={12} aria-hidden="true" />
          Not synced
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
