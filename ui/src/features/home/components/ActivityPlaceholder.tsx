// ActivityPlaceholder — Recent activity panel (FS-084 T-02)

import { Activity, FileText, Folder } from 'lucide-react';

import type { RecentActivityEntry } from '../types';

export interface ActivityPlaceholderProps {
  items?: RecentActivityEntry[];
  onItemClick?: (entry: RecentActivityEntry) => void;
}

function relativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;

  return 'recently';
}

export function ActivityPlaceholder({ items = [], onItemClick }: ActivityPlaceholderProps) {
  const visible = items.slice(0, 5);

  return (
    <div
      data-testid="activity-placeholder"
      className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"
    >
      <h2 className="mb-3 text-sm font-medium text-slate-100">Recent activity</h2>

      {visible.length > 0 ? (
        <div className="space-y-1.5">
          {visible.map((entry) => (
            <button
              key={`${entry.type}-${entry.id}`}
              type="button"
              onClick={() => onItemClick?.(entry)}
              className="flex w-full items-center gap-3 rounded-md border border-transparent px-2 py-2 text-left transition-colors hover:border-slate-700 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800 text-slate-400">
                {entry.type === 'project' ? (
                  <Folder size={14} aria-hidden="true" />
                ) : (
                  <FileText size={14} aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-slate-200">{entry.name}</span>
                <span className="block text-[11px] text-slate-500">
                  {entry.type === 'project' ? 'Project updated' : 'Mapping updated'}
                </span>
              </span>
              <span className="text-[11px] text-slate-500">{relativeTime(entry.timestamp)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-800 bg-slate-950/70 px-4 py-6">
          <Activity size={24} className="text-slate-600" aria-hidden="true" />
          <p className="max-w-[220px] text-center text-xs text-slate-500">
            Recent activity is not yet available. New project and mapping events will appear here.
          </p>
        </div>
      )}
    </div>
  );
}
