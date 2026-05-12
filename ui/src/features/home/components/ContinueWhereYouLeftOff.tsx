// ContinueWhereYouLeftOff — Recent activity section (FS-049 T-03)
// Renders up to 3 compact cards for recently visited projects/mappings.
// Returns null when the items array is empty.

import { FileText, Folder } from 'lucide-react';

import type { RecentActivityEntry } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContinueWhereYouLeftOffProps {
  items: RecentActivityEntry[];
  onItemClick: (entry: RecentActivityEntry) => void;
}

// ---------------------------------------------------------------------------
// Relative timestamp helper
// ---------------------------------------------------------------------------

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

  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;

  return `${Math.floor(diffMonth / 12)}y ago`;
}

// ---------------------------------------------------------------------------
// ContinueWhereYouLeftOff
// ---------------------------------------------------------------------------

export function ContinueWhereYouLeftOff({
  items,
  onItemClick,
}: ContinueWhereYouLeftOffProps) {
  if (items.length === 0) return null;

  const visible = items.slice(0, 3);

  return (
    <div
      data-testid="continue-where-you-left-off"
      className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 shadow-sm"
    >
      {/* Section heading */}
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Continue Where You Left Off
      </h2>

      <div className="flex flex-col gap-1">
        {visible.map((entry) => (
          <button
            key={`${entry.type}-${entry.id}`}
            type="button"
            data-testid={`recent-item-${entry.type}-${entry.id}`}
            onClick={() => onItemClick(entry)}
            className="flex items-center gap-3 rounded px-3 py-2 text-left transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label={`Open ${entry.type} ${entry.name}`}
          >
            <span className="text-slate-500" aria-hidden="true">
              {entry.type === 'project' ? (
                <Folder size={15} />
              ) : (
                <FileText size={15} />
              )}
            </span>
            <span className="flex-1 truncate text-sm text-slate-300">{entry.name}</span>
            <span className="shrink-0 text-xs text-slate-500">{relativeTime(entry.timestamp)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
