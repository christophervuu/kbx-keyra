/**
 * ArrayModeSelector.tsx — FS-043 T-04
 *
 * Mode picker for the Array Builder. Presents five mode cards:
 *   - Map source array
 *   - Filter + map
 *   - Build from values
 *   - Merge branches
 *   - Custom expression (visually separated as advanced)
 *
 * Fires onSelectMode when a card is clicked or activated via keyboard.
 */

import { Filter, GitMerge, Layers, List, TerminalSquare } from 'lucide-react';
import type { ReactNode } from 'react';

import type { ArrayBuilderMode } from '../lib/array-builder-state';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArrayModeSelectorProps {
  /** Currently selected mode, or null when no mode has been chosen yet. */
  readonly selectedMode: ArrayBuilderMode | null;
  /** Fired when the user selects a mode. */
  readonly onSelectMode: (mode: ArrayBuilderMode) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Mode definitions
// ---------------------------------------------------------------------------

interface ModeOption {
  readonly mode: ArrayBuilderMode;
  readonly label: string;
  readonly description: string;
  readonly icon: ReactNode;
  readonly isAdvanced?: boolean;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    mode: 'map',
    label: 'Map source array',
    description: 'Transform each element of a source array',
    icon: <List size={16} aria-hidden="true" />,
  },
  {
    mode: 'filterMap',
    label: 'Filter + map',
    description: 'Filter, then transform a source array',
    icon: <Filter size={16} aria-hidden="true" />,
  },
  {
    mode: 'buildFromValues',
    label: 'Build from values',
    description: 'Construct array entries from individual fields',
    icon: <Layers size={16} aria-hidden="true" />,
  },
  {
    mode: 'mergeArrayBranches',
    label: 'Merge branches',
    description: 'Combine multiple source arrays into one',
    icon: <GitMerge size={16} aria-hidden="true" />,
  },
  {
    mode: 'customExpression',
    label: 'Custom expression',
    description: 'Write raw DSL (advanced)',
    icon: <TerminalSquare size={16} aria-hidden="true" />,
    isAdvanced: true,
  },
];

const STANDARD_MODES = MODE_OPTIONS.filter((m) => !m.isAdvanced);
const ADVANCED_MODES = MODE_OPTIONS.filter((m) => m.isAdvanced);

// ---------------------------------------------------------------------------
// Sub-component: ModeCard
// ---------------------------------------------------------------------------

function ModeCard({
  option,
  isSelected,
  onSelect,
}: {
  option: ModeOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      data-testid={`mode-card-${option.mode}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={[
        'flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900',
        isSelected
          ? 'border-blue-500 bg-blue-950/40 text-slate-100'
          : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-500 hover:bg-slate-800/70 hover:text-slate-100',
      ].join(' ')}
    >
      <span
        className={[
          'mt-0.5 shrink-0',
          isSelected ? 'text-blue-400' : 'text-slate-400',
        ].join(' ')}
      >
        {option.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold leading-tight">{option.label}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">
          {option.description}
        </span>
      </span>
      {isSelected && (
        <span
          aria-hidden="true"
          className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-blue-400"
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArrayModeSelector({
  selectedMode,
  onSelectMode,
  className = '',
}: ArrayModeSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Array builder mode"
      data-testid="array-mode-selector"
      className={['space-y-2', className].filter(Boolean).join(' ')}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        How do you want to build this array?
      </p>

      {/* Standard modes */}
      <div className="space-y-1.5">
        {STANDARD_MODES.map((option) => (
          <ModeCard
            key={option.mode}
            option={option}
            isSelected={selectedMode === option.mode}
            onSelect={() => { onSelectMode(option.mode); }}
          />
        ))}
      </div>

      {/* Advanced separator */}
      <div className="flex items-center gap-2 pt-1">
        <div className="h-px flex-1 bg-slate-700" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Advanced
        </span>
        <div className="h-px flex-1 bg-slate-700" />
      </div>

      {/* Advanced modes */}
      <div className="space-y-1.5">
        {ADVANCED_MODES.map((option) => (
          <ModeCard
            key={option.mode}
            option={option}
            isSelected={selectedMode === option.mode}
            onSelect={() => { onSelectMode(option.mode); }}
          />
        ))}
      </div>
    </div>
  );
}
