/**
 * ArrayModeSelector.tsx — FS-043 T-04 / FS-051 T-01
 *
 * Mode picker for the Array Builder. Presents guided mode cards:
 *   - Map source array
 *   - Filter + map
 *   - Split text into items
 *   - Build from values
 *   - Build from object fields
 *   - Merge branches
 *
 * FS-051 T-01: Removed "Custom expression" card and "Advanced" separator.
 * Raw DSL editing is now accessed via the Builder/Editor toggle in the header.
 *
 * Fires onSelectMode when a card is clicked or activated via keyboard.
 */

import { Calendar, ChevronDown, ChevronRight, Filter, GitMerge, Layers, List, Scissors } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

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
    mode: 'splitString',
    label: 'Split text into items',
    description: 'Split one string field into an array of values',
    icon: <Scissors size={16} aria-hidden="true" />,
  },
  {
    mode: 'buildFromValues',
    label: 'Build from values',
    description: 'Construct array entries from individual fields',
    icon: <Layers size={16} aria-hidden="true" />,
  },
  {
    mode: 'objectFields',
    label: 'Build from object fields',
    description: 'Build items from selected child properties of an object',
    icon: <Calendar size={16} aria-hidden="true" />,
  },
  {
    mode: 'mergeArrayBranches',
    label: 'Merge branches',
    description: 'Combine multiple source arrays into one',
    icon: <GitMerge size={16} aria-hidden="true" />,
  },
];

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
  const [isExpanded, setIsExpanded] = useState(selectedMode === null);
  const selectedOption = MODE_OPTIONS.find((option) => option.mode === selectedMode);

  useEffect(() => {
    if (selectedMode === null) {
      setIsExpanded(true);
    }
  }, [selectedMode]);

  if (!isExpanded && selectedOption !== undefined) {
    return (
      <div
        role="radiogroup"
        aria-label="Array builder mode"
        data-testid="array-mode-selector"
        className={['space-y-2', className].filter(Boolean).join(' ')}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            How do you want to build this array?
          </p>
          <button
            type="button"
            data-testid="array-mode-selector-toggle"
            aria-expanded={false}
            onClick={() => { setIsExpanded(true); }}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          >
            <ChevronRight size={11} aria-hidden="true" />
            Change
          </button>
        </div>

        <div
          className="rounded-lg border border-blue-500 bg-blue-950/40 px-3 py-2"
          data-testid="array-mode-selected-summary"
        >
          <p className="text-xs font-semibold text-slate-100">{selectedOption.label}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{selectedOption.description}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Array builder mode"
      data-testid="array-mode-selector"
      className={['space-y-2', className].filter(Boolean).join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          How do you want to build this array?
        </p>
        <button
          type="button"
          data-testid="array-mode-selector-toggle"
          aria-expanded={true}
          onClick={() => { setIsExpanded(false); }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        >
          <ChevronDown size={11} aria-hidden="true" />
          Collapse
        </button>
      </div>

      <div className="space-y-1.5">
        {MODE_OPTIONS.map((option) => (
          <ModeCard
            key={option.mode}
            option={option}
            isSelected={selectedMode === option.mode}
            onSelect={() => {
              onSelectMode(option.mode);
              setIsExpanded(false);
            }}
          />
        ))}
      </div>
    </div>
  );
}
