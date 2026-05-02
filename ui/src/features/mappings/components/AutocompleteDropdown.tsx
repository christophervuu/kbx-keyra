/**
 * AutocompleteDropdown — portal-rendered suggestion list for the raw DSL editor.
 *
 * Rendered via `createPortal` to `document.body` to avoid overflow clipping from
 * the editor container. Positioned absolutely using viewport coordinates supplied
 * by the parent (RawDslEditor).
 *
 * Displays up to MAX_VISIBLE_ITEMS with scroll for overflow.
 * Each item shows:
 * - Kind icon: `ƒ` (function), `□` (field), `C` (constant), `⊕` (external), `·` (keyword)
 * - Label
 * - Detail text (type for fields, category + arg count for functions)
 * Selected item is visually highlighted.
 */

import { createPortal } from 'react-dom';

import type { AutocompleteItem } from '@/lib/data/dsl-functions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_VISIBLE_ITEMS = 8;
const ITEM_HEIGHT_PX = 32;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutocompleteDropdownProps {
  readonly suggestions: AutocompleteItem[];
  readonly selectedIndex: number;
  readonly onSelect: (item: AutocompleteItem, index: number) => void;
  readonly onClose: () => void;
  /** Viewport-relative position for the top-left corner of the dropdown */
  readonly position: { readonly top: number; readonly left: number };
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Kind icon helper
// ---------------------------------------------------------------------------

function kindIcon(kind: AutocompleteItem['kind']): string {
  switch (kind) {
    case 'function': return 'ƒ';
    case 'field':    return '□';
    case 'constant': return 'C';
    case 'external': return '⊕';
    case 'keyword':  return '·';
  }
}

function kindIconClass(kind: AutocompleteItem['kind']): string {
  switch (kind) {
    case 'function': return 'text-blue-400';
    case 'field':    return 'text-green-400';
    case 'constant': return 'text-orange-400';
    case 'external': return 'text-purple-400';
    case 'keyword':  return 'text-slate-400';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Portal-rendered autocomplete dropdown. Mounts directly into `document.body`
 * so it is never clipped by an ancestor `overflow: hidden` container.
 */
export function AutocompleteDropdown({
  suggestions,
  selectedIndex,
  onSelect,
  onClose,
  position,
  className,
}: AutocompleteDropdownProps) {
  if (suggestions.length === 0) return null;

  const visibleCount = Math.min(suggestions.length, MAX_VISIBLE_ITEMS);
  const dropdownHeight = visibleCount * ITEM_HEIGHT_PX;

  const dropdown = (
    <div
      role="listbox"
      aria-label="Autocomplete suggestions"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 9999,
        maxHeight: `${MAX_VISIBLE_ITEMS * ITEM_HEIGHT_PX}px`,
        height: `${dropdownHeight}px`,
        overflowY: suggestions.length > MAX_VISIBLE_ITEMS ? 'auto' : 'hidden',
        minWidth: '240px',
        maxWidth: '480px',
      }}
      className={[
        'bg-zinc-800 border border-zinc-600 rounded-md shadow-xl',
        'font-mono text-sm',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      // Prevent blur from firing on the textarea when clicking the dropdown
      onMouseDown={(e) => e.preventDefault()}
    >
      {suggestions.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <div
            key={`${item.kind}-${item.label}`}
            role="option"
            aria-selected={isSelected}
            style={{ height: `${ITEM_HEIGHT_PX}px` }}
            className={[
              'flex items-center gap-2 px-3 cursor-pointer select-none',
              isSelected
                ? 'bg-blue-600 text-white'
                : 'text-slate-200 hover:bg-zinc-700',
            ].join(' ')}
            onClick={() => onSelect(item, index)}
          >
            {/* Kind icon */}
            <span
              aria-hidden="true"
              className={[
                'shrink-0 w-4 text-center font-bold',
                isSelected ? 'text-white' : kindIconClass(item.kind),
              ].join(' ')}
            >
              {kindIcon(item.kind)}
            </span>

            {/* Label */}
            <span className="flex-1 truncate">{item.label}</span>

            {/* Detail */}
            <span
              className={[
                'shrink-0 text-xs truncate max-w-[140px]',
                isSelected ? 'text-blue-200' : 'text-slate-500',
              ].join(' ')}
            >
              {item.detail}
            </span>
          </div>
        );
      })}
    </div>
  );

  // Render a backdrop to capture outside clicks → close
  const backdrop = (
    <div
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
      onClick={onClose}
    />
  );

  return createPortal(
    <>
      {backdrop}
      {dropdown}
    </>,
    document.body,
  );
}
