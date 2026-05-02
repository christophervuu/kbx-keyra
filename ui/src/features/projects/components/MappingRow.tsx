import { Link } from 'react-router-dom';
import { Pencil, Copy, Trash2, Rocket } from 'lucide-react';

import { Button } from '@/components/Button';
import type { MappingRowData } from '../types';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function MappingStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    ready: { cls: 'bg-green-900/60 text-green-300', label: 'Ready' },
    'has-errors': { cls: 'bg-red-900/60 text-red-300', label: 'Has Errors' },
    draft: { cls: 'bg-slate-700 text-slate-400', label: 'Draft' },
  };
  const { cls, label } = cfg[status] ?? { cls: 'bg-slate-700 text-slate-400', label: status };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}

// ---------------------------------------------------------------------------
// Deploy badge (Phase 0: always "Not deployed")
// ---------------------------------------------------------------------------

function DeployBadge() {
  return (
    <span className="whitespace-nowrap text-xs text-slate-500">○ Not deployed</span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MappingRowProps {
  mapping: MappingRowData;
  projectId: string;
  onDuplicate: (mappingId: string) => void;
  onDelete: (mappingId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A single row in the mapping table.
 * Name column is a link to the Mapping Editor.
 */
export function MappingRow({ mapping, projectId, onDuplicate, onDelete }: MappingRowProps) {
  const editorPath = `/projects/${projectId}/mappings/${mapping.mappingId}`;
  const deployPath = `/projects/${projectId}/mappings/${mapping.mappingId}/deploy`;

  const sourceName = mapping.sourceSchemaName ?? 'No schema';
  const targetName = mapping.targetSchemaName ?? 'No schema';

  const coverageDisplay =
    mapping.ruleCount === 0 && mapping.coverage === 0
      ? '—'
      : `${Math.round(mapping.coverage * 100)}%`;

  return (
    <tr className="border-t border-slate-700 hover:bg-slate-800/50 transition-colors">
      {/* Name */}
      <td className="px-3 py-2.5">
        <Link
          to={editorPath}
          className="font-medium text-blue-400 hover:text-blue-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          {mapping.name}
        </Link>
      </td>

      {/* Source → Target */}
      <td className="px-3 py-2.5 text-sm text-slate-300">
        <span>{sourceName}</span>
        <span className="mx-1 text-slate-500">→</span>
        <span>{targetName}</span>
      </td>

      {/* Rules */}
      <td className="px-3 py-2.5 text-right text-sm text-slate-300">
        {mapping.ruleCount}
      </td>

      {/* Coverage */}
      <td className="px-3 py-2.5 text-right text-sm text-slate-300">
        {coverageDisplay}
      </td>

      {/* Status */}
      <td className="px-3 py-2.5">
        <MappingStatusBadge status={mapping.status} />
      </td>

      {/* DEV */}
      <td className="px-3 py-2.5">
        <DeployBadge />
      </td>

      {/* QA */}
      <td className="px-3 py-2.5">
        <DeployBadge />
      </td>

      {/* PROD */}
      <td className="px-3 py-2.5">
        <DeployBadge />
      </td>

      {/* Last modified */}
      <td className="px-3 py-2.5 text-sm text-slate-400">
        <time dateTime={mapping.updatedAt}>
          {new Date(mapping.updatedAt).toLocaleDateString()}
        </time>
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          {/* Edit */}
          <Link
            to={editorPath}
            aria-label={`Edit mapping ${mapping.name}`}
            className="inline-flex items-center justify-center rounded px-1.5 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Pencil size={13} aria-hidden="true" />
          </Link>
          {/* Deploy */}
          <Link
            to={deployPath}
            aria-label={`Deploy mapping ${mapping.name}`}
            className="inline-flex items-center justify-center rounded px-1.5 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Rocket size={13} aria-hidden="true" />
          </Link>
          {/* Duplicate */}
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Duplicate mapping ${mapping.name}`}
            onClick={() => onDuplicate(mapping.mappingId)}
          >
            <Copy size={13} aria-hidden="true" />
          </Button>
          {/* Delete */}
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete mapping ${mapping.name}`}
            onClick={() => onDelete(mapping.mappingId)}
            className="text-red-400 hover:text-red-300"
          >
            <Trash2 size={13} aria-hidden="true" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
