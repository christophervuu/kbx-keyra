import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useResizableLayout } from './use-resizable-layout';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'keyra:editor-layout';

function setStorage(value: unknown) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function getStorage(): unknown {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useResizableLayout', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  it('initializes with defaults when localStorage is empty', () => {
    const { result } = renderHook(() => useResizableLayout());
    expect(result.current.layout.sourceWidth).toBe(240);
    expect(result.current.layout.targetWidth).toBe(450);
    expect(result.current.layout.bottomHeight).toBe(260);
    expect(result.current.layout.sourceCollapsed).toBe(false);
    expect(result.current.layout.bottomCollapsed).toBe(false);
  });

  it('reads and applies stored layout from localStorage', () => {
    setStorage({
      sourceWidth: 300,
      targetWidth: 500,
      bottomHeight: 320,
      sourceCollapsed: true,
      bottomCollapsed: false,
    });
    const { result } = renderHook(() => useResizableLayout());
    expect(result.current.layout.sourceWidth).toBe(300);
    expect(result.current.layout.targetWidth).toBe(500);
    expect(result.current.layout.bottomHeight).toBe(320);
    expect(result.current.layout.sourceCollapsed).toBe(true);
  });

  it('falls back to defaults on corrupt localStorage data', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
    const { result } = renderHook(() => useResizableLayout());
    expect(result.current.layout.sourceWidth).toBe(240);
    expect(result.current.layout.targetWidth).toBe(450);
  });

  it('clamps stored sourceWidth below minimum to MIN_SOURCE (180)', () => {
    setStorage({ sourceWidth: 50, targetWidth: 450, bottomHeight: 260, sourceCollapsed: false, bottomCollapsed: false });
    const { result } = renderHook(() => useResizableLayout());
    expect(result.current.layout.sourceWidth).toBeGreaterThanOrEqual(180);
  });

  it('clamps stored targetWidth below minimum to MIN_TARGET (250)', () => {
    setStorage({ sourceWidth: 240, targetWidth: 100, bottomHeight: 260, sourceCollapsed: false, bottomCollapsed: false });
    const { result } = renderHook(() => useResizableLayout());
    expect(result.current.layout.targetWidth).toBeGreaterThanOrEqual(250);
  });

  it('clamps stored bottomHeight below minimum to MIN_BOTTOM (180)', () => {
    setStorage({ sourceWidth: 240, targetWidth: 450, bottomHeight: 50, sourceCollapsed: false, bottomCollapsed: false });
    const { result } = renderHook(() => useResizableLayout());
    expect(result.current.layout.bottomHeight).toBeGreaterThanOrEqual(180);
  });

  // ---------------------------------------------------------------------------
  // Collapse / expand
  // ---------------------------------------------------------------------------

  it('collapseSource sets sourceCollapsed to true and persists', () => {
    const { result } = renderHook(() => useResizableLayout());
    act(() => {
      result.current.collapseSource();
    });
    expect(result.current.layout.sourceCollapsed).toBe(true);
    expect((getStorage() as { sourceCollapsed: boolean }).sourceCollapsed).toBe(true);
  });

  it('expandSource sets sourceCollapsed to false and persists', () => {
    setStorage({ ...{ sourceWidth: 240, targetWidth: 450, bottomHeight: 260, bottomCollapsed: false }, sourceCollapsed: true });
    const { result } = renderHook(() => useResizableLayout());
    act(() => {
      result.current.expandSource();
    });
    expect(result.current.layout.sourceCollapsed).toBe(false);
    expect((getStorage() as { sourceCollapsed: boolean }).sourceCollapsed).toBe(false);
  });

  it('collapseBottom sets bottomCollapsed to true and persists', () => {
    const { result } = renderHook(() => useResizableLayout());
    act(() => {
      result.current.collapseBottom();
    });
    expect(result.current.layout.bottomCollapsed).toBe(true);
    expect((getStorage() as { bottomCollapsed: boolean }).bottomCollapsed).toBe(true);
  });

  it('expandBottom sets bottomCollapsed to false and persists', () => {
    setStorage({ sourceWidth: 240, targetWidth: 450, bottomHeight: 260, sourceCollapsed: false, bottomCollapsed: true });
    const { result } = renderHook(() => useResizableLayout());
    act(() => {
      result.current.expandBottom();
    });
    expect(result.current.layout.bottomCollapsed).toBe(false);
    expect((getStorage() as { bottomCollapsed: boolean }).bottomCollapsed).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Double-click toggles
  // ---------------------------------------------------------------------------

  it('double-clicking source handle collapses source when expanded', () => {
    const { result } = renderHook(() => useResizableLayout());
    act(() => {
      result.current.sourceHandleProps.onDoubleClick();
    });
    expect(result.current.layout.sourceCollapsed).toBe(true);
  });

  it('double-clicking source handle expands source when collapsed', () => {
    setStorage({ sourceWidth: 240, targetWidth: 450, bottomHeight: 260, sourceCollapsed: true, bottomCollapsed: false });
    const { result } = renderHook(() => useResizableLayout());
    act(() => {
      result.current.sourceHandleProps.onDoubleClick();
    });
    expect(result.current.layout.sourceCollapsed).toBe(false);
  });

  it('double-clicking bottom handle collapses bottom when expanded', () => {
    const { result } = renderHook(() => useResizableLayout());
    act(() => {
      result.current.bottomHandleProps.onDoubleClick();
    });
    expect(result.current.layout.bottomCollapsed).toBe(true);
  });

  it('double-clicking bottom handle expands bottom when collapsed', () => {
    setStorage({ sourceWidth: 240, targetWidth: 450, bottomHeight: 260, sourceCollapsed: false, bottomCollapsed: true });
    const { result } = renderHook(() => useResizableLayout());
    act(() => {
      result.current.bottomHandleProps.onDoubleClick();
    });
    expect(result.current.layout.bottomCollapsed).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Drag — min-width enforcement
  // ---------------------------------------------------------------------------

  it('isDragging starts false', () => {
    const { result } = renderHook(() => useResizableLayout());
    expect(result.current.isDragging).toBe(false);
  });

  it('mousedown on source handle sets isDragging to true', () => {
    const { result } = renderHook(() => useResizableLayout());
    act(() => {
      result.current.sourceHandleProps.onMouseDown({
        preventDefault: vi.fn(),
        clientX: 240,
        clientY: 0,
      } as unknown as React.MouseEvent<HTMLElement>);
    });
    expect(result.current.isDragging).toBe(true);
  });

  it('mouseup after drag ends isDragging and persists layout', () => {
    const { result } = renderHook(() => useResizableLayout());
    act(() => {
      result.current.sourceHandleProps.onMouseDown({
        preventDefault: vi.fn(),
        clientX: 240,
        clientY: 0,
      } as unknown as React.MouseEvent<HTMLElement>);
    });
    expect(result.current.isDragging).toBe(true);
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    expect(result.current.isDragging).toBe(false);
    // Layout should have been persisted
    expect(getStorage()).not.toBeNull();
  });

  it('dragging source handle right grows source and shrinks target', () => {
    const { result } = renderHook(() => useResizableLayout());
    const initialSource = result.current.layout.sourceWidth;
    const initialTarget = result.current.layout.targetWidth;

    act(() => {
      result.current.sourceHandleProps.onMouseDown({
        preventDefault: vi.fn(),
        clientX: initialSource,
        clientY: 0,
      } as unknown as React.MouseEvent<HTMLElement>);
    });

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: initialSource + 40, clientY: 0 }));
    });

    expect(result.current.layout.sourceWidth).toBeGreaterThan(initialSource);
    expect(result.current.layout.targetWidth).toBeLessThan(initialTarget);
  });

  it('dragging source handle cannot shrink source below MIN_SOURCE (180)', () => {
    const { result } = renderHook(() => useResizableLayout());

    act(() => {
      result.current.sourceHandleProps.onMouseDown({
        preventDefault: vi.fn(),
        clientX: 240,
        clientY: 0,
      } as unknown as React.MouseEvent<HTMLElement>);
    });

    // Drag far left — should clamp at MIN_SOURCE
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0, clientY: 0 }));
    });

    expect(result.current.layout.sourceWidth).toBeGreaterThanOrEqual(180);
  });

  it('dragging source handle cannot shrink target below MIN_TARGET (250)', () => {
    const { result } = renderHook(() => useResizableLayout());

    act(() => {
      result.current.sourceHandleProps.onMouseDown({
        preventDefault: vi.fn(),
        clientX: 240,
        clientY: 0,
      } as unknown as React.MouseEvent<HTMLElement>);
    });

    // Drag far right — target should not go below MIN_TARGET
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 2000, clientY: 0 }));
    });

    expect(result.current.layout.targetWidth).toBeGreaterThanOrEqual(250);
  });
});
