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

import { Plus } from 'lucide-react';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useDropZone } from '../hooks/use-drop-zone';
import type { SchemaPathEntry } from '../lib/autocomplete-utils';
import { resolveFieldTestValue } from '../lib/source-field-display';
import { PreviewContext } from '../context/preview-context';
import { SourceFieldOptionRow } from './SourceFieldOptionRow';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChainSourceCardProps {
  /** Currently selected source field path. Undefined when no source is selected. */
  readonly sourcePath: string | undefined;
  /** Available source field options for typed dropdown selection. */
  readonly sourceOptions?: readonly SchemaPathEntry[];
  /** Number of logic steps currently in the chain (for display). */
  readonly logicStepCount: number;
  /** Fires when a source field is selected (click or drop). */
  readonly onSourceSelect: (path: string) => void;
  /** Fires when the user clicks "+ Add logic". */
  readonly onAddLogic: () => void;
  /** Controls whether the inline "+ Add logic" button is shown. */
  readonly showAddLogicButton?: boolean;
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
  showAddLogicButton = true,
  className,
}: ChainSourceCardProps) {
  const { isDragOver, dropHandlers } = useDropZone({ onDrop: onSourceSelect });
  const sourceInputId = 'chain-source-card-input';
  const [sourceInputValue, setSourceInputValue] = useState('');
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Consume PreviewContext for test data — gracefully handles null (outside PreviewProvider)
  const previewCtx = useContext(PreviewContext);
  const sourceData = previewCtx?.sourceData ?? null;

  const hasSource = typeof sourcePath === 'string' && sourcePath.trim().length > 0;
  const normalizedQuery = sourceInputValue.trim().toLowerCase();

  const filteredSourceOptions = useMemo(
    () => sourceOptions.filter((entry) => entry.path.toLowerCase().includes(normalizedQuery)),
    [sourceOptions, normalizedQuery],
  );

  const maxVisibleOptions = 60;
  const visibleSourceOptions = filteredSourceOptions.slice(0, maxVisibleOptions);

  useEffect(() => {
    setSourceInputValue(sourcePath ?? '');
  }, [sourcePath]);

  useEffect(() => {
    if (!showSourceMenu) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const inputEl = inputRef.current;
      if (!inputEl) return;
      const rect = inputEl.getBoundingClientRect();
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
      if (!containerRef.current) return;
      if (containerRef.current.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      if (!containerRef.current.contains(target)) {
        setShowSourceMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showSourceMenu]);

  function handleSelect(path: string) {
    onSourceSelect(path);
    setSourceInputValue(path);
    setShowSourceMenu(false);
  }

  return (
    <div
      ref={containerRef}
      className={['flex flex-col space-y-2', className ?? ''].filter(Boolean).join(' ')}
      data-testid="chain-source-card"
      {...dropHandlers}
    >
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400" data-testid="chain-source-card-guidance">
        Source field
      </p>

      <div className="relative">
        <label htmlFor={sourceInputId} className="sr-only">
          Search source field
        </label>
        <input
          ref={inputRef}
          id={sourceInputId}
          type="text"
          placeholder="Search source field"
          autoComplete="off"
          className={[
            'w-full rounded border px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
            isDragOver
              ? 'border-blue-500 bg-blue-950/20'
              : 'border-slate-700 bg-slate-900',
          ].join(' ')}
          data-testid="chain-source-card-input"
          value={sourceInputValue}
          onFocus={() => { setShowSourceMenu(true); }}
          onBlur={() => {
            requestAnimationFrame(() => {
              const active = document.activeElement as Node | null;
              if (menuRef.current && active && menuRef.current.contains(active)) return;
              if (!containerRef.current) return;
              if (!containerRef.current.contains(document.activeElement)) {
                setShowSourceMenu(false);
              }
            });
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            const value = event.currentTarget.value.trim();
            if (!value) return;
            const exactMatch = sourceOptions.find((option) => option.path === value);
            handleSelect(exactMatch?.path ?? value);
          }}
          onChange={(event) => {
            setSourceInputValue(event.currentTarget.value);
            setShowSourceMenu(true);
          }}
        />

        {showSourceMenu && menuPosition !== null && createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label="Source field options"
            data-testid="chain-source-card-dropdown"
            className="fixed z-[1000] max-h-48 overflow-y-auto rounded border border-slate-700 bg-slate-900/95 p-1 shadow-lg"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              width: `${menuPosition.width}px`,
            }}
          >
            {visibleSourceOptions.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-slate-500" data-testid="chain-source-card-no-options">
                {sourceOptions.length === 0 ? 'No source fields available.' : 'No matching fields.'}
              </p>
            ) : (
              visibleSourceOptions.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  role="option"
                  aria-selected={entry.path === sourcePath}
                  className={[
                    'block w-full rounded px-2 py-1.5 text-left transition-colors',
                    entry.path === sourcePath
                      ? 'bg-blue-950/50 ring-1 ring-inset ring-blue-700/60'
                      : 'hover:bg-slate-800',
                  ].join(' ')}
                  data-testid={`chain-source-card-option-${entry.path}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => { handleSelect(entry.path); }}
                >
                  <SourceFieldOptionRow
                    path={entry.path}
                    type={entry.type}
                    testValue={resolveFieldTestValue(sourceData, entry.path)}
                  />
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
      </div>

      {hasSource && showAddLogicButton && (
        <div className="flex items-center justify-end">
          {showAddLogicButton && (
            <button
              type="button"
              onClick={onAddLogic}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-400 transition-colors hover:bg-slate-700 hover:text-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Add logic step"
              data-testid="chain-source-card-add-logic"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Add logic
            </button>
          )}
        </div>
      )}
    </div>
  );
}

