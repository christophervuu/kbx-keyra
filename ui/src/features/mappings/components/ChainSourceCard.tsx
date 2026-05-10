/**
 * ChainSourceCard — FS-038 T-05
 *
 * Redesigned Source Card for the chain-based Builder panel.
 *
 * States:
 *   - Empty: no source selected — shows drop zone + guidance text
 *   - Source selected, no logic: shows source chip + "Direct copy" + "+ Add logic"
 *   - Source selected, with logic: shows source chip + step count + "+ Add logic"
 *
 * Supports:
 *   - Click-to-stage: parent passes `onSourceSelect(path)` callback
 *   - Drag-and-drop: accepts dragged source field paths via useDropZone
 *
 * This is a NEW component (Q2 resolved at Rev 2). The existing SourceCard.tsx
 * is NOT modified — it remains for backward compatibility during migration.
 */

import { Database, Plus } from 'lucide-react';
import { useDropZone } from '../hooks/use-drop-zone';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChainSourceCardProps {
  /** Currently selected source field path. Undefined when no source is selected. */
  readonly sourcePath: string | undefined;
  /** Number of logic steps currently in the chain (for display). */
  readonly logicStepCount: number;
  /** Fires when a source field is selected (click or drop). */
  readonly onSourceSelect: (path: string) => void;
  /** Fires when the user clicks "+ Add logic". */
  readonly onAddLogic: () => void;
  /** Optional className for the root element. */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ChainSourceCard — shows the selected source field and entry-point actions.
 *
 * When no source is selected, renders a drop zone with guidance text.
 * When a source is selected, renders the source chip, a status label,
 * and the "+ Add logic" button.
 */
export function ChainSourceCard({
  sourcePath,
  logicStepCount,
  onSourceSelect,
  onAddLogic,
  className,
}: ChainSourceCardProps) {
  const { isDragOver, dropHandlers } = useDropZone({ onDrop: onSourceSelect });

  const hasSource = typeof sourcePath === 'string' && sourcePath.trim().length > 0;

  return (
    <div
      className={['flex flex-col gap-2', className ?? ''].filter(Boolean).join(' ')}
      data-testid="chain-source-card"
    >
      {hasSource ? (
        /* ── Source selected state ─────────────────────────────────────── */
        <div
          className="flex flex-col gap-2 rounded-lg border border-zinc-700 bg-zinc-800 p-3"
          data-testid="chain-source-card-selected"
        >
          {/* Source chip row */}
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" aria-hidden="true" />
            <span
              className="flex-1 truncate font-mono text-xs text-zinc-200"
              title={sourcePath}
              data-testid="chain-source-card-path"
            >
              {sourcePath}
            </span>
          </div>

          {/* Status label */}
          <div className="flex items-center justify-between">
            <span
              className="text-xs text-zinc-500"
              data-testid="chain-source-card-status"
            >
              {logicStepCount === 0
                ? 'Direct copy'
                : `${logicStepCount} logic step${logicStepCount === 1 ? '' : 's'}`}
            </span>

            {/* + Add logic button */}
            <button
              type="button"
              onClick={onAddLogic}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-zinc-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Add logic step"
              data-testid="chain-source-card-add-logic"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Add logic
            </button>
          </div>
        </div>
      ) : (
        /* ── Empty state — drop zone ───────────────────────────────────── */
        <div
          {...dropHandlers}
          className={[
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
            isDragOver
              ? 'border-blue-500 bg-blue-950/30'
              : 'border-zinc-700 bg-zinc-800/50',
          ].join(' ')}
          data-testid="chain-source-card-empty"
          aria-label="Drop zone — drag a source field here or select one from the panel"
        >
          <Database
            className={['h-5 w-5', isDragOver ? 'text-blue-400' : 'text-zinc-600'].join(' ')}
            aria-hidden="true"
          />
          <p className="text-xs text-zinc-500" data-testid="chain-source-card-guidance">
            Select a source field from the panel or drag one here
          </p>
        </div>
      )}
    </div>
  );
}
