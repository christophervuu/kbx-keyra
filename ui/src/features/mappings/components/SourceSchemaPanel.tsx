/**
 * SourceSchemaPanel — left panel of the Mapping Editor.
 *
 * Renders the source schema as a browsable, expandable tree with a search
 * input that filters and expands-to-match using `useTreeSearch`.
 * Leaf fields are draggable (HTML5 Drag API) and click-to-stage capable.
 * Object/array nodes are expandable/collapsible but not themselves draggable.
 *
 * Drag payload: source field path string (plain text on DataTransfer).
 * Click-to-stage: fires `onStageField(path)` when a leaf is clicked.
 */

import { ChevronDown, ChevronRight, GripVertical, Search, X } from 'lucide-react';
import { memo, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { PreviewContext } from '../context/preview-context';
import { useDragSource } from '../hooks/use-drag-source';
import { resolveFieldTestValue } from '../lib/source-field-display';

import { useTreeSearch } from '@/features/schemas/hooks/use-tree-search';
import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceSchemaPanelProps {
  /** Parsed source schema (or null when not yet loaded) */
  parsedSourceSchema: ParsedSchema | null;
  /** Optional source schema display name shown in the panel header */
  sourceSchemaName?: string | null;
  /**
   * Fired when a source field is clicked (click-to-stage) or dropped.
   * Receives the full dot-path of the field.
   */
  onStageField: (path: string) => void;
  /** Optional className for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, string> = {
  string: 'bg-blue-900/60 text-blue-300',
  number: 'bg-green-900/60 text-green-300',
  integer: 'bg-green-900/60 text-green-300',
  boolean: 'bg-purple-900/60 text-purple-300',
  object: 'bg-slate-700/80 text-slate-300',
  array: 'bg-amber-900/60 text-amber-300',
  null: 'bg-slate-800/60 text-slate-500',
  enum: 'bg-blue-900/60 text-blue-300',
  any: 'bg-slate-700/80 text-slate-300',
  union: 'bg-slate-700/80 text-slate-300',
};

const TYPE_ABBREV: Record<string, string> = {
  string: 'str',
  number: 'num',
  integer: 'int',
  boolean: 'bool',
  object: 'obj',
  array: 'arr',
  null: 'null',
  enum: 'enum',
  any: 'any',
  union: '|',
};

// ---------------------------------------------------------------------------
// Leaf field row (draggable)
// ---------------------------------------------------------------------------

interface LeafFieldRowProps {
  node: SchemaTreeNode;
  sampleValue?: string;
  onStageField: (path: string) => void;
  isHighlighted?: boolean;
}

const LeafFieldRow = memo(function LeafFieldRow({
  node,
  sampleValue,
  onStageField,
  isHighlighted = false,
}: LeafFieldRowProps) {
  const { isDragging, dragHandlers } = useDragSource(node.path);

  return (
    <div
      draggable
      data-testid={`source-field-${node.path}`}
      data-path={node.path}
      {...dragHandlers}
      onClick={() => onStageField(node.path)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onStageField(node.path);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Stage source field ${node.path}`}
      style={{ paddingLeft: node.depth * 16 + 8 }}
      className={[
        'group flex min-h-[44px] cursor-grab items-center gap-1.5 border-b border-slate-800/50 py-1.5 pr-2 text-sm',
        'last:border-b-0 hover:bg-slate-800/40',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
        isDragging ? 'opacity-50' : '',
        isHighlighted ? 'bg-blue-950/30' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Drag handle indicator */}
      <GripVertical
        size={11}
        className="shrink-0 text-slate-700 group-hover:text-slate-500"
        aria-hidden="true"
      />

      {/* Field name + sample preview (target-row parity) */}
      <span className="min-w-0 flex-1" data-testid={`source-field-content-${node.path}`}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={`inline-flex min-w-[2rem] shrink-0 justify-center rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_COLORS[node.type] ?? 'bg-slate-700/80 text-slate-300'}`}
            aria-label={`type: ${node.type}`}
          >
            {TYPE_ABBREV[node.type] ?? node.type}
          </span>
          <span className="truncate font-mono text-xs text-slate-200" title={node.path}>
            {node.fieldName}
          </span>
        </span>
        <p
          className="ml-[2.6rem] truncate text-[11px] text-slate-500"
          data-testid={`source-field-subline-${node.path}`}
          title={sampleValue ?? '—'}
        >
          {sampleValue ?? '—'}
        </p>
      </span>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Container node row (expandable, not draggable)
// ---------------------------------------------------------------------------

interface ContainerNodeRowProps {
  node: SchemaTreeNode;
  isExpanded: boolean;
  onToggle: (path: string) => void;
  isHighlighted?: boolean;
}

function ContainerNodeRow({
  node,
  isExpanded,
  onToggle,
  isHighlighted = false,
}: ContainerNodeRowProps) {
  return (
    <button
      type="button"
      data-testid={`source-container-${node.path}`}
      onClick={() => onToggle(node.path)}
      aria-expanded={isExpanded}
      style={{ paddingLeft: node.depth * 16 + 4 }}
      className={[
        'flex min-h-[44px] w-full items-center gap-1.5 border-b border-slate-800/50 py-1.5 pr-2 text-left text-sm',
        'last:border-b-0 hover:bg-slate-800/40',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
        isHighlighted ? 'bg-blue-950/30' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {isExpanded ? (
        <ChevronDown size={12} className="shrink-0 text-slate-500" aria-hidden="true" />
      ) : (
        <ChevronRight size={12} className="shrink-0 text-slate-500" aria-hidden="true" />
      )}
      <span
        className={`inline-flex min-w-[2rem] shrink-0 justify-center rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_COLORS[node.type] ?? 'bg-slate-700/80 text-slate-300'}`}
        aria-label={`type: ${node.type}`}
      >
        {TYPE_ABBREV[node.type] ?? node.type}
      </span>
      <span className="min-w-0 flex-1" data-testid={`source-container-content-${node.path}`}>
        <span className="block truncate font-mono text-xs text-slate-200" title={node.path}>
          {node.fieldName}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Recursive tree renderer
// ---------------------------------------------------------------------------

interface RenderNodeProps {
  node: SchemaTreeNode;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onStageField: (path: string) => void;
  sourceData: unknown;
  visiblePaths: Set<string> | null;
  matchingPaths: Set<string>;
}

function renderNode({
  node,
  expandedPaths,
  onToggle,
  onStageField,
  sourceData,
  visiblePaths,
  matchingPaths,
}: RenderNodeProps): ReactNode[] {
  const rows: ReactNode[] = [];
  // When search is active, only render nodes in the visible set
  if (visiblePaths !== null && !visiblePaths.has(node.path)) {
    return [];
  }

  const isContainer = node.type === 'object' || node.type === 'array';
  const isExpanded = expandedPaths.has(node.path);
  const isHighlighted = matchingPaths.has(node.path);

  rows.push(
    isContainer ? (
      <ContainerNodeRow
        key={node.path}
        node={node}
        isExpanded={isExpanded}
        onToggle={onToggle}
        isHighlighted={isHighlighted}
      />
    ) : (
      <LeafFieldRow
        key={node.path}
        node={node}
        sampleValue={resolveFieldTestValue(sourceData, node.path)}
        onStageField={onStageField}
        isHighlighted={isHighlighted}
      />
    ),
  );

  if (isContainer && isExpanded && node.children.length > 0) {
    for (const child of node.children) {
      rows.push(
        ...renderNode({
          node: child,
          expandedPaths,
          onToggle,
          onStageField,
          sourceData,
          visiblePaths,
          matchingPaths,
        }),
      );
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * SourceSchemaPanel — browsable, draggable source schema tree with search.
 */
export function SourceSchemaPanel({
  parsedSourceSchema,
  sourceSchemaName = null,
  onStageField,
  className = '',
}: SourceSchemaPanelProps) {
  void sourceSchemaName;
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const previewCtx = useContext(PreviewContext);
  const sourceData = previewCtx?.sourceData ?? null;

  const allNodes = useMemo<SchemaTreeNode[]>(() => parsedSourceSchema?.nodes ?? [], [parsedSourceSchema]);
  const {
    query,
    setQuery,
    clearSearch,
    isSearchActive,
    filterResult,
    searchExpandedPaths,
  } = useTreeSearch(allNodes, expandedPaths, setExpandedPaths);

  const handleToggle = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleStageField = (path: string) => {
    onStageField(path);
  };


  if (!parsedSourceSchema || parsedSourceSchema.nodes.length === 0) {
    return (
      <div
        className={`flex h-full items-center justify-center text-xs text-slate-500 ${className}`}
        data-testid="source-schema-panel-empty"
      >
        No source schema loaded
      </div>
    );
  }

  // When search is active, use search-expanded paths; otherwise use manual expand state
  const effectiveExpandedPaths = isSearchActive ? searchExpandedPaths : expandedPaths;
  const visiblePaths = isSearchActive ? filterResult.visiblePaths : null;
  const matchingPaths = isSearchActive ? filterResult.matchingPaths : new Set<string>();

  // Render only root nodes; children rendered recursively when expanded
  const rootNodes = parsedSourceSchema.nodes.filter((n) => n.depth === 0);

  return (
    <div
      data-testid="source-schema-panel"
      className={`flex flex-col overflow-hidden ${className}`}
      aria-label="Source schema fields"
    >
      {/* Search header */}
      <div className="shrink-0 border-b border-slate-800 px-2 py-1.5">
        <div className="relative flex items-center">
          <Search
            size={12}
            className="pointer-events-none absolute left-2 text-slate-500"
            aria-hidden="true"
          />
          <input
            type="search"
            role="searchbox"
            aria-label="Search source fields"
            data-testid="source-search"
            placeholder="Search fields…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-6 w-full rounded border border-slate-700 bg-slate-800 pl-6 pr-6 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              data-testid="source-search-clear"
              className="absolute right-1.5 text-slate-500 hover:text-slate-300"
            >
              <X size={11} aria-hidden="true" />
            </button>
          )}
        </div>
        {isSearchActive && (
          <p
            className="mt-1 text-[10px] text-slate-500"
            data-testid="source-search-count"
            aria-live="polite"
          >
            {filterResult.matchCount === 0
              ? 'No results'
              : `${filterResult.matchCount} result${filterResult.matchCount === 1 ? '' : 's'}`}
          </p>
        )}
      </div>

      {/* Tree */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isSearchActive && filterResult.matchCount === 0 ? (
          <div
            className="flex h-full items-center justify-center text-xs text-slate-500"
            data-testid="source-search-no-results"
          >
            No fields match &ldquo;{query}&rdquo;
          </div>
        ) : (
          rootNodes.map((node) =>
            renderNode({
              node,
              expandedPaths: effectiveExpandedPaths,
              onToggle: handleToggle,
              onStageField: handleStageField,
              sourceData,
              visiblePaths,
              matchingPaths,
            }),
          )
        )}
      </div>

    </div>
  );
}
