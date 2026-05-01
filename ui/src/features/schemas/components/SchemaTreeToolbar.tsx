import { ChevronsDown, ChevronsUp } from 'lucide-react';

import { Button } from '@/components';

interface SchemaTreeToolbarProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onExpandToDepth: (depth: number) => void;
}

export function SchemaTreeToolbar({ onExpandAll, onCollapseAll, onExpandToDepth }: SchemaTreeToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-slate-700/50">
      <Button variant="ghost" size="sm" onClick={onExpandAll}>
        <ChevronsDown size={14} aria-hidden="true" />
        Expand All
      </Button>
      <Button variant="ghost" size="sm" onClick={onCollapseAll}>
        <ChevronsUp size={14} aria-hidden="true" />
        Collapse All
      </Button>

      <span className="ml-2 text-xs text-slate-400">Depth:</span>
      <select
        aria-label="Expand to depth"
        className="ml-1 text-xs bg-slate-800 text-slate-200 border border-slate-600 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        defaultValue=""
        onChange={(e) => {
          const depth = Number(e.target.value);
          if (depth > 0) {
            onExpandToDepth(depth);
          }
          // Reset so same value can be re-selected
          e.target.value = '';
        }}
      >
        <option value="" disabled>
          —
        </option>
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
      </select>
    </div>
  );
}
