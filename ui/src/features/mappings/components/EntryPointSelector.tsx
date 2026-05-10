/**
 * EntryPointSelector — FS-038 T-05
 *
 * Segmented control for selecting the chain builder entry point.
 * Three options: Source (default), Static, External (disabled placeholder).
 *
 * Switching entry type when logic steps exist shows a confirmation dialog (AE-13).
 * External is disabled with a tooltip (AE-19).
 */

import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import type { BuilderEntryType } from '../lib/chain-builder-state';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntryPointSelectorProps {
  /** Currently selected entry type. */
  readonly value: BuilderEntryType;
  /** Whether the current state has logic steps (triggers confirmation on switch). */
  readonly hasLogicSteps: boolean;
  /** Fires when the user confirms an entry type change. */
  readonly onEntryTypeChange: (type: BuilderEntryType) => void;
}

// ---------------------------------------------------------------------------
// Option config
// ---------------------------------------------------------------------------

interface EntryOption {
  type: BuilderEntryType;
  label: string;
  disabled: boolean;
  tooltip?: string;
}

const ENTRY_OPTIONS: EntryOption[] = [
  { type: 'source', label: 'Source', disabled: false },
  { type: 'static', label: 'Static', disabled: false },
  {
    type: 'external',
    label: 'External',
    disabled: true,
    tooltip: 'External data sources — available in a future release',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Segmented control for selecting the chain builder entry point.
 *
 * - Source: default, most prominent
 * - Static: literal value
 * - External: disabled placeholder (AE-19)
 *
 * When switching entry type with existing logic steps, shows a confirmation
 * dialog warning that logic steps will be cleared (AE-13).
 */
export function EntryPointSelector({
  value,
  hasLogicSteps,
  onEntryTypeChange,
}: EntryPointSelectorProps) {
  const [pendingType, setPendingType] = useState<BuilderEntryType | null>(null);

  function handleOptionClick(type: BuilderEntryType) {
    if (type === value) return; // already selected
    if (hasLogicSteps) {
      // Show confirmation before switching
      setPendingType(type);
    } else {
      onEntryTypeChange(type);
    }
  }

  function handleConfirm() {
    if (pendingType !== null) {
      onEntryTypeChange(pendingType);
    }
    setPendingType(null);
  }

  function handleCancel() {
    setPendingType(null);
  }

  return (
    <>
      <div
        className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 p-0.5"
        role="group"
        aria-label="Entry point selector"
        data-testid="entry-point-selector"
      >
        {ENTRY_OPTIONS.map((option) => {
          const isSelected = option.type === value;
          return (
            <button
              key={option.type}
              type="button"
              disabled={option.disabled}
              onClick={() => !option.disabled && handleOptionClick(option.type)}
              title={option.tooltip}
              aria-pressed={isSelected}
              aria-label={option.tooltip ? `${option.label} — ${option.tooltip}` : option.label}
              className={[
                'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                isSelected
                  ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                  : option.disabled
                    ? 'text-zinc-600 cursor-not-allowed'
                    : 'text-zinc-400 hover:text-zinc-200',
              ].join(' ')}
              data-testid={`entry-option-${option.type}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <ConfirmDialog
        open={pendingType !== null}
        title="Switch entry type?"
        message="Switching entry type will clear your current logic steps. This cannot be undone."
        confirmLabel="Switch"
        cancelLabel="Keep current"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
