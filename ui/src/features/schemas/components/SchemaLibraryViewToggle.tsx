import { LayoutGrid, List } from 'lucide-react';

import type { SchemaLibraryViewMode } from '../types';

export interface SchemaLibraryViewToggleProps {
  viewMode: SchemaLibraryViewMode;
  onChange: (mode: SchemaLibraryViewMode) => void;
}

export function SchemaLibraryViewToggle({ viewMode, onChange }: SchemaLibraryViewToggleProps) {
  return (
    <div
      className="flex items-center rounded-md border border-slate-700 bg-slate-800"
      aria-label="Schema view mode"
      data-testid="schema-view-toggle"
    >
      <button
        type="button"
        onClick={() => onChange('card')}
        aria-label="Card view"
        aria-pressed={viewMode === 'card'}
        className={`rounded-l-md p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 ${
          viewMode === 'card'
            ? 'bg-slate-600 text-slate-100'
            : 'text-slate-400 hover:text-slate-100'
        }`}
      >
        <LayoutGrid size={16} aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={() => onChange('list')}
        aria-label="List view"
        aria-pressed={viewMode === 'list'}
        className={`rounded-r-md p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 ${
          viewMode === 'list'
            ? 'bg-slate-600 text-slate-100'
            : 'text-slate-400 hover:text-slate-100'
        }`}
      >
        <List size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
