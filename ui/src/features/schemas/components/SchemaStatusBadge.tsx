import type { FilterStatus } from '../types';

export interface SchemaStatusBadgeProps {
  status: FilterStatus;
}

function statusLabel(status: FilterStatus): string {
  if (status === 'needs_review') return 'Needs review';
  return status[0].toUpperCase() + status.slice(1);
}

function statusClasses(status: FilterStatus): string {
  switch (status) {
    case 'ready':
      return 'bg-emerald-900/40 text-emerald-300 border-emerald-700/60';
    case 'processing':
      return 'bg-slate-800 text-slate-300 border-slate-700';
    case 'needs_review':
      return 'bg-amber-900/40 text-amber-300 border-amber-700/60';
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
      data-testid={`schema-status-${status}`}
    >
      {statusLabel(status)}
    </span>
  );
}
