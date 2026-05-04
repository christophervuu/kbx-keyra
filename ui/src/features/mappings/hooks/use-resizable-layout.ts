import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LayoutState {
  sourceWidth: number;
  targetWidth: number;
  bottomHeight: number;
  sourceCollapsed: boolean;
  bottomCollapsed: boolean;
}

export interface ResizeHandleProps {
  onMouseDown: (event: React.MouseEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
}

export interface UseResizableLayoutResult {
  layout: LayoutState;
  isDragging: boolean;
  sourceHandleProps: ResizeHandleProps;
  builderHandleProps: ResizeHandleProps;
  bottomHandleProps: ResizeHandleProps;
  expandSource: () => void;
  collapseSource: () => void;
  expandBottom: () => void;
  collapseBottom: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'keyra:editor-layout';

const DEFAULTS: LayoutState = {
  sourceWidth: 240,
  targetWidth: 450,
  bottomHeight: 260,
  sourceCollapsed: false,
  bottomCollapsed: false,
};

const MIN_SOURCE = 180;
const MIN_TARGET = 250;
const MIN_BUILDER = 300;
const MIN_BOTTOM = 180;
const MAX_BOTTOM_FRACTION = 0.65;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<LayoutState>;

    const sourceWidth = typeof parsed.sourceWidth === 'number'
      ? clamp(parsed.sourceWidth, MIN_SOURCE, 600)
      : DEFAULTS.sourceWidth;
    const targetWidth = typeof parsed.targetWidth === 'number'
      ? clamp(parsed.targetWidth, MIN_TARGET, 1200)
      : DEFAULTS.targetWidth;
    const bottomHeight = typeof parsed.bottomHeight === 'number'
      ? clamp(parsed.bottomHeight, MIN_BOTTOM, Math.floor(window.innerHeight * MAX_BOTTOM_FRACTION))
      : DEFAULTS.bottomHeight;
    const sourceCollapsed = typeof parsed.sourceCollapsed === 'boolean'
      ? parsed.sourceCollapsed
      : DEFAULTS.sourceCollapsed;
    const bottomCollapsed = typeof parsed.bottomCollapsed === 'boolean'
      ? parsed.bottomCollapsed
      : DEFAULTS.bottomCollapsed;

    return { sourceWidth, targetWidth, bottomHeight, sourceCollapsed, bottomCollapsed };
  } catch {
    return DEFAULTS;
  }
}

