// SchemaLibraryEmptyState — Zero-schemas empty state for the Schema Library (FS-016 T-04)

import { Database } from 'lucide-react';

export function SchemaLibraryEmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-20 text-center"
      data-testid="schema-library-empty"
    >
      <Database size={40} className="text-slate-600" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-slate-200">No schemas available</h2>
        <p className="max-w-sm text-sm text-slate-400">
          Upload a schema from a Project Overview page, or link one from the CDM library.
        </p>
      </div>
    </div>
  );
}
