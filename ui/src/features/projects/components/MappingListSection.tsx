import { ChevronDown, ChevronUp, GitBranch, Plus } from 'lucide-react';
import { useState } from 'react';

import type { MappingRowData } from '../types';
import { MappingRow } from './MappingRow';

import { Button } from '@/components/Button';

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
  align?: 'left' | 'center';
}

function SortableHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  align = 'left',
}: SortableHeaderProps) {
  const isActive = column === activeColumn;
  const isCentered = align === 'center';

  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 select-none ${
        isCentered ? 'text-center' : 'text-left'
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 rounded uppercase hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          isCentered ? 'w-full justify-center' : ''
        } ${isActive ? 'text-slate-100' : ''}`}
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
  onMappingIntent?: (
    input: { projectId: string; mappingId: string },
    reason: 'hover' | 'focus',
  ) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Mappings section — primary content area on the Project Overview page (FS-050 T-04).
 *
 * Enhancements:
 * - "Continue where you left off" card above the table (AE-09, AE-10)
 * - Heading uses `text-xl font-semibold` (primary treatment vs schemas `text-lg`)
 * - MappingRow handles condensed deploy badges and Test Lab action
 */
export function MappingListSection({
  mappings,
  projectId,
  onCreateMapping,
  onDuplicate,
  onDelete,
  onMappingIntent,
}: MappingListSectionProps) {
  const [sortCol, setSortCol] = useState<SortColumn>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [query, setQuery] = useState('');
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

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery.length === 0
    ? mappings
    : mappings.filter((mapping) => {
      const sourceTarget = `${mapping.sourceSchemaName ?? ''} ${mapping.targetSchemaName ?? ''}`.toLowerCase();
      return (
        mapping.name.toLowerCase().includes(normalizedQuery)
        || sourceTarget.includes(normalizedQuery)
      );
    });

  const sorted = sortMappings(filtered, sortCol, sortDir);

  const sortProps = {
    activeColumn: sortCol,
    direction: sortDir,
    onSort: handleSort,
  } as const;

  return (
    <section aria-label="Mapping list">
      {/* Section header — primary treatment (text-xl, AE-06 reinforcement) */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-100">Mappings</h2>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search mappings"
          aria-label="Search mappings"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          data-testid="mappings-search-input"
        />
      </div>

      {/* Empty state */}
      {mappings.length === 0 ? (
        <div
          className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-slate-700 bg-slate-900/50 py-12 text-center"
          data-testid="mapping-empty-state"
        >
          <GitBranch size={40} className="text-slate-600" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-slate-300">No mappings yet</p>
            <p className="text-xs text-slate-500">
              Create your first mapping to start transforming data between your schemas.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={onCreateMapping}>
            <Plus size={14} aria-hidden="true" />
            Create Mapping
          </Button>
        </div>
      ) : (
        /* Table */
        <div className="overflow-x-auto rounded-lg border border-slate-700" data-testid="mappings-table-container">
          <table className="w-full min-w-[1080px] text-left text-sm" data-testid="mappings-table">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[28%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[11%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="bg-slate-800/60">
              <tr>
                <SortableHeader label="NAME" column="name" {...sortProps} />
                <th
                  scope="col"
                  className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  SOURCE → TARGET
                </th>
                <SortableHeader label="RULES" column="ruleCount" align="center" {...sortProps} />
                <SortableHeader label="COVERAGE" column="coverage" align="center" {...sortProps} />
                <SortableHeader label="STATUS" column="status" align="center" {...sortProps} />
                <th
                  scope="col"
                  className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  DEPLOYMENT
                </th>
                <SortableHeader label="LAST MODIFIED" column="updatedAt" align="center" {...sortProps} />
                <th
                  scope="col"
                  className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  ACTIONS
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
                  onMappingIntent={onMappingIntent}
                />
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-500" data-testid="mappings-no-search-results">
                    No mappings match your search.
                  </td>
                </tr>
              )}
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
