import { ClipboardCopy, Copy, Trash2 } from 'lucide-react';

import { Button } from '@/components';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BulkActionBarProps {
  /** Number of selected rules */
  selectedCount: number;
  /** Called when "Delete selected" is clicked */
  onDeleteSelected: () => void;
  /** Called when "Duplicate selected" is clicked */
  onDuplicateSelected: () => void;
  /** Called when "Copy to clipboard" is clicked */
  onCopySelected: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Bulk action bar that appears when 1+ rules are selected.
 * Shows the selection count and provides bulk actions.
 */
export function BulkActionBar({
  selectedCount,
  onDeleteSelected,
  onDuplicateSelected,
  onCopySelected,
}: BulkActionBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-3 border-b border-blue-900/50 bg-blue-950/30 px-3 py-2"
      role="toolbar"
      aria-label="Bulk actions"
      aria-live="assertive"
      data-testid="bulk-action-bar"
    >
      {/* Screen-reader-only announcement when bar appears */}
      <span className="sr-only">
        {selectedCount} {selectedCount === 1 ? 'rule' : 'rules'} selected. Actions: Delete, Duplicate, Copy.
      </span>
      {/* Selection count */}
      <span className="text-xs font-medium text-blue-300" data-testid="bulk-selection-count">
        {selectedCount} {selectedCount === 1 ? 'rule' : 'rules'} selected
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Copy to clipboard */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onCopySelected}
        data-testid="bulk-copy"
        aria-label="Copy selected rules to clipboard"
      >
        <ClipboardCopy size={13} aria-hidden="true" />
        Copy
      </Button>

      {/* Duplicate selected */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onDuplicateSelected}
        data-testid="bulk-duplicate"
        aria-label="Duplicate selected rules"
      >
        <Copy size={13} aria-hidden="true" />
        Duplicate
      </Button>

      {/* Delete selected */}
      <Button
        variant="danger"
        size="sm"
        onClick={onDeleteSelected}
        data-testid="bulk-delete"
        aria-label="Delete selected rules"
      >
        <Trash2 size={13} aria-hidden="true" />
        Delete
      </Button>
    </div>
  );
}
