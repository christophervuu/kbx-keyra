import { ChevronDown, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';

import { MappingStatusIcon } from './MappingStatusIcon';
import { SchemaTreeNodeIcon } from './SchemaTreeNodeIcon';
import { EditableNodeControls } from './EditableNodeControls';

import type { EditNodeCallbacks } from '../types';
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
  /** Whether the tree is in edit mode */
  editable?: boolean;
  /** Edit operation callbacks (provided when editable=true) */
  onNodeEdit?: EditNodeCallbacks;
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
  editable = false,
  onNodeEdit,
}: SchemaTreeNodeRowProps) {
  const isExpandable = node.childCount > 0;
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.fieldName);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleRowClick = () => {
    onSelect?.(node);
  };

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.fieldName) {
      onNodeEdit?.onRenameField(node.path, trimmed);
    }
    setIsRenaming(false);
  }

  function startRename() {
    setRenameValue(node.fieldName);
    setIsRenaming(true);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }

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
      className={`group relative flex items-center h-8 px-2 hover:bg-slate-800/50 cursor-default select-none ${selectedClass} ${focusedClass}`}
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

      {/* Field name — inline rename input or static text */}
      {editable && isRenaming ? (
        <input
          ref={renameInputRef}
          type="text"
          aria-label={`Rename field ${node.fieldName}`}
          data-testid="node-rename-input"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setRenameValue(node.fieldName);
              setIsRenaming(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-32 rounded border border-blue-500 bg-slate-800 px-1 py-0 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      ) : (
        <span className="text-sm text-slate-200 truncate">
          {highlightQuery ? (
            <HighlightedText text={node.fieldName} query={highlightQuery} />
          ) : (
            node.fieldName
          )}
        </span>
      )}

      {/* Required indicator (read-only mode) */}
      {!editable && node.isRequired && (
        <span className="ml-1 text-red-400 text-xs font-bold" aria-label="required">
          *
        </span>
      )}

      {/* Child count badge (read-only mode) */}
      {!editable && isExpandable && (
        <span className="ml-2 text-xs text-slate-500">
          ({node.childCount} {node.childCount === 1 ? 'field' : 'fields'})
        </span>
      )}

      {/* Union types indicator */}
      {!editable && node.unionTypes && node.unionTypes.length > 0 && (
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

      {/* Description tooltip (read-only mode) */}
      {!editable && node.description && (
        <span className="relative ml-auto">
          <span className="text-xs text-slate-500 cursor-help" title={node.description}>
            ℹ
          </span>
          <span className="absolute left-0 bottom-full mb-1 hidden group-hover:block z-10 max-w-xs px-2 py-1 text-xs text-slate-200 bg-slate-700 border border-slate-600 rounded shadow-lg whitespace-normal">
            {node.description}
          </span>
        </span>
      )}

      {/* Editable controls — rendered when in edit mode */}
      {editable && onNodeEdit && (
        <EditableNodeControls
          node={node}
          callbacks={onNodeEdit}
          onStartRename={startRename}
        />
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
