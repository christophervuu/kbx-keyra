import { ChevronDown, ChevronRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResultPanelBadge {
  count: number;
  variant: 'info' | 'warning' | 'error';
}

export interface ResultPanelProps {
  title: string;
  badge?: ResultPanelBadge;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** When false, the collapse toggle is hidden and the panel is always expanded. Default: true */
  collapsible?: boolean;
  /** Rendered in place of children when isEmpty is true and the panel is expanded */
  emptyState?: React.ReactNode;
  /** When true and expanded, renders emptyState instead of children */
  isEmpty?: boolean;
  children: React.ReactNode;
  className?: string;
  testId?: string;
  style?: React.CSSProperties;
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

function badgeClasses(variant: ResultPanelBadge['variant']): string {
  switch (variant) {
    case 'info':
      return 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30';
    case 'warning':
      return 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30';
    case 'error':
      return 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ResultPanel — reusable wrapper for Test Lab result panels.
 *
 * Provides a consistent header bar (title + optional badge + collapse toggle)
 * and a content area that hides but keeps children mounted when collapsed.
 * This preserves internal state (e.g. scroll position, DiffDisplay expected
 * output) across collapse/expand cycles.
 */
export function ResultPanel({
  title,
  badge,
  collapsed,
  onToggleCollapse,
  collapsible = true,
  emptyState,
  isEmpty = false,
  children,
  className = '',
  testId,
  style,
}: ResultPanelProps) {
  const CollapseIcon = collapsed ? ChevronRight : ChevronDown;

  return (
    <div
      className={`flex flex-col overflow-hidden bg-slate-950 ${className}`}
      data-testid={testId}
      style={style}
    >
      {/* Header bar — always visible */}
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-1.5">
        <span className="flex-1 text-xs font-semibold text-slate-300">{title}</span>

        {badge !== undefined && badge.count > 0 && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${badgeClasses(badge.variant)}`}
            aria-label={`${badge.count} ${badge.variant}${badge.count === 1 ? '' : 's'}`}
            data-testid={testId ? `${testId}-badge` : undefined}
          >
            {badge.count}
          </span>
        )}

        {collapsible && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${title} panel` : `Collapse ${title} panel`}
            className="flex items-center justify-center rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            data-testid={testId ? `${testId}-toggle` : undefined}
          >
            <CollapseIcon size={13} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Content area — hidden when collapsed, children always mounted */}
      <div
        className={`min-h-0 flex-1 overflow-auto ${collapsed ? 'hidden' : ''}`}
        role="region"
        aria-label={`${title} panel content`}
        data-testid={testId ? `${testId}-content` : undefined}
      >
        {isEmpty ? emptyState : children}
      </div>
    </div>
  );
}
