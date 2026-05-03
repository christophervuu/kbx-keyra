/**
 * BreadcrumbNav — compact breadcrumb trail for the Target Worklist drill-down mode.
 *
 * Renders a clickable path like: Root > address > billing > city
 * Each segment is a button that navigates to that subtree level.
 * Clicking "Root" restores the full tree (sets path to null).
 *
 * Truncates to the last MAX_VISIBLE_SEGMENTS segments when the path is deep,
 * showing "…" as a non-interactive prefix.
 */

import { ChevronRight, Home } from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_VISIBLE_SEGMENTS = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BreadcrumbNavProps {
  /**
   * The current subtree path, e.g. "address.billing".
   * null means the full tree is shown (breadcrumb renders only Root).
   */
  currentPath: string | null;
  /** Fired when a breadcrumb segment is clicked. null = navigate to root. */
  onNavigate: (path: string | null) => void;
  /** Optional className for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Splits a dot-path into breadcrumb segments with their cumulative paths.
 * e.g. "address.billing.city" → [
 *   { label: 'address', path: 'address' },
 *   { label: 'billing', path: 'address.billing' },
 *   { label: 'city',    path: 'address.billing.city' },
 * ]
 */
function buildSegments(path: string): { label: string; path: string }[] {
  const parts = path.split('.');
  return parts.map((part, i) => ({
    label: part,
    path: parts.slice(0, i + 1).join('.'),
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * BreadcrumbNav — renders the drill-down navigation trail above the worklist.
 */
export function BreadcrumbNav({ currentPath, onNavigate, className = '' }: BreadcrumbNavProps) {
  const allSegments = currentPath ? buildSegments(currentPath) : [];

  // Truncate if too many segments
  const truncated = allSegments.length > MAX_VISIBLE_SEGMENTS;
  const visibleSegments = truncated
    ? allSegments.slice(allSegments.length - MAX_VISIBLE_SEGMENTS)
    : allSegments;

  return (
    <nav
      aria-label="Target field breadcrumb"
      data-testid="breadcrumb-nav"
      className={`flex items-center gap-0.5 overflow-x-auto px-3 py-1.5 text-xs ${className}`}
    >
      {/* Root / Home */}
      <button
        type="button"
        data-testid="breadcrumb-root"
        onClick={() => onNavigate(null)}
        aria-current={currentPath === null ? 'page' : undefined}
        className={[
          'flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
          currentPath === null
            ? 'text-slate-200'
            : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200',
        ].join(' ')}
      >
        <Home size={11} aria-hidden="true" />
        Root
      </button>

      {/* Truncation indicator */}
      {truncated && (
        <>
          <ChevronRight size={11} className="shrink-0 text-slate-600" aria-hidden="true" />
          <span className="shrink-0 px-1 text-slate-600" aria-hidden="true">
            …
          </span>
        </>
      )}

      {/* Path segments */}
      {visibleSegments.map((seg, i) => {
        const isLast = i === visibleSegments.length - 1;
        return (
          <span key={seg.path} className="flex shrink-0 items-center gap-0.5">
            <ChevronRight size={11} className="shrink-0 text-slate-600" aria-hidden="true" />
            <button
              type="button"
              data-testid={`breadcrumb-segment-${seg.path}`}
              onClick={() => onNavigate(seg.path)}
              aria-current={isLast ? 'page' : undefined}
              className={[
                'rounded px-1.5 py-0.5 font-mono transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                isLast
                  ? 'text-slate-100'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200',
              ].join(' ')}
            >
              {seg.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
