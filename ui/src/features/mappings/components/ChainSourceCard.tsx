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
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDropZone } from '../hooks/use-drop-zone';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChainSourceCardProps {
  /** Currently selected source field path. Undefined when no source is selected. */
  readonly sourcePath: string | undefined;
  /** Available source field options for typed dropdown selection. */
  readonly sourceOptions?: readonly string[];
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
  sourceOptions = [],
  logicStepCount,
  onSourceSelect,
  onAddLogic,
  className,
}: ChainSourceCardProps) {
  const { isDragOver, dropHandlers } = useDropZone({ onDrop: onSourceSelect });
  const sourceInputId = 'chain-source-card-input';
  const [sourceInputValue, setSourceInputValue] = useState('');
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const hasSource = typeof sourcePath === 'string' && sourcePath.trim().length > 0;
  const normalizedQuery = sourceInputValue.trim().toLowerCase();

  const filteredSourceOptions = useMemo(
    () => sourceOptions.filter((path) => path.toLowerCase().includes(normalizedQuery)),
    [sourceOptions, normalizedQuery],
  );

  const maxVisibleOptions = 60;
  const visibleSourceOptions = filteredSourceOptions.slice(0, maxVisibleOptions);

  useEffect(() => {
    if (!showSourceMenu) return;

    const updatePosition = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showSourceMenu]);

  useEffect(() => {
    if (!showSourceMenu) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (inputRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setShowSourceMenu(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showSourceMenu]);

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

          <div className="relative mt-1 w-full max-w-md text-left">
            <label htmlFor={sourceInputId} className="sr-only">
              Source field
            </label>
            <input
              ref={inputRef}
              id={sourceInputId}
              type="text"
              placeholder="Type or select source field"
              autoComplete="off"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="chain-source-card-input"
              value={sourceInputValue}
              onFocus={() => { setShowSourceMenu(true); }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                const value = event.currentTarget.value.trim();
                if (!value) return;
                onSourceSelect(value);
                setShowSourceMenu(false);
              }}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setSourceInputValue(value);
                setShowSourceMenu(true);
              }}
            />

            {showSourceMenu
              && visibleSourceOptions.length > 0
              && menuPosition !== null
              && createPortal(
                <div
                  ref={menuRef}
                  className="fixed z-[1000] max-h-48 overflow-y-auto rounded border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
                  data-testid="chain-source-card-dropdown"
                  role="listbox"
                  aria-label="Source field options"
                  style={{
                    top: `${menuPosition.top}px`,
                    left: `${menuPosition.left}px`,
                    width: `${menuPosition.width}px`,
                  }}
                >
                  {visibleSourceOptions.map((path) => (
                    <button
                      key={path}
                      type="button"
                      role="option"
                      className="block w-full truncate px-2 py-1.5 text-left font-mono text-xs text-zinc-200 transition-colors hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none"
                      data-testid={`chain-source-card-option-${path}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        setSourceInputValue(path);
                        onSourceSelect(path);
                        setShowSourceMenu(false);
                      }}
                    >
                      {path}
                    </button>
                  ))}
                </div>,
                document.body,
              )}
          </div>
        </div>
      )}
    </div>
  );
}
