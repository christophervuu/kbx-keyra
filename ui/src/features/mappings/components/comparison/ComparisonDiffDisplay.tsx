import {
  ArrowRightLeft,
  Braces,
  CheckCircle2,
  CircleSlash,
  Info,
  Layers,
  MinusCircle,
  PlusCircle,
} from 'lucide-react';
import type React from 'react';


import type { ComparisonState } from '@/lib/types';
import type { DiffEntry } from '@/lib/types/diff';
import { computeDiff } from '@/lib/utils/json-diff';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComparisonDiffDisplayProps {
  leftOutput: Record<string, unknown> | null;
  rightOutput: Record<string, unknown> | null;
  leftLabel: string;
  rightLabel: string;
  overallStatus: ComparisonState['overallStatus'];
}

// ---------------------------------------------------------------------------
// Category metadata (mirrors DiffDisplay color conventions)
// ---------------------------------------------------------------------------

type CategoryMeta = {
  label: string;
  rowClass: string;
  textClass: string;
  Icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
};

const CATEGORY_META: Record<DiffEntry['type'], CategoryMeta> = {
  missing_field: {
    label: 'Missing Field',
    rowClass: 'bg-red-900/30 border-l-2 border-red-500',
    textClass: 'text-red-400',
    Icon: MinusCircle,
  },
  extra_field: {
    label: 'Extra Field',
    rowClass: 'bg-amber-900/30 border-l-2 border-amber-500',
    textClass: 'text-amber-400',
    Icon: PlusCircle,
  },
  value_mismatch: {
    label: 'Value Mismatch',
    rowClass: 'bg-amber-900/30 border-l-2 border-amber-500',
    textClass: 'text-amber-400',
    Icon: ArrowRightLeft,
  },
  type_mismatch: {
    label: 'Type Mismatch',
    rowClass: 'bg-red-900/30 border-l-2 border-red-500',
    textClass: 'text-red-400',
    Icon: Braces,
  },
  null_mismatch: {
    label: 'Null Mismatch',
    rowClass: 'bg-amber-900/30 border-l-2 border-amber-500',
    textClass: 'text-amber-400',
    Icon: CircleSlash,
  },
  structural_mismatch: {
    label: 'Structural Mismatch',
    rowClass: 'bg-red-900/30 border-l-2 border-red-500',
    textClass: 'text-red-400',
    Icon: Layers,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_VALUE_LEN = 60;

function formatValue(value: unknown): string {
  const raw = JSON.stringify(value);
  if (raw === undefined) return 'undefined';
  return raw.length > MAX_VALUE_LEN ? raw.slice(0, MAX_VALUE_LEN) + '…' : raw;
}

// ---------------------------------------------------------------------------
// DiffEntryRow
// ---------------------------------------------------------------------------

interface DiffEntryRowProps {
  entry: DiffEntry;
  index: number;
  leftLabel: string;
  rightLabel: string;
}

function DiffEntryRow({ entry, index, leftLabel, rightLabel }: DiffEntryRowProps) {
  const meta = CATEGORY_META[entry.type];
  const { Icon } = meta;

  // Build comparison-context description
  function renderValues() {
    switch (entry.type) {
      case 'missing_field':
        // present in left, absent in right
        return (
          <p className="text-zinc-400">
            <span className="text-zinc-600">present in </span>
            <span className="font-mono text-zinc-300">{leftLabel}</span>
            <span className="text-zinc-600">, absent in </span>
            <span className="font-mono text-zinc-300">{rightLabel}</span>
            {entry.actual !== undefined && (
              <>
                <span className="text-zinc-600"> — value: </span>
                <span className="font-mono text-zinc-300">{formatValue(entry.actual)}</span>
              </>
            )}
          </p>
        );
      case 'extra_field':
        // present in right, absent in left
        return (
          <p className="text-zinc-400">
            <span className="text-zinc-600">present in </span>
            <span className="font-mono text-zinc-300">{rightLabel}</span>
            <span className="text-zinc-600">, absent in </span>
            <span className="font-mono text-zinc-300">{leftLabel}</span>
            {entry.expected !== undefined && (
              <>
                <span className="text-zinc-600"> — value: </span>
                <span className="font-mono text-zinc-300">{formatValue(entry.expected)}</span>
              </>
            )}
          </p>
        );
      default:
        return (
          <div className="flex flex-col gap-0.5">
            <p className="text-zinc-400">
              <span className="text-zinc-600">{leftLabel}: </span>
              <span className="font-mono text-zinc-300">{formatValue(entry.actual)}</span>
            </p>
            <p className="text-zinc-400">
              <span className="text-zinc-600">{rightLabel}: </span>
              <span className="font-mono text-zinc-300">{formatValue(entry.expected)}</span>
            </p>
          </div>
        );
    }
  }

  return (
    <li
      className={`px-3 py-2.5 text-xs ${meta.rowClass}`}
      data-testid="comparison-diff-entry"
      data-entry-index={index}
      data-entry-type={entry.type}
    >
      {/* Category badge */}
      <div className={`mb-1 flex items-center gap-1 font-semibold ${meta.textClass}`}>
        <Icon size={12} aria-hidden={true} />
        <span>{meta.label}</span>
      </div>

      {/* Path */}
      <p className="mb-1 truncate font-mono text-zinc-300" title={entry.path}>
        {entry.path}
      </p>

      {/* Type annotation for structural mismatches */}
      {(entry.type === 'type_mismatch' ||
        entry.type === 'null_mismatch' ||
        entry.type === 'structural_mismatch') &&
        entry.actualType !== undefined &&
        entry.expectedType !== undefined && (
          <p className="mb-1 text-zinc-500">
            <span className="text-zinc-400">{entry.actualType}</span>
            {' → '}
            <span className="text-zinc-400">{entry.expectedType}</span>
          </p>
        )}

      {/* Values */}
      {renderValues()}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Read-only diff display for the Compare tab.
 *
 * Computes and renders the structural diff between left and right comparison
 * outputs. Uses the same color conventions as `DiffDisplay` but is purely
 * read-only — no editable expected-output textarea.
 *
 * States:
 * - idle / executing: renders nothing
 * - one side null: "Cannot compute diff" info box
 * - outputs match: green "Outputs match" indicator
 * - outputs differ: summary count + scrollable diff entry list
 *
 * AE-05, AE-06, AE-07 (FS-037 T-07)
 */
export function ComparisonDiffDisplay({
  leftOutput,
  rightOutput,
  leftLabel,
  rightLabel,
  overallStatus,
}: ComparisonDiffDisplayProps) {
  // Idle / executing — render nothing
  if (overallStatus === 'idle' || overallStatus === 'executing') {
    return null;
  }

  // One or both sides have no output — cannot compute diff
  if (leftOutput === null || rightOutput === null) {
    return (
      <div
        className="flex items-start gap-2 rounded border border-slate-700 bg-slate-800/60 p-3"
        data-testid="comparison-diff-display"
        role="status"
      >
        <Info size={14} className="mt-0.5 shrink-0 text-slate-500" aria-hidden={true} />
        <p className="text-xs text-slate-400">
          Cannot compute diff — one side has no output
        </p>
      </div>
    );
  }

  const diffResult = computeDiff(leftOutput, rightOutput);

  return (
    <div
      className="flex flex-col overflow-hidden"
      data-testid="comparison-diff-display"
    >
      {diffResult.isEqual ? (
        /* Match state */
        <div
          className="flex items-center gap-2 rounded border border-green-800/50 bg-green-900/20 p-3"
          data-testid="comparison-diff-match"
          role="status"
        >
          <CheckCircle2 size={14} className="shrink-0 text-green-400" aria-hidden={true} />
          <p className="text-xs text-green-300">Outputs match</p>
        </div>
      ) : (
        /* Diff state */
        <>
          {/* Summary header */}
          <div
            className="shrink-0 border-b border-zinc-700 bg-zinc-900 px-3 py-2"
            data-testid="comparison-diff-count"
            aria-live="polite"
          >
            <p className="text-xs text-zinc-400">
              <span className="font-semibold text-zinc-200">
                {diffResult.entries.length}{' '}
                {diffResult.entries.length === 1 ? 'difference' : 'differences'} found
              </span>
            </p>
          </div>

          {/* Entry list */}
          <ul
            role="list"
            aria-label={`${diffResult.entries.length} difference${diffResult.entries.length === 1 ? '' : 's'} between ${leftLabel} and ${rightLabel}`}
            className="overflow-auto"
          >
            {diffResult.entries.map((entry, i) => (
              <DiffEntryRow
                key={i}
                entry={entry}
                index={i}
                leftLabel={leftLabel}
                rightLabel={rightLabel}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
