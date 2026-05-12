// NeedsAttention — Compact summary of items requiring user follow-up (FS-049 T-02)
// Phase 0: "Mappings with errors" is derived from real data.
// "Stale deployments" and "Unsynced schemas" are scaffold placeholders.

import { AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NeedsAttentionProps {
  /** Count of mappings with validation errors. Derived from DashboardMetrics.statusBreakdown.hasErrors. */
  errorsCount: number;
}

// ---------------------------------------------------------------------------
// AttentionItem sub-component
// ---------------------------------------------------------------------------

interface AttentionItemProps {
  icon: ReactNode;
  label: string;
  count: string | number;
  /** When true, renders with error/warning accent styling. */
  isAlert?: boolean;
  /** When true, renders with muted scaffold styling. */
  isScaffold?: boolean;
  'data-testid'?: string;
}

function AttentionItem({
  icon,
  label,
  count,
  isAlert = false,
  isScaffold = false,
  'data-testid': testId,
}: AttentionItemProps) {
  const countClass = isAlert
    ? 'text-red-400 font-semibold'
    : isScaffold
      ? 'text-slate-500'
      : 'text-slate-300';

  const labelClass = isAlert ? 'text-slate-200' : 'text-slate-400';
  const iconClass = isAlert ? 'text-red-400' : 'text-slate-500';

  return (
    // Using <button> for future click-through support; no-op for now
    <button
      type="button"
      data-testid={testId}
      disabled
      className="flex cursor-default items-center gap-3 rounded px-3 py-2 text-left transition-colors focus:outline-none"
      aria-label={`${label}: ${count}`}
    >
      <span className={iconClass} aria-hidden="true">
        {icon}
      </span>
      <span className={`flex-1 text-sm ${labelClass}`}>{label}</span>
      <span className={`text-sm tabular-nums ${countClass}`}>{count}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// NeedsAttention
// ---------------------------------------------------------------------------

export function NeedsAttention({ errorsCount }: NeedsAttentionProps) {
  const nothingNeedsAttention = errorsCount === 0;

  return (
    <div
      data-testid="needs-attention"
      className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 shadow-sm"
    >
      {/* Section heading */}
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Needs Attention
      </h2>

      {nothingNeedsAttention ? (
        // Positive state — nothing needs attention
        <div className="flex items-center gap-2 px-3 py-2">
          <CheckCircle size={16} className="text-green-500" aria-hidden="true" />
          <span className="text-sm text-slate-400">Nothing needs attention</span>
        </div>
      ) : (
        // Attention items — errors present; scaffold items always shown alongside
        <div className="flex flex-col">
          <AttentionItem
            data-testid="attention-errors"
            icon={<AlertTriangle size={16} />}
            label="Mappings with errors"
            count={errorsCount}
            isAlert
          />
          <AttentionItem
            data-testid="attention-stale-deploys"
            icon={<Clock size={16} />}
            label="Stale deployments"
            count="—"
            isScaffold
          />
          <AttentionItem
            data-testid="attention-unsynced-schemas"
            icon={<RefreshCw size={16} />}
            label="Unsynced schemas"
            count="—"
            isScaffold
          />
        </div>
      )}
    </div>
  );
}
