import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { DeploymentRecord } from '@/lib/api/types';
import type { Environment } from '@/lib/types';

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface HistoryRowProps {
  record: DeploymentRecord;
  isRollingBack: boolean;
  onRollback: (deploymentSK: string) => void;
}

function HistoryRow({ record, isRollingBack, onRollback }: HistoryRowProps) {
  const sourceLabel =
    record.sourceType === 'revision'
      ? `Rev ${record.sourceNumber}`
      : `v${record.sourceNumber}`;

  const metaLabel = record.rollbackOf
    ? 'Rollback'
    : record.promotedFrom
      ? `Promoted from ${record.promotedFrom}`
      : '';

  return (
    <tr className="border-t border-slate-800 hover:bg-slate-800/30">
      <td className="px-4 py-3 font-mono text-sm text-slate-200">{sourceLabel}</td>
      <td className="px-4 py-3 text-xs text-slate-400">
        <time dateTime={record.deployedAt}>{new Date(record.deployedAt).toLocaleString()}</time>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">{metaLabel}</td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          disabled={isRollingBack}
          onClick={() => onRollback(record.environmentDeployedAt)}
          aria-label={`Rollback ${record.environment} to ${sourceLabel}`}
          data-testid={`rollback-btn-${record.environmentDeployedAt}`}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        >
          <RotateCcw size={12} aria-hidden="true" />
          Rollback
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DeploymentHistorySectionProps {
  environment: Environment;
  records: readonly DeploymentRecord[];
  isLoading: boolean;
  error: string | null;
  isRollingBack: boolean;
  onRollback: (environment: Environment, deploymentSK: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Deployment history table for a single environment.
 *
 * Shows source type/number, timestamp, and a rollback button per entry.
 * Rollback uses ConfirmDialog before calling the handler (AE-08).
 */
export function DeploymentHistorySection({
  environment,
  records,
  isLoading,
  error,
  isRollingBack,
  onRollback,
}: DeploymentHistorySectionProps) {
  const [pendingRollbackSK, setPendingRollbackSK] = useState<string | null>(null);

  function handleRollbackRequest(deploymentSK: string) {
    setPendingRollbackSK(deploymentSK);
  }

  function handleRollbackConfirm() {
    if (pendingRollbackSK) {
      onRollback(environment, pendingRollbackSK);
    }
    setPendingRollbackSK(null);
  }

  function handleRollbackCancel() {
    setPendingRollbackSK(null);
  }

  const pendingRecord = records.find((r) => r.environmentDeployedAt === pendingRollbackSK);
  const pendingLabel = pendingRecord
    ? pendingRecord.sourceType === 'revision'
      ? `Rev ${pendingRecord.sourceNumber}`
      : `v${pendingRecord.sourceNumber}`
    : '';

  return (
    <section
      aria-label={`Deployment history for ${environment}`}
      data-testid={`history-section-${environment}`}
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Deployment History — {environment}
      </h2>

      {/* Loading */}
      {isLoading && (
        <div
          className="animate-pulse space-y-2"
          aria-busy="true"
          aria-label="Loading history"
          data-testid="history-loading"
        >
          <div className="h-8 rounded bg-slate-800" />
          <div className="h-8 rounded bg-slate-800" />
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <p className="text-sm text-red-400" data-testid="history-error">
          {error}
        </p>
      )}

      {/* Empty */}
      {!isLoading && !error && records.length === 0 && (
        <p className="text-sm text-slate-500" data-testid="history-empty">
          No deployments yet for {environment}.
        </p>
      )}

      {/* Table */}
      {!isLoading && !error && records.length > 0 && (
        <div className="overflow-x-auto rounded border border-slate-700">
          <table
            className="w-full text-left text-sm"
            aria-label={`${environment} deployment history`}
          >
            <thead className="bg-slate-800/60">
              <tr>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Source
                </th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Deployed At
                </th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Notes
                </th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody data-testid="history-table-body">
              {records.map((r) => (
                <HistoryRow
                  key={r.environmentDeployedAt}
                  record={r}
                  isRollingBack={isRollingBack}
                  onRollback={handleRollbackRequest}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rollback confirm dialog */}
      <ConfirmDialog
        open={Boolean(pendingRollbackSK)}
        title="Confirm rollback"
        message={`Roll back ${environment} to ${pendingLabel}? This creates a new deployment entry.`}
        confirmLabel="Rollback"
        cancelLabel="Cancel"
        onConfirm={handleRollbackConfirm}
        onCancel={handleRollbackCancel}
      />
    </section>
  );
}
