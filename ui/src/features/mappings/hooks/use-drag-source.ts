/**
 * useDragSource — manages drag state for a draggable source schema field.
 *
 * Returns event handlers and state for a single draggable element.
 * The drag payload is the source field path string, set as plain text
 * on the DataTransfer object so it can be read by any drop zone.
 *
 * Usage:
 *   const { isDragging, dragHandlers } = useDragSource(fieldPath);
 *   <div draggable {...dragHandlers} />
 */

import { useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DragHandlers {
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

export interface UseDragSourceResult {
  /** Whether this element is currently being dragged */
  isDragging: boolean;
  /** Event handlers to spread onto the draggable element */
  dragHandlers: DragHandlers;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @param path  The source field path to encode in the drag payload.
 */
export function useDragSource(path: string): UseDragSourceResult {
  const [isDragging, setIsDragging] = useState(false);

  const onDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('text/plain', path);
      e.dataTransfer.effectAllowed = 'copy';
      setIsDragging(true);
    },
    [path],
  );

  const onDragEnd = useCallback((_e: React.DragEvent) => {
    setIsDragging(false);
  }, []);

  return {
    isDragging,
    dragHandlers: { onDragStart, onDragEnd },
  };
}
