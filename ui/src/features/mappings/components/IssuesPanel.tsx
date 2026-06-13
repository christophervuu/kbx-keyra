import type { ReactNode } from 'react';

export interface ConsolidatedIssueItem {
  readonly id: string;
  readonly targetPath: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

export interface IssuesPanelProps {
  readonly issues: readonly ConsolidatedIssueItem[];
  readonly onClose: () => void;
  readonly onOpenRow: (targetPath: string) => void;
  readonly className?: string;
  readonly titleSlot?: ReactNode;
}

export function IssuesPanel({
  issues,
  onClose,
  onOpenRow,
  className = '',
  titleSlot,
}: IssuesPanelProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="View issues"
      className={`w-full max-w-2xl rounded border border-slate-700 bg-slate-900 p-4 ${className}`}
      data-testid="issues-panel"
    >
      <div className="mb-3 flex items-center justify-between">
        {titleSlot ?? <h2 className="text-sm font-semibold text-slate-100">View Issues</h2>}
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          Close
        </button>
      </div>

      {issues.length === 0 ? (
        <p className="rounded border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-400" data-testid="issues-empty">
          No blocking or warning issues found.
        </p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-auto" data-testid="issues-list">
          {issues.map((issue) => (
            <li key={issue.id}>
              <button
                type="button"
                data-testid={`issue-row-${issue.id}`}
                onClick={() => onOpenRow(issue.targetPath)}
                className="w-full rounded border border-slate-800 bg-slate-950/50 px-3 py-2 text-left transition-colors hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              >
                <div className="mb-0.5 flex items-center gap-2">
                  <span
                    className={[
                      'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                      issue.severity === 'error'
                        ? 'bg-red-900/60 text-red-200'
                        : 'bg-amber-900/60 text-amber-200',
                    ].join(' ')}
                  >
                    {issue.severity}
                  </span>
                  <span className="truncate text-xs font-mono text-slate-300">{issue.targetPath}</span>
                </div>
                <p className="text-xs text-slate-400">{issue.message}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
