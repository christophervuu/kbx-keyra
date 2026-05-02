import { useState } from 'react';
import { Plus, ChevronUp, ChevronDown, GitBranch } from 'lucide-react';

import { Button } from '@/components/Button';
import type { MappingRowData } from '../types';
import { MappingRow } from './MappingRow';

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

type SortColumn = 'name' | 'ruleCount' | 'coverage' | 'status' | 'updatedAt';
type SortDir = 'asc' | 'desc';

function sortMappings(
  mappings: MappingRowData[],
  col: SortColumn,
  dir: SortDir,
): MappingRowData[] {
  const sorted = [...mappings].sort((a, b) => {
    let cmp = 0;
    switch (col) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'ruleCount':
        cmp = a.ruleCount - b.ruleCount;
        break;
      case 'coverage':
        cmp = a.coverage - b.coverage;
        break;
      case 'status':
        cmp = a.status.localeCompare(b.status);
        break;
      case 'updatedAt':
        cmp = a.updatedAt.localeCompare(b.updatedAt);
        break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

// ---------------------------------------------------------------------------
// Column header
// ---------------------------------------------------------------------------

interface SortableHeaderProps {
  label: string;
  column: SortColumn;
  activeColumn: SortColumn;
  direction: SortDir;
  onSort: (col: SortColumn) => void;
}

function SortableHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
}: SortableHeaderProps) {
  const isActive = column === activeColumn;
  return (
    <th
      scope="col"
      className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 select-none"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
          isActive ? 'text-slate-100' : ''
        }`}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {isActive ? (
          direction === 'asc' ? (
            <ChevronUp size={12} aria-hidden="true" />
          ) : (
            <ChevronDown size={12} aria-hidden="true" />
          )
        ) : (
          <span className="w-3" aria-hidden="true" />
        )}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Inline delete confirmation
// ---------------------------------------------------------------------------

interface DeleteConfirmProps {
  mappingName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({ mappingName, onConfirm, onCancel }: DeleteConfirmProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
      data-testid="delete-confirm-overlay"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-message"
        className="relative z-10 w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl"
        data-testid="delete-confirm-dialog"
      >
        <h2 id="delete-confirm-title" className="text-sm font-semibold text-slate-100">
          Delete mapping?
        </h2>
        <p id="delete-confirm-message" className="mt-2 text-sm text-slate-400">
          Delete <strong className="text-slate-200">{mappingName}</strong>? This action cannot be
          undone.
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onConfirm}
            data-testid="delete-confirm-button"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MappingListSectionProps {
  mappings: MappingRowData[];
  projectId: string;
  onCreateMapping: () => void;
  onDuplicate: (mappingId: string) => Promise<void>;
  onDelete: (mappingId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Section C — Mapping list table with sortable columns, row actions, and
 * a delete confirmation dialog.
 */
export function MappingListSection({
  mappings,
  projectId,
  onCreateMapping,
  onDuplicate,
  onDelete,
}: MappingListSectionProps) {
  const [sortCol, setSortCol] = useState<SortColumn>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [deleteTarget, setDeleteTarget] = useState<MappingRowData | null>(null);

  function handleSort(col: SortColumn) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    await onDelete(deleteTarget.mappingId);
    setDeleteTarget(null);
  }

  const sorted = sortMappings(mappings, sortCol, sortDir);

  const sortProps = {
    activeColumn: sortCol,
    direction: sortDir,
    onSort: handleSort,
  } as const;

  return (
    <section aria-label="Mapping list">
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">Mappings</h2>
        <Button variant="primary" size="sm" onClick={onCreateMapping}>
          <Plus size={14} aria-hidden="true" />
          Create Mapping
        </Button>
      </div>

      {/* Empty state */}
      {mappings.length === 0 ? (
        <div
          className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-slate-700 bg-slate-900/50 py-12 text-center"
          data-testid="mapping-empty-state"
        >
          <GitBranch size={40} className="text-slate-600" aria-hidden="true" />
          <p className="text-sm text-slate-400">
            No mappings yet — create your first mapping
          </p>
          <Button variant="primary" size="sm" onClick={onCreateMapping}>
            <Plus size={14} aria-hidden="true" />
            Create Mapping
          </Button>
        </div>
      ) : (
        /* Table */
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800/60">
              <tr>
                <SortableHeader label="Name" column="name" {...sortProps} />
                <th
                  scope="col"
                  className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  Source → Target
                </th>
                <SortableHeader label="Rules" column="ruleCount" {...sortProps} />
                <SortableHeader label="Coverage" column="coverage" {...sortProps} />
                <SortableHeader label="Status" column="status" {...sortProps} />
                <th
                  scope="col"
                  className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  DEV
                </th>
                <th
                  scope="col"
                  className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  QA
                </th>
                <th
                  scope="col"
                  className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  PROD
                </th>
                <SortableHeader label="Last Modified" column="updatedAt" {...sortProps} />
                <th
                  scope="col"
                  className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-slate-900">
              {sorted.map((mapping) => (
                <MappingRow
                  key={mapping.mappingId}
                  mapping={mapping}
                  projectId={projectId}
                  onDuplicate={(id) => void onDuplicate(id)}
                  onDelete={(id) => setDeleteTarget(mappings.find((m) => m.mappingId === id) ?? null)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteConfirmDialog
          mappingName={deleteTarget.name}
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
