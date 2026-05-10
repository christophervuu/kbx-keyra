import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTestLabLayout } from './use-test-lab-layout';

// ---------------------------------------------------------------------------
// matchMedia mock
// ---------------------------------------------------------------------------

type MediaQueryListener = (e: MediaQueryListEvent) => void;

interface MockMQL {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  _listeners: MediaQueryListener[];
  _trigger: (matches: boolean) => void;
}

function makeMQL(matches: boolean): MockMQL {
  const listeners: MediaQueryListener[] = [];
  const mql: MockMQL = {
    matches,
    addEventListener: vi.fn((_event: string, cb: MediaQueryListener) => {
      listeners.push(cb);
    }),
    removeEventListener: vi.fn((_event: string, cb: MediaQueryListener) => {
      const idx = listeners.indexOf(cb);
      if (idx !== -1) listeners.splice(idx, 1);
    }),
    _listeners: listeners,
    _trigger(newMatches: boolean) {
      mql.matches = newMatches;
      listeners.forEach((cb) => cb({ matches: newMatches } as MediaQueryListEvent));
    },
  };
  return mql;
}

let wideMQL: MockMQL;
let mediumMQL: MockMQL;

function setupMatchMedia(isWide: boolean, isMedium: boolean) {
  wideMQL = makeMQL(isWide);
  mediumMQL = makeMQL(isMedium);
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => {
      if (query === '(min-width: 1280px)') return wideMQL as unknown as MediaQueryList;
      if (query === '(min-width: 1024px)') return mediumMQL as unknown as MediaQueryList;
      return makeMQL(false) as unknown as MediaQueryList;
    }),
  });
}

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