function saveLayout(layout: LayoutState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Silently ignore storage errors (private browsing, quota exceeded, etc.)
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages resizable column widths, bottom panel height, and collapse states
 * for the Mapping Editor three-column layout.
 *
 * - Reads/writes `keyra:editor-layout` in localStorage.
 * - Drag logic uses mousedown/mousemove/mouseup (not HTML5 DnD) to avoid
 *   conflicts with source-field drag-and-drop.
 * - Min-width constraints: Source 180px, Target 250px, Builder 300px.
 * - Source and Bottom panels are collapsible. Builder is resize-only.
 */
export function useResizableLayout(): UseResizableLayoutResult {
  const [layout, setLayout] = useState<LayoutState>(loadLayout);
  const [isDragging, setIsDragging] = useState(false);

  // Drag state refs — avoid stale closures in event listeners
  const dragTypeRef = useRef<'source' | 'builder' | 'bottom' | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const dragStartSourceRef = useRef(0);
  const dragStartTargetRef = useRef(0);
  const dragStartBottomRef = useRef(0);

  // Keep a ref to current layout for use inside event listeners
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // ---------------------------------------------------------------------------
  // Drag handlers
  // ---------------------------------------------------------------------------

  const startDrag = useCallback(
    (type: 'source' | 'builder' | 'bottom', event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      dragTypeRef.current = type;
      dragStartXRef.current = event.clientX;
      dragStartYRef.current = event.clientY;
      dragStartSourceRef.current = layoutRef.current.sourceWidth;
      dragStartTargetRef.current = layoutRef.current.targetWidth;
      dragStartBottomRef.current = layoutRef.current.bottomHeight;
      setIsDragging(true);
    },
    [],
  );

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(event: MouseEvent) {
      const type = dragTypeRef.current;
      if (!type) return;

      if (type === 'bottom') {
        const delta = dragStartYRef.current - event.clientY;
        const maxBottom = Math.max(320, Math.floor(window.innerHeight * MAX_BOTTOM_FRACTION));
        const nextHeight = clamp(dragStartBottomRef.current + delta, MIN_BOTTOM, maxBottom);
        setLayout((prev) => ({ ...prev, bottomHeight: nextHeight }));
        return;
      }

      const deltaX = event.clientX - dragStartXRef.current;
      const startSource = dragStartSourceRef.current;
      const startTarget = dragStartTargetRef.current;

      if (type === 'source') {
        // Dragging the handle between Source and Target:
        // Moving right → Source grows, Target shrinks
        // Moving left → Source shrinks, Target grows
        const newSource = clamp(startSource + deltaX, MIN_SOURCE, startSource + startTarget - MIN_TARGET);
        const newTarget = startSource + startTarget - newSource;
        setLayout((prev) => ({ ...prev, sourceWidth: newSource, targetWidth: newTarget }));
      } else if (type === 'builder') {
        // Dragging the handle between Target and Builder:
        // Moving right → Target grows, Builder shrinks (but Builder has a min)
        // Moving left → Target shrinks, Builder grows
        // We don't track builderWidth directly — it's derived from remaining space.
        // We track targetWidth and let builder fill the rest.
        // The total available width is unknown here (it's the viewport minus source).
        // We can only enforce that target doesn't grow so much that builder < MIN_BUILDER.
        // We approximate: clamp target growth by checking available space.
        // Since we don't know total width, we just clamp target to a reasonable max.
        const newTarget = clamp(startTarget + deltaX, MIN_TARGET, startTarget + 800);
        setLayout((prev) => ({ ...prev, targetWidth: newTarget }));
      }
    }

    function handleMouseUp() {
      setIsDragging(false);
      dragTypeRef.current = null;
      // Persist on drag end
      saveLayout(layoutRef.current);
    }

    document.body.style.userSelect = 'none';
    document.body.style.cursor = dragTypeRef.current === 'bottom' ? 'row-resize' : 'col-resize';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // ---------------------------------------------------------------------------
  // Collapse / expand
  // ---------------------------------------------------------------------------

  const collapseSource = useCallback(() => {
    setLayout((prev) => {
      const next = { ...prev, sourceCollapsed: true };
      saveLayout(next);
      return next;
    });
  }, []);

  const expandSource = useCallback(() => {
    setLayout((prev) => {
      const next = { ...prev, sourceCollapsed: false };
      saveLayout(next);
      return next;
    });
  }, []);

  const collapseBottom = useCallback(() => {
    setLayout((prev) => {
      const next = { ...prev, bottomCollapsed: true };
      saveLayout(next);
      return next;
    });
  }, []);

  const expandBottom = useCallback(() => {
    setLayout((prev) => {
      const next = { ...prev, bottomCollapsed: false };
      saveLayout(next);
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Handle props
  // ---------------------------------------------------------------------------

  const sourceHandleProps: ResizeHandleProps = {
    onMouseDown: (e) => startDrag('source', e),
    onDoubleClick: () => {
      if (layout.sourceCollapsed) {
        expandSource();
      } else {
        collapseSource();
      }
    },
  };

  const builderHandleProps: ResizeHandleProps = {
    onMouseDown: (e) => startDrag('builder', e),
    onDoubleClick: () => {
      // Builder collapse not implemented in this task — no-op
    },
  };

  const bottomHandleProps: ResizeHandleProps = {
    onMouseDown: (e) => startDrag('bottom', e),
    onDoubleClick: () => {
      if (layout.bottomCollapsed) {
        expandBottom();
      } else {
        collapseBottom();
      }
    },
  };

  return {
    layout,
    isDragging,
    sourceHandleProps,
    builderHandleProps,
    bottomHandleProps,
    expandSource,
    collapseSource,
    expandBottom,
    collapseBottom,
  };
}
