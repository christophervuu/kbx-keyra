import { ChevronDown, ChevronRight } from 'lucide-react';

import { MappingStatusIcon } from './MappingStatusIcon';
import { SchemaTreeNodeIcon } from './SchemaTreeNodeIcon';

import type { MappingNodeStatus, SchemaTreeNode } from '@/lib/types';

interface SchemaTreeNodeRowProps {
  node: SchemaTreeNode;
  isExpanded: boolean;
  onToggle: (path: string) => void;
  /** When set, highlights matching substring in field name */
  highlightQuery?: string;
  /** Whether this row is selected */
  isSelected?: boolean;
  /** Whether this row has keyboard focus */
  isFocused?: boolean;
  /** Callback when row is clicked (selection) */
  onSelect?: (node: SchemaTreeNode) => void;
  /** Mapping status for this node (only shown in target variant) */
  mappingStatus?: MappingNodeStatus;
  /** Unique DOM ID for aria-activedescendant */
  id?: string;
  /** Position among siblings (1-indexed) */
  posInSet?: number;
  /** Total number of siblings at this level */
  setSize?: number;
}

export function SchemaTreeNodeRow({
  node,
  isExpanded,
  onToggle,
  highlightQuery,
  isSelected = false,
  isFocused = false,
  onSelect,
  mappingStatus,
  id,
  posInSet,
  setSize,
}: SchemaTreeNodeRowProps) {
  const isExpandable = node.childCount > 0;

  const handleRowClick = () => {
    onSelect?.(node);
  };

  const selectedClass = isSelected ? 'bg-blue-950/60 ring-1 ring-blue-500/30' : '';
  const focusedClass = isFocused ? 'ring-2 ring-blue-400 ring-inset' : '';

  return (
    <div
      id={id}
      role="treeitem"
      aria-expanded={isExpandable ? isExpanded : undefined}
      aria-level={node.depth + 1}
      aria-selected={isSelected}
      aria-posinset={posInSet}
      aria-setsize={setSize}
      className={`group flex items-center h-8 px-2 hover:bg-slate-800/50 cursor-default select-none ${selectedClass} ${focusedClass}`}
      onClick={handleRowClick}
    >
      {/* Tree line guides */}
      <TreeGuides depth={node.depth} />

      {/* Expand/collapse toggle */}
      <span className="w-5 shrink-0 flex items-center justify-center">
        {isExpandable ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.path);
            }}
            className="p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label={isExpanded ? `Collapse ${node.fieldName}` : `Expand ${node.fieldName}`}
          >
            {isExpanded ? (
              <ChevronDown size={14} aria-hidden="true" />
            ) : (
              <ChevronRight size={14} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </span>

      {/* Type icon */}
      <SchemaTreeNodeIcon type={node.type} className="mr-1.5" />

      {/* Field name (with optional highlight) */}
      <span className="text-sm text-slate-200 truncate">
        {highlightQuery ? (
          <HighlightedText text={node.fieldName} query={highlightQuery} />
        ) : (
          node.fieldName
        )}
      </span>

      {/* Required indicator */}
      {node.isRequired && (
        <span className="ml-1 text-red-400 text-xs font-bold" aria-label="required">
          *
        </span>
      )}

      {/* Child count badge */}
      {isExpandable && (
        <span className="ml-2 text-xs text-slate-500">
          ({node.childCount} {node.childCount === 1 ? 'field' : 'fields'})
        </span>
      )}

      {/* Union types indicator */}
      {node.unionTypes && node.unionTypes.length > 0 && (
        <span className="ml-2 text-xs text-pink-400/70">
          ({node.unionTypes.join(' | ')})
        </span>
      )}

      {/* Mapping status icon */}
      {mappingStatus && (
        <span className="ml-2 shrink-0">
          <MappingStatusIcon status={mappingStatus} />
        </span>
      )}

      {/* Description tooltip */}
      {node.description && (
        <span className="relative ml-auto">
          <span className="text-xs text-slate-500 cursor-help" title={node.description}>
            ℹ
          </span>
          <span className="absolute left-0 bottom-full mb-1 hidden group-hover:block z-10 max-w-xs px-2 py-1 text-xs text-slate-200 bg-slate-700 border border-slate-600 rounded shadow-lg whitespace-normal">
            {node.description}
          </span>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlight utility
// ---------------------------------------------------------------------------

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const segments: Array<{ text: string; highlighted: boolean }> = [];
  let lastIndex = 0;

  let pos = lowerText.indexOf(lowerQuery, lastIndex);
  while (pos !== -1) {
    if (pos > lastIndex) {
      segments.push({ text: text.slice(lastIndex, pos), highlighted: false });
    }
    segments.push({ text: text.slice(pos, pos + query.length), highlighted: true });
    lastIndex = pos + query.length;
    pos = lowerText.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlighted: false });
  }

  if (segments.length === 0) return <>{text}</>;

  return (
    <>
      {segments.map((seg, i) =>
        seg.highlighted ? (
          <mark key={i} className="bg-amber-500/30 text-amber-200 rounded-sm px-0.5">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tree guides
// ---------------------------------------------------------------------------

function TreeGuides({ depth }: { depth: number }) {
  if (depth === 0) return null;

  return (
    <span className="shrink-0 flex" aria-hidden="true">
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          className="w-5 h-8 border-l border-slate-700/50"
        />
      ))}
    </span>
  );
}
