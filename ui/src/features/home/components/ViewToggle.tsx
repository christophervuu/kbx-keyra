// ViewToggle — Grid/table view mode toggle button group (FS-014 T-07)

import { LayoutGrid, List } from 'lucide-react';

import type { ViewMode } from '../types';

export interface ViewToggleProps {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ viewMode, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center rounded-md border border-slate-700 bg-slate-800">
      <button
        type="button"
        onClick={() => onChange('grid')}
        aria-label="Grid view"
        aria-pressed={viewMode === 'grid'}
        className={`rounded-l-md p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 ${
          viewMode === 'grid'
            ? 'bg-slate-600 text-slate-100'
            : 'text-slate-400 hover:text-slate-100'
        }`}
      >
        <LayoutGrid size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onChange('table')}
        aria-label="Table view"
        aria-pressed={viewMode === 'table'}
        className={`rounded-r-md p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 ${
          viewMode === 'table'
            ? 'bg-slate-600 text-slate-100'
            : 'text-slate-400 hover:text-slate-100'
        }`}
      >
        <List size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