let store: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    store = {};
  }),
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  store = {};
  vi.clearAllMocks();
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
  // Default: wide viewport
  setupMatchMedia(true, true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTestLabLayout', () => {
  describe('default state', () => {
    it('returns wide breakpoint when matchMedia wide matches', () => {
      setupMatchMedia(true, true);
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      expect(result.current.layout.breakpoint).toBe('wide');
    });

    it('returns medium breakpoint when wide does not match but medium does', () => {
      setupMatchMedia(false, true);
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      expect(result.current.layout.breakpoint).toBe('medium');
    });

    it('returns narrow breakpoint when neither wide nor medium matches', () => {
      setupMatchMedia(false, false);
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      expect(result.current.layout.breakpoint).toBe('narrow');
    });

    it('has correct default split ratios', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      expect(result.current.layout.mainSplit).toBe(0.35);
      expect(result.current.layout.columnSplit).toBe(0.5);
      expect(result.current.layout.rowSplit).toBe(0.5);
    });

    it('all panels expanded when traceEnabled=true', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      const { collapsed } = result.current.layout;
      expect(collapsed.output).toBe(false);
      expect(collapsed.diff).toBe(false);
      expect(collapsed.diagnostics).toBe(false);
      expect(collapsed.trace).toBe(false);
    });

    it('trace panel collapsed when traceEnabled=false', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: false }));
      expect(result.current.layout.collapsed.trace).toBe(true);
    });

    it('recovers output panel on wide startup when persisted output is collapsed', () => {
      store['keyra:testlab-layout'] = JSON.stringify({
        collapsed: { output: true, diff: false, diagnostics: false, trace: false },
        mainSplit: 0.35,
        columnSplit: 0.5,
        rowSplit: 0.5,
      });
      setupMatchMedia(true, true);

      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      expect(result.current.layout.collapsed.output).toBe(false);
    });

    it('other panels expanded when traceEnabled=false', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: false }));
      const { collapsed } = result.current.layout;
      expect(collapsed.output).toBe(false);
      expect(collapsed.diff).toBe(false);
      expect(collapsed.diagnostics).toBe(false);
    });
  });

  describe('togglePanel', () => {
    it('toggles a panel from expanded to collapsed', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      act(() => result.current.togglePanel('diff'));
      expect(result.current.layout.collapsed.diff).toBe(true);
    });

    it('toggles a panel from collapsed to expanded', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: false }));
      act(() => result.current.togglePanel('trace'));
      expect(result.current.layout.collapsed.trace).toBe(false);
    });

    it('does not affect other panels when toggling one', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      act(() => result.current.togglePanel('diagnostics'));
      expect(result.current.layout.collapsed.output).toBe(false);
      expect(result.current.layout.collapsed.diff).toBe(false);
      expect(result.current.layout.collapsed.trace).toBe(false);
    });

    it('togglePanel("output") is a no-op at medium breakpoint', () => {
      setupMatchMedia(false, true);
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      act(() => result.current.togglePanel('output'));
      expect(result.current.layout.collapsed.output).toBe(false);
    });

    it('togglePanel("output") works at wide breakpoint', () => {
      setupMatchMedia(true, true);
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      act(() => result.current.togglePanel('output'));
      expect(result.current.layout.collapsed.output).toBe(true);
    });

    it('togglePanel("output") works at narrow breakpoint', () => {
      setupMatchMedia(false, false);
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      act(() => result.current.togglePanel('output'));
      expect(result.current.layout.collapsed.output).toBe(true);
    });

    it('persists to localStorage on toggle', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      act(() => result.current.togglePanel('diff'));
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'keyra:testlab-layout',
        expect.stringContaining('"diff":true'),
      );
    });
  });

  describe('trace auto-behavior', () => {
    it('auto-expands trace when traceEnabled changes false→true', () => {
      const { result, rerender } = renderHook(
        ({ traceEnabled }) => useTestLabLayout({ traceEnabled }),
        { initialProps: { traceEnabled: false } },
      );
      expect(result.current.layout.collapsed.trace).toBe(true);
      rerender({ traceEnabled: true });
      expect(result.current.layout.collapsed.trace).toBe(false);
    });

    it('auto-collapses trace when traceEnabled changes true→false', () => {
      const { result, rerender } = renderHook(
        ({ traceEnabled }) => useTestLabLayout({ traceEnabled }),
        { initialProps: { traceEnabled: true } },
      );
      expect(result.current.layout.collapsed.trace).toBe(false);
      rerender({ traceEnabled: false });
      expect(result.current.layout.collapsed.trace).toBe(true);
    });

    it('does not change other panels when traceEnabled changes', () => {
      const { result, rerender } = renderHook(
        ({ traceEnabled }) => useTestLabLayout({ traceEnabled }),
        { initialProps: { traceEnabled: true } },
      );
      act(() => result.current.togglePanel('diff'));
      rerender({ traceEnabled: false });
      expect(result.current.layout.collapsed.diff).toBe(true); // unchanged
    });
  });

  describe('split ratio setters', () => {
    it('setMainSplit updates mainSplit', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      act(() => result.current.setMainSplit(0.4));
      expect(result.current.layout.mainSplit).toBe(0.4);
    });

    it('setMainSplit clamps to 0.2 minimum', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      act(() => result.current.setMainSplit(0.1));
      expect(result.current.layout.mainSplit).toBe(0.2);
    });

    it('setMainSplit clamps to 0.5 maximum', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      act(() => result.current.setMainSplit(0.9));
      expect(result.current.layout.mainSplit).toBe(0.5);
    });

    it('setColumnSplit updates columnSplit', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      act(() => result.current.setColumnSplit(0.6));
      expect(result.current.layout.columnSplit).toBe(0.6);
    });

    it('setColumnSplit clamps to [0.2, 0.8]', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      act(() => result.current.setColumnSplit(0.05));
      expect(result.current.layout.columnSplit).toBe(0.2);
      act(() => result.current.setColumnSplit(0.95));
      expect(result.current.layout.columnSplit).toBe(0.8);
    });

    it('setRowSplit updates rowSplit', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      act(() => result.current.setRowSplit(0.3));
      expect(result.current.layout.rowSplit).toBe(0.3);
    });

    it('setRowSplit clamps to [0.2, 0.8]', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      act(() => result.current.setRowSplit(0.0));
      expect(result.current.layout.rowSplit).toBe(0.2);
      act(() => result.current.setRowSplit(1.0));
      expect(result.current.layout.rowSplit).toBe(0.8);
    });

    it('persists split ratio to localStorage', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      act(() => result.current.setColumnSplit(0.7));
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'keyra:testlab-layout',
        expect.stringContaining('"columnSplit":0.7'),
      );
    });
  });

  describe('resetLayout', () => {
    it('restores default split ratios and collapsed state', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));

      act(() => {
        result.current.togglePanel('diff');
        result.current.setMainSplit(0.5);
        result.current.setColumnSplit(0.8);
        result.current.setRowSplit(0.2);
      });

      act(() => {
        result.current.resetLayout();
      });

      expect(result.current.layout.collapsed.output).toBe(false);
      expect(result.current.layout.collapsed.diff).toBe(false);
      expect(result.current.layout.collapsed.diagnostics).toBe(false);
      expect(result.current.layout.collapsed.trace).toBe(false);
      expect(result.current.layout.mainSplit).toBe(0.35);
      expect(result.current.layout.columnSplit).toBe(0.5);
      expect(result.current.layout.rowSplit).toBe(0.5);
    });

    it('keeps trace collapsed after reset when traceEnabled=false', () => {
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: false }));

      act(() => {
        result.current.resetLayout();
      });

      expect(result.current.layout.collapsed.trace).toBe(true);
    });
  });

  describe('localStorage persistence', () => {
    it('reads persisted collapsed state on mount with wide-startup output recovery', () => {
      store['keyra:testlab-layout'] = JSON.stringify({
        collapsed: { output: true, diff: false, diagnostics: true, trace: false },
        mainSplit: 0.35,
        columnSplit: 0.5,
        rowSplit: 0.5,
      });
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      expect(result.current.layout.collapsed.output).toBe(false);
      expect(result.current.layout.collapsed.diagnostics).toBe(true);
      expect(result.current.layout.collapsed.diff).toBe(false);
    });

    it('reads persisted split ratios on mount', () => {
      store['keyra:testlab-layout'] = JSON.stringify({
        collapsed: { output: false, diff: false, diagnostics: false, trace: false },
        mainSplit: 0.45,
        columnSplit: 0.3,
        rowSplit: 0.7,
      });
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      expect(result.current.layout.mainSplit).toBe(0.45);
      expect(result.current.layout.columnSplit).toBe(0.3);
      expect(result.current.layout.rowSplit).toBe(0.7);
    });

    it('always derives trace from traceEnabled on mount (ignores persisted trace)', () => {
      store['keyra:testlab-layout'] = JSON.stringify({
        collapsed: { output: false, diff: false, diagnostics: false, trace: false },
        mainSplit: 0.35,
        columnSplit: 0.5,
        rowSplit: 0.5,
      });
      // traceEnabled=false → trace should be collapsed regardless of persisted value
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: false }));
      expect(result.current.layout.collapsed.trace).toBe(true);
    });

    it('falls back to defaults on invalid JSON', () => {
      store['keyra:testlab-layout'] = 'not-valid-json{{{';
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      expect(result.current.layout.mainSplit).toBe(0.35);
      expect(result.current.layout.columnSplit).toBe(0.5);
      expect(result.current.layout.rowSplit).toBe(0.5);
      expect(result.current.layout.collapsed.output).toBe(false);
    });

    it('falls back to defaults when localStorage key is missing', () => {
      // store is empty
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      expect(result.current.layout.mainSplit).toBe(0.35);
      expect(result.current.layout.collapsed.output).toBe(false);
    });

    it('clamps persisted split ratios that are out of range', () => {
      store['keyra:testlab-layout'] = JSON.stringify({
        collapsed: { output: false, diff: false, diagnostics: false, trace: false },
        mainSplit: 0.9, // out of [0.2, 0.5]
        columnSplit: 0.05, // out of [0.2, 0.8]
        rowSplit: 0.95, // out of [0.2, 0.8]
      });
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      expect(result.current.layout.mainSplit).toBe(0.5);
      expect(result.current.layout.columnSplit).toBe(0.2);
      expect(result.current.layout.rowSplit).toBe(0.8);
    });

    it('storage write failures do not throw', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      expect(() => {
        act(() => result.current.togglePanel('diff'));
      }).not.toThrow();
    });
  });

  describe('breakpoint detection via matchMedia', () => {
    it('updates breakpoint to medium when wide media query changes to not-matching', () => {
      setupMatchMedia(true, true);
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      expect(result.current.layout.breakpoint).toBe('wide');

      act(() => {
        wideMQL._trigger(false);
      });
      expect(result.current.layout.breakpoint).toBe('medium');
    });

    it('updates breakpoint to narrow when both media queries stop matching', () => {
      setupMatchMedia(true, true);
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));

      act(() => {
        wideMQL._trigger(false);
        mediumMQL._trigger(false);
      });
      expect(result.current.layout.breakpoint).toBe('narrow');
    });

    it('updates breakpoint to wide when wide media query starts matching', () => {
      setupMatchMedia(false, true);
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));
      expect(result.current.layout.breakpoint).toBe('medium');

      act(() => {
        wideMQL._trigger(true);
      });
      expect(result.current.layout.breakpoint).toBe('wide');
    });

    it('re-normalizes output and trace visibility when entering wide breakpoint', () => {
      setupMatchMedia(false, false);
      const { result } = renderHook(() => useTestLabLayout({ traceEnabled: true }));

      act(() => {
        result.current.togglePanel('output');
        result.current.togglePanel('trace');
      });
      expect(result.current.layout.collapsed.output).toBe(true);
      expect(result.current.layout.collapsed.trace).toBe(true);

      act(() => {
        mediumMQL._trigger(true);
        wideMQL._trigger(true);
      });

      expect(result.current.layout.breakpoint).toBe('wide');
      expect(result.current.layout.collapsed.output).toBe(false);
      expect(result.current.layout.collapsed.trace).toBe(false);
    });
  });
});
