import { Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { SchemaLibraryItem } from '../types';

import { PATHS } from '@/routes/paths';

export interface SchemaLibraryListActionsProps {
  item: SchemaLibraryItem;
}

export function SchemaLibraryListActions({ item }: SchemaLibraryListActionsProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-end gap-2" data-testid="schema-list-actions">
      <button
        type="button"
        aria-label={`View ${item.name}`}
        onClick={(event) => {
          event.stopPropagation();
          navigate(PATHS.SCHEMA_DETAIL.replace(':schemaId', item.schemaId));
        }}
        className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        data-testid="schema-list-action-view"
      >
        <Eye size={12} aria-hidden="true" />
        View
      </button>
    </div>
  );
}
