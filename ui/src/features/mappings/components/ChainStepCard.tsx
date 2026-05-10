/**
 * ChainStepCard.tsx — FS-039 T-07
 *
 * Accordion wrapper for a single chain step.
 *
 * Responsibilities:
 *   - Renders a header with summary text and a collapse/expand toggle
 *   - Renders the step body (full editor) when expanded
 *   - When collapsed, only the header is visible
 *   - Clicking a collapsed header fires onExpand
 *   - Clicking the toggle on an expanded header fires onCollapse
 *   - Incomplete steps cannot collapse (toggle is disabled)
 *   - Uses aria-expanded for accessibility
 *   - CSS transition on body visibility (height-based)
 *
 * Implements: AE-02, AE-03, AE-09, AE-12
 */

import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChainStepCardProps {
  /** Zero-based index of this step in the chain. */
  readonly index: number;
  /** Whether this step is currently expanded. */
  readonly isExpanded: boolean;
  /** Whether this step is structurally complete (can collapse). */
  readonly isComplete: boolean;
  /** Human-readable summary text shown in the collapsed header. */
  readonly summary: string;
  /** Step type label shown in the header (e.g. "Transform", "Condition"). */
  readonly stepTypeLabel: string;
  /** Icon element shown in the header. */
  readonly icon: ReactNode;
  /** Color accent class for the card border/icon (e.g. "blue", "amber"). */
  readonly accentColor: 'blue' | 'amber' | 'purple';
  /** Full step editor content rendered when expanded. */
  readonly children: ReactNode;
  /** Called when the user clicks a collapsed card to expand it. */
  readonly onExpand: () => void;
  /** Called when the user clicks the collapse toggle on an expanded card. */
  readonly onCollapse: () => void;
  /** Called when the user clicks the remove button. */
  readonly onRemove: () => void;
  /** Optional className for the root element. */
  readonly className?: string;
  /** Optional data-testid override. */
  readonly 'data-testid'?: string;
}

// ---------------------------------------------------------------------------
// Accent color maps
// ---------------------------------------------------------------------------

const ACCENT = {
  blue: {
    border: 'border-blue-800/50',
    bg: 'bg-blue-950/20',
    headerHover: 'hover:bg-blue-900/20',
    label: 'text-blue-300',
    summary: 'text-blue-400/80',
    toggle: 'text-blue-600 hover:text-blue-300 hover:bg-blue-900/40 focus-visible:ring-blue-500',
  },
  amber: {
    border: 'border-amber-800/50',
    bg: 'bg-amber-950/20',
    headerHover: 'hover:bg-amber-900/20',
    label: 'text-amber-300',
    summary: 'text-amber-400/80',
    toggle: 'text-amber-600 hover:text-amber-300 hover:bg-amber-900/40 focus-visible:ring-amber-500',
  },
  purple: {
    border: 'border-purple-800/50',
    bg: 'bg-purple-950/20',
    headerHover: 'hover:bg-purple-900/20',
    label: 'text-purple-300',
    summary: 'text-purple-400/80',
    toggle: 'text-purple-600 hover:text-purple-300 hover:bg-purple-900/40 focus-visible:ring-purple-500',
  },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ChainStepCard — accordion wrapper for a single chain step.
 *
 * When collapsed: shows header (icon + type label + summary + toggle).
 * When expanded: shows header + body (full step editor).
 *
 * Clicking a collapsed card's header fires onExpand.
 * Clicking the toggle chevron on an expanded card fires onCollapse (if complete).
 */
export function ChainStepCard({
  index,
  isExpanded,
  isComplete,
  summary,
  stepTypeLabel,
  icon,
  accentColor,
  children,
  onExpand,
  onCollapse,
  onRemove,
  className = '',
  'data-testid': testId,
}: ChainStepCardProps) {
  const accent = ACCENT[accentColor];
  const rootTestId = testId ?? `chain-step-card-${index}`;

  // Clicking the header of a collapsed card expands it.
  // Clicking the header of an expanded card does nothing (use toggle to collapse).
  function handleHeaderClick() {
    if (!isExpanded) {
      onExpand();
    }
  }

  function handleToggleClick(e: React.MouseEvent) {
    // Prevent the header click handler from also firing
    e.stopPropagation();
    if (isExpanded && isComplete) {
      onCollapse();
    } else if (!isExpanded) {
      onExpand();
    }
  }

  return (
    <div
      className={[
        'rounded-lg border',
        accent.border,
        accent.bg,
        'overflow-hidden',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={rootTestId}
    >
      {/* Header */}
      <div
        role="button"
        tabIndex={isExpanded ? -1 : 0}
        aria-expanded={isExpanded}
        aria-label={`Step ${index + 1}: ${stepTypeLabel}. ${isExpanded ? 'Expanded' : `Collapsed — ${summary}`}`}
        onClick={handleHeaderClick}
        onKeyDown={(e) => {
          if (!isExpanded && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onExpand();
          }
        }}
        className={[
          'flex items-center gap-2 px-3 py-2',
          !isExpanded ? `cursor-pointer ${accent.headerHover}` : 'cursor-default',
          'transition-colors select-none',
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid={`${rootTestId}-header`}
      >
        {/* Icon */}
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>

        {/* Type label */}
        <span className={`text-xs font-medium shrink-0 ${accent.label}`}>
          {stepTypeLabel}
        </span>

        {/* Summary (collapsed only) */}
        {!isExpanded && (
          <span
            className={`flex-1 min-w-0 truncate text-xs font-mono ${accent.summary}`}
            data-testid={`${rootTestId}-summary`}
            title={summary}
          >
            {summary}
          </span>
        )}

        {/* Spacer when expanded */}
        {isExpanded && <span className="flex-1" />}

        {/* Remove button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={`Remove step ${index + 1}`}
          className={[
            'shrink-0 rounded p-0.5 transition-colors',
            'focus-visible:outline-none focus-visible:ring-1',
            accent.toggle,
          ].join(' ')}
          data-testid={`${rootTestId}-remove`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        {/* Collapse/expand toggle */}
        <button
          type="button"
          onClick={handleToggleClick}
          aria-label={
            isExpanded
              ? isComplete
                ? `Collapse step ${index + 1}`
                : `Step ${index + 1} cannot collapse — incomplete`
              : `Expand step ${index + 1}`
          }
          disabled={isExpanded && !isComplete}
          className={[
            'shrink-0 rounded p-0.5 transition-colors',
            'focus-visible:outline-none focus-visible:ring-1',
            accent.toggle,
            isExpanded && !isComplete ? 'opacity-30 cursor-not-allowed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-testid={`${rootTestId}-toggle`}
        >
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Body (expanded only) */}
      {isExpanded && (
        <div
          className="px-3 pb-3 pt-0"
          data-testid={`${rootTestId}-body`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
