import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseTestLabLayoutParams {
  traceEnabled: boolean;
}

export type LayoutBreakpoint = 'wide' | 'medium' | 'narrow';

export type PanelKey = 'output' | 'diff' | 'diagnostics' | 'trace';

export interface TestLabLayoutState {
  breakpoint: LayoutBreakpoint;
  collapsed: Record<PanelKey, boolean>;
  /** Left/right main divider ratio. Default 0.35. Clamped [0.2, 0.5]. */
  mainSplit: number;
  /** Wide-mode vertical divider ratio. Default 0.5. Clamped [0.2, 0.8]. */
  columnSplit: number;
  /** Wide-mode horizontal divider ratio. Default 0.5. Clamped [0.2, 0.8]. */
  rowSplit: number;
}

export interface UseTestLabLayoutResult {
  layout: TestLabLayoutState;
  togglePanel: (panel: PanelKey) => void;
  setMainSplit: (ratio: number) => void;
  setColumnSplit: (ratio: number) => void;
  setRowSplit: (ratio: number) => void;
  resetLayout: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'keyra:testlab-layout';

const WIDE_QUERY = '(min-width: 1280px)';
const MEDIUM_QUERY = '(min-width: 1024px)';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function detectBreakpoint(): LayoutBreakpoint {
  if (typeof window === 'undefined') return 'wide';
  if (window.matchMedia(WIDE_QUERY).matches) return 'wide';
  if (window.matchMedia(MEDIUM_QUERY).matches) return 'medium';
  return 'narrow';
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

type PersistedLayout = Omit<TestLabLayoutState, 'breakpoint'>;

function defaultCollapsed(traceEnabled: boolean): Record<PanelKey, boolean> {
  return {
    output: false,
    diff: false,
    diagnostics: false,
    trace: !traceEnabled,
  };
}

const SPLIT_DEFAULTS = {
  mainSplit: 0.35,
  columnSplit: 0.5,
  rowSplit: 0.5,
} as const;

function loadPersistedLayout(traceEnabled: boolean): PersistedLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { collapsed: defaultCollapsed(traceEnabled), ...SPLIT_DEFAULTS };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedLayout>;

    const collapsed: Record<PanelKey, boolean> = {
      output: typeof parsed.collapsed?.output === 'boolean' ? parsed.collapsed.output : false,
      diff: typeof parsed.collapsed?.diff === 'boolean' ? parsed.collapsed.diff : false,
      diagnostics:
        typeof parsed.collapsed?.diagnostics === 'boolean' ? parsed.collapsed.diagnostics : false,
      trace: !traceEnabled, // always derive trace from traceEnabled on mount
    };

    const mainSplit =
      typeof parsed.mainSplit === 'number'
        ? clamp(parsed.mainSplit, 0.2, 0.5)
        : SPLIT_DEFAULTS.mainSplit;
    const columnSplit =
      typeof parsed.columnSplit === 'number'
        ? clamp(parsed.columnSplit, 0.2, 0.8)
        : SPLIT_DEFAULTS.columnSplit;
    const rowSplit =
      typeof parsed.rowSplit === 'number'
        ? clamp(parsed.rowSplit, 0.2, 0.8)
        : SPLIT_DEFAULTS.rowSplit;

    return { collapsed, mainSplit, columnSplit, rowSplit };
  } catch {
    return { collapsed: defaultCollapsed(traceEnabled), ...SPLIT_DEFAULTS };
  }
}

