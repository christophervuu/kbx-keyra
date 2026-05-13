/**
 * BreadcrumbContext — extensible breadcrumb name resolution infrastructure.
 *
 * Pages that own dynamic route segments (e.g. projectId, mappingId) can call
 * `useBreadcrumbLabel(segmentValue, humanReadableName)` to register a display
 * label. The `Breadcrumbs` component reads from this context and substitutes
 * registered labels for matching URL segments instead of showing raw IDs.
 *
 * Design decisions (FS-050 Q1):
 * - React Context is used over a callback-prop approach for extensibility —
 *   multiple nested routes can independently register labels without prop
 *   drilling through AppLayout.
 * - The context is split into a stable setter context and a read-only labels
 *   context to prevent Breadcrumbs from re-rendering on every label change
 *   caused by unrelated pages.
 * - The provider is narrowly scoped to the layout subtree (placed in
 *   AppLayout) so it does not affect unrelated parts of the tree.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BreadcrumbLabels = ReadonlyMap<string, string>;

interface BreadcrumbSetters {
  setLabel: (segment: string, label: string) => void;
  removeLabel: (segment: string) => void;
}

// ---------------------------------------------------------------------------
// Contexts — split to avoid Breadcrumbs re-rendering on setter identity change
// ---------------------------------------------------------------------------

const BreadcrumbLabelsContext = createContext<BreadcrumbLabels>(new Map());
const BreadcrumbSettersContext = createContext<BreadcrumbSetters>({
  setLabel: () => {},
  removeLabel: () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Map<string, string>>(new Map());

  // Stable setters — never change identity, so consumers don't re-render
  const settersRef = useRef<BreadcrumbSetters>({
    setLabel: (segment, label) => {
      setLabels((prev) => {
        if (prev.get(segment) === label) return prev; // no-op if unchanged
        const next = new Map(prev);
        next.set(segment, label);
        return next;
      });
    },
    removeLabel: (segment) => {
      setLabels((prev) => {
        if (!prev.has(segment)) return prev; // no-op if not present
        const next = new Map(prev);
        next.delete(segment);
        return next;
      });
    },
  });

  const stableSetters = useMemo(() => settersRef.current, []);

  return (
    <BreadcrumbSettersContext.Provider value={stableSetters}>
      <BreadcrumbLabelsContext.Provider value={labels}>
        {children}
      </BreadcrumbLabelsContext.Provider>
    </BreadcrumbSettersContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hooks
// ---------------------------------------------------------------------------

/**
 * Read the current breadcrumb labels map. Used by `Breadcrumbs` to substitute
 * display labels for raw URL segments.
 */
export function useBreadcrumbLabels(): BreadcrumbLabels {
  return useContext(BreadcrumbLabelsContext);
}

/**
 * Register a human-readable display label for a dynamic URL segment value.
 *
 * Call this in any page component that owns a dynamic route param:
 *
 *   useBreadcrumbLabel(projectId, project?.name)
 *
 * - When `label` is `undefined` (data still loading), registers "Loading..."
 * - When `label` is a string, registers that string
 * - Cleans up on unmount so stale labels don't persist after navigation
 * - No-op when `segmentValue` is empty/falsy
 */
export function useBreadcrumbLabel(segmentValue: string, label: string | undefined): void {
  const { setLabel, removeLabel } = useContext(BreadcrumbSettersContext);

  useEffect(() => {
    if (!segmentValue) return;

    setLabel(segmentValue, label ?? 'Loading...');

    return () => {
      removeLabel(segmentValue);
    };
    // Re-run when the label value changes (e.g. data loads after mount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentValue, label]);
}
