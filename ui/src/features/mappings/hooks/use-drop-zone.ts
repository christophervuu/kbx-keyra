/**
 * useDropZone — manages drop zone state for accepting dragged source fields.
 *
 * Reads the source field path from DataTransfer and fires `onDrop(path)`.
 * Provides `isDragOver` for visual feedback.
 *
 * Usage:
 *   const { isDragOver, dropHandlers } = useDropZone({ onDrop });
 *   <div {...dropHandlers} className={isDragOver ? 'ring-2 ring-blue-500' : ''} />
 */

import { useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseDropZoneOptions {
  /** Called when a valid source field is dropped. Receives the field path. */
  onDrop: (path: string) => void;
}

export interface DropHandlers {
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export interface UseDropZoneResult {
  /** Whether a drag is currently hovering over this drop zone */
  isDragOver: boolean;
  /** Event handlers to spread onto the drop zone element */
  dropHandlers: DropHandlers;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDropZone({ onDrop }: UseDropZoneOptions): UseDropZoneResult {
  const [isDragOver, setIsDragOver] = useState(false);
  // Track enter/leave depth to handle child element transitions correctly
  const [enterCount, setEnterCount] = useState(0);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setEnterCount((c) => {
      const next = c + 1;
      if (next === 1) setIsDragOver(true);
      return next;
    });
  }, []);

  const onDragLeave = useCallback((_e: React.DragEvent) => {
    setEnterCount((c) => {
      const next = c - 1;
      if (next <= 0) {
        setIsDragOver(false);
        return 0;
      }
      return next;
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      setEnterCount(0);
      const path = e.dataTransfer.getData('text/plain');
      if (path) {
        onDrop(path);
      }
    },
    [onDrop],
  );

  return {
    isDragOver,
    dropHandlers: {
      onDragOver,
      onDragEnter,
      onDragLeave,
      onDrop: handleDrop,
    },
  };
}
