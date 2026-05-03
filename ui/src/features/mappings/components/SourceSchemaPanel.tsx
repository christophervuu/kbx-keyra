/**
 * SourceSchemaPanel — left panel of the Mapping Editor.
 *
 * Renders the source schema as a browsable, expandable tree.
 * Leaf fields are draggable (HTML5 Drag API) and click-to-stage capable.
 * Object/array nodes are expandable/collapsible but not themselves draggable.
 *
 * Drag payload: source field path string (plain text on DataTransfer).
 * Click-to-stage: fires `onStageField(path)` when a leaf is clicked.
 */

import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { memo, useState } from 'react';

import { useDragSource } from '../hooks/use-drag-source';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceSchemaPanelProps {
  /** Parsed source schema (or null when not yet loaded) */
  parsedSourceSchema: ParsedSchema | null;
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
  string: 'text-blue-400',
  number: 'text-green-400',
  integer: 'text-green-400',
  boolean: 'text-purple-400',
  object: 'text-slate-400',
  array: 'text-amber-400',
  null: 'text-slate-500',
  enum: 'text-blue-400',
  any: 'text-slate-400',
  union: 'text-slate-400',
};

const TYPE_ABBREV: Record<string, string> = {
  string: 'str',
  number: 'num',
  integer: 'int',
  boolean: 'bool',
  object: 'obj',
  array: '[]',
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
  onStageField: (path: string) => void;
}

const LeafFieldRow = memo(function LeafFieldRow({ node, onStageField }: LeafFieldRowProps) {
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
        'group flex cursor-grab items-center gap-1.5 border-b border-slate-800/50 py-1.5 pr-2 text-xs',
        'last:border-b-0 hover:bg-slate-800/40',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
        isDragging ? 'opacity-50' : '',
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

      {/* Field name */}
      <span className="min-w-0 flex-1 truncate font-mono text-slate-300" title={node.path}>
        {node.fieldName}
      </span>

      {/* Type badge */}
      <span
        className={`shrink-0 text-[10px] font-medium ${TYPE_COLORS[node.type] ?? 'text-slate-400'}`}
        aria-label={`type: ${node.type}`}
      >
        {TYPE_ABBREV[node.type] ?? node.type}
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
}

function ContainerNodeRow({ node, isExpanded, onToggle }: ContainerNodeRowProps) {
  return (
    <button
      type="button"
      data-testid={`source-container-${node.path}`}
      onClick={() => onToggle(node.path)}
      aria-expanded={isExpanded}
      style={{ paddingLeft: node.depth * 16 + 4 }}
      className={[
        'flex w-full items-center gap-1.5 border-b border-slate-800/50 py-1.5 pr-2 text-xs',
        'last:border-b-0 hover:bg-slate-800/40',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
      ].join(' ')}
    >
      {isExpanded ? (
        <ChevronDown size={12} className="shrink-0 text-slate-500" aria-hidden="true" />
      ) : (
        <ChevronRight size={12} className="shrink-0 text-slate-500" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-slate-400" title={node.path}>
        {node.fieldName}
      </span>
      <span
        className={`shrink-0 text-[10px] font-medium ${TYPE_COLORS[node.type] ?? 'text-slate-400'}`}
        aria-label={`type: ${node.type}`}
      >
        {TYPE_ABBREV[node.type] ?? node.type}
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
}

function renderNode({
  node,
  expandedPaths,
  onToggle,
  onStageField,
}: RenderNodeProps): React.ReactNode[] {
  const isContainer = node.type === 'object' || node.type === 'array';
  const isExpanded = expandedPaths.has(node.path);

  const rows: React.ReactNode[] = [
    isContainer ? (
      <ContainerNodeRow
        key={node.path}
        node={node}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
    ) : (
      <LeafFieldRow key={node.path} node={node} onStageField={onStageField} />
    ),
  ];

  if (isContainer && isExpanded && node.children.length > 0) {
    for (const child of node.children) {
      rows.push(
        ...renderNode({ node: child, expandedPaths, onToggle, onStageField }),
      );
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * SourceSchemaPanel — browsable, draggable source schema tree.
 */
export function SourceSchemaPanel({
  parsedSourceSchema,
  onStageField,
  className = '',
}: SourceSchemaPanelProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const handleToggle = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
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

  // Render only root nodes; children rendered recursively when expanded
  const rootNodes = parsedSourceSchema.nodes.filter((n) => n.depth === 0);

  return (
    <div
      data-testid="source-schema-panel"
      className={`overflow-y-auto ${className}`}
      aria-label="Source schema fields"
    >
      {rootNodes.map((node) =>
        renderNode({ node, expandedPaths, onToggle: handleToggle, onStageField }),
      )}
    </div>
  );
}
