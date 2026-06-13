import { ChevronsDown, ChevronsUp } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components';

interface SchemaTreeToolbarProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  searchSlot?: ReactNode;
}

export function SchemaTreeToolbar({
  onExpandAll,
  onCollapseAll,
  searchSlot,
}: SchemaTreeToolbarProps) {
  return (
    <div className="mb-2 flex items-start gap-2 border-b border-slate-700/50 py-1" data-testid="schema-tree-controls-row">
      <div className="min-w-0 flex-1" data-testid="schema-tree-controls-search-slot">{searchSlot}</div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onExpandAll}
        data-testid="schema-tree-expand-button"
        aria-label="Expand All"
        title="Expand All"
      >
        <ChevronsDown size={14} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onCollapseAll}
        data-testid="schema-tree-collapse-button"
        aria-label="Collapse All"
        title="Collapse All"
      >
        <ChevronsUp size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}
