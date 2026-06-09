import type { FilterStatus } from '../types';

export interface SchemaStatusBadgeProps {
  status: FilterStatus;
}

function toDisplayStatus(status: FilterStatus): FilterStatus {
  return status === 'needs_review' ? 'ready' : status;
}

function statusLabel(status: FilterStatus): string {
  const displayStatus = toDisplayStatus(status);
  return displayStatus[0].toUpperCase() + displayStatus.slice(1);
}

function statusClasses(status: FilterStatus): string {
  switch (toDisplayStatus(status)) {
    case 'ready':
      return 'bg-emerald-900/40 text-emerald-300 border-emerald-700/60';
    case 'processing':
      return 'bg-slate-800 text-slate-300 border-slate-700';
    case 'error':
      return 'bg-rose-900/40 text-rose-300 border-rose-700/60';
    default:
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
}

export function SchemaStatusBadge({ status }: SchemaStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(status)}`}
      data-testid={`schema-status-${toDisplayStatus(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}