function saveLayout(layout: TestLabLayoutState): void {
  try {
    const { breakpoint: _bp, ...persisted } = layout;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Silently ignore storage errors (private browsing, quota exceeded, etc.)
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useTestLabLayout — manages the Test Lab multi-panel layout state.
 *
 * Responsibilities:
 * - Breakpoint detection (wide / medium / narrow) via matchMedia
 * - Panel collapsed/expanded state with per-panel toggle
 * - Split ratios for main, column, and row dividers
 * - Trace panel auto-expand/collapse driven by traceEnabled
 * - localStorage persistence with graceful fallback
 */
export function useTestLabLayout({ traceEnabled }: UseTestLabLayoutParams): UseTestLabLayoutResult {
  const [layout, setLayout] = useState<TestLabLayoutState>(() => {
    const persisted = loadPersistedLayout(traceEnabled);
    return {
      breakpoint: detectBreakpoint(),
      ...persisted,
    };
  });

  // Keep a ref to current layout for use inside event listeners / effects
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // ---------------------------------------------------------------------------
  // Breakpoint detection
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const wideMedia = window.matchMedia(WIDE_QUERY);
    const mediumMedia = window.matchMedia(MEDIUM_QUERY);

    function handleChange() {
      const next = detectBreakpoint();
      setLayout((prev) => {
        if (prev.breakpoint === next) return prev;
        return { ...prev, breakpoint: next };
      });
    }

    wideMedia.addEventListener('change', handleChange);
    mediumMedia.addEventListener('change', handleChange);

    return () => {
      wideMedia.removeEventListener('change', handleChange);
      mediumMedia.removeEventListener('change', handleChange);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Trace auto-expand / auto-collapse
  // ---------------------------------------------------------------------------

  const prevTraceEnabledRef = useRef(traceEnabled);
  useEffect(() => {
    const prev = prevTraceEnabledRef.current;
    prevTraceEnabledRef.current = traceEnabled;

    if (prev === traceEnabled) return;

    setLayout((current) => {
      const next: TestLabLayoutState = {
        ...current,
        collapsed: {
          ...current.collapsed,
          trace: !traceEnabled,
        },
      };
      saveLayout(next);
      return next;
    });
  }, [traceEnabled]);

  // ---------------------------------------------------------------------------
  // Wide-startup safety recovery
  // ---------------------------------------------------------------------------

  const didRecoverWideStartupRef = useRef(false);
  useEffect(() => {
    if (didRecoverWideStartupRef.current) return;
    didRecoverWideStartupRef.current = true;

    setLayout((current) => {
      if (current.breakpoint !== 'wide') return current;

      let changed = false;
      const nextCollapsed = { ...current.collapsed };

      // Wide mode should not boot into a state where Output appears "missing".
      if (nextCollapsed.output) {
        nextCollapsed.output = false;
        changed = true;
      }

      // If trace is enabled, ensure Trace panel is visible on initial wide load.
      if (traceEnabled && nextCollapsed.trace) {
        nextCollapsed.trace = false;
        changed = true;
      }

      if (!changed) return current;

      const next: TestLabLayoutState = {
        ...current,
        collapsed: nextCollapsed,
      };
      saveLayout(next);
      return next;
    });
  }, [traceEnabled]);

  // Ensure wide mode always starts from a legible panel state when crossing
  // from medium/narrow into wide.
  const prevBreakpointRef = useRef(layout.breakpoint);
  useEffect(() => {
    const prev = prevBreakpointRef.current;
    prevBreakpointRef.current = layout.breakpoint;

    if (prev === layout.breakpoint) return;
    if (layout.breakpoint !== 'wide') return;

    setLayout((current) => {
      if (current.breakpoint !== 'wide') return current;

      const nextCollapsed = {
        ...current.collapsed,
        output: false,
        trace: !traceEnabled,
      };

      if (
        nextCollapsed.output === current.collapsed.output
        && nextCollapsed.trace === current.collapsed.trace
      ) {
        return current;
      }

      const next: TestLabLayoutState = {
        ...current,
        collapsed: nextCollapsed,
      };
      saveLayout(next);
      return next;
    });
  }, [layout.breakpoint, traceEnabled]);

  // ---------------------------------------------------------------------------
  // Panel toggle
  // ---------------------------------------------------------------------------

  const togglePanel = useCallback((panel: PanelKey) => {
    setLayout((current) => {
      // Output is not collapsible at medium breakpoint
      if (panel === 'output' && current.breakpoint === 'medium') return current;

      const next: TestLabLayoutState = {
        ...current,
        collapsed: {
          ...current.collapsed,
          [panel]: !current.collapsed[panel],
        },
      };
      saveLayout(next);
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Split ratio setters
  // ---------------------------------------------------------------------------

  const setMainSplit = useCallback((ratio: number) => {
    setLayout((current) => {
      const next: TestLabLayoutState = {
        ...current,
        mainSplit: clamp(ratio, 0.2, 0.5),
      };
      saveLayout(next);
      return next;
    });
  }, []);

  const setColumnSplit = useCallback((ratio: number) => {
    setLayout((current) => {
      const next: TestLabLayoutState = {
        ...current,
        columnSplit: clamp(ratio, 0.2, 0.8),
      };
      saveLayout(next);
      return next;
    });
  }, []);

  const setRowSplit = useCallback((ratio: number) => {
    setLayout((current) => {
      const next: TestLabLayoutState = {
        ...current,
        rowSplit: clamp(ratio, 0.2, 0.8),
      };
      saveLayout(next);
      return next;
    });
  }, []);

  const resetLayout = useCallback(() => {
    setLayout((current) => {
      const next: TestLabLayoutState = {
        ...current,
        collapsed: defaultCollapsed(traceEnabled),
        ...SPLIT_DEFAULTS,
      };
      saveLayout(next);
      return next;
    });
  }, [traceEnabled]);

  return { layout, togglePanel, setMainSplit, setColumnSplit, setRowSplit, resetLayout };
}
