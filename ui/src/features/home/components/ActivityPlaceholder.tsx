// ActivityPlaceholder — Right-rail activity feed placeholder (FS-049 T-07)
// Renders a card with "Recent Activity" heading and placeholder text.
// Will be replaced with a real activity feed when event tracking is available.

import { Activity } from 'lucide-react';

export function ActivityPlaceholder() {
  return (
    <div
      data-testid="activity-placeholder"
      className="flex min-h-[200px] flex-col rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 shadow-sm"
    >
      {/* Section heading */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Recent Activity
      </h2>

      {/* Placeholder body */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6">
        <Activity size={28} className="text-slate-600" aria-hidden="true" />
        <p className="max-w-[200px] text-center text-sm text-slate-500">
          Activity feed will appear here when event tracking is available.
        </p>
      </div>
    </div>
  );
}
