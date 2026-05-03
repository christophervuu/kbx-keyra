import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { BreadcrumbNav } from './BreadcrumbNav';
import { TargetFieldRow } from './TargetFieldRow';
import type { TargetFieldType } from './TargetFieldRow';
import { useTargetStatus } from '../hooks/use-target-status';

import type { ValidationResult } from '@/lib/engine';
import type { MappingRule, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GroupingMode = 'schema' | 'required-first' | 'unmapped-first' | 'warnings-first';

export interface TargetWorklistProps {
  /**
   * Flat list of all schema tree nodes (from parsedTargetSchema.nodes).
   * The tree structure is encoded via `depth`, `parentPath`, and `children`.
   */
  nodes: readonly SchemaTreeNode[];
  /** Current mapping rules */
  rules: readonly MappingRule[];
  /** Latest engine validation result (or null) */
  validationResult: ValidationResult | null;
  /** Currently selected target path (or null) */
  selectedPath: string | null;
  /** Active grouping mode */
  groupingMode: GroupingMode;
  /** Search/filter string — hides non-matching fields */
  searchQuery: string;
  /** Fired when a field row is clicked */
  onSelectNode: (path: string, nodeType: SchemaTreeNode['type']) => void;
  /**
   * When breadcrumb mode is active, this is the path of the subtree being
   * viewed. null means the full tree is shown.
   */
  currentSubtreePath?: string | null;
  /**
   * Whether breadcrumb drill-down mode is active. When true, clicking an
   * object/array node isolates that subtree instead of opening its builder.
   */
  breadcrumbMode?: boolean;
  /** Fired when the breadcrumb path changes (drill-in or navigate up) */
  onSubtreeNavigate?: (path: string | null) => void;
  /** Optional className for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps SchemaNodeType to TargetFieldType (the subset used by TargetFieldRow).
 * 'enum', 'any', 'union' fall back to 'string' for display purposes.
 */
function toFieldType(type: SchemaTreeNode['type']): TargetFieldType {
  switch (type) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'object':
    case 'array':
    case 'null':
    case 'integer':
      return type;
    default:
      return 'string';
  }
}

/**
 * Returns only root-level nodes (depth === 0) from the flat list.
 * The tree is rendered recursively from root nodes using `node.children`.
 */
function getRootNodes(nodes: readonly SchemaTreeNode[]): SchemaTreeNode[] {
  return nodes.filter((n) => n.depth === 0);
}

/**
 * Checks whether a node or any of its descendants match the search query.
 */
function nodeMatchesSearch(node: SchemaTreeNode, query: string): boolean {
  const q = query.toLowerCase();
  if (node.fieldName.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
    return true;
  }
  return node.children.some((child) => nodeMatchesSearch(child, query));
}

/**
 * Applies grouping mode to a list of root-level nodes.
 * Returns a new ordered array — does not mutate.
 */
function applyGrouping(
  nodes: SchemaTreeNode[],
  mode: GroupingMode,
  statusMap: Map<string, string>,
): SchemaTreeNode[] {
  if (mode === 'schema') return nodes;

  return [...nodes].sort((a, b) => {
    if (mode === 'required-first') {
      if (a.isRequired && !b.isRequired) return -1;
      if (!a.isRequired && b.isRequired) return 1;
      return 0;
    }
    if (mode === 'unmapped-first') {
      const aUnmapped = statusMap.get(a.path) === 'unmapped' ? 0 : 1;
      const bUnmapped = statusMap.get(b.path) === 'unmapped' ? 0 : 1;
      return aUnmapped - bUnmapped;
    }
    if (mode === 'warnings-first') {
      const severity = (s: string | undefined) => {
        if (s === 'error') return 0;
        if (s === 'warning') return 1;
        return 2;
      };
      return severity(statusMap.get(a.path)) - severity(statusMap.get(b.path));
    }
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Recursive row renderer
// ---------------------------------------------------------------------------

interface RenderNodeProps {
  node: SchemaTreeNode;
  statusMap: Map<string, string>;
  coverageMap: Map<string, { mapped: number; total: number }>;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  searchQuery: string;
  onSelectNode: (path: string, nodeType: SchemaTreeNode['type']) => void;
  onToggleExpand: (path: string) => void;
  rules: readonly MappingRule[];
}

function renderNode({
  node,
  statusMap,
  coverageMap,
  expandedPaths,
  selectedPath,
  searchQuery,
  onSelectNode,
  onToggleExpand,
  rules,
}: RenderNodeProps): ReactNode[] {
  // Filter by search
  if (searchQuery && !nodeMatchesSearch(node, searchQuery)) {
    return [];
  }

  const status = (statusMap.get(node.path) ?? 'unmapped') as
    | 'unmapped'
    | 'mapped'
    | 'warning'
    | 'error';
  const isExpandable = node.childCount > 0;
  const isExpanded = expandedPaths.has(node.path);
  const coverage = coverageMap.get(node.path);
  const coverageText = coverage ? `${coverage.mapped}/${coverage.total} mapped` : undefined;

  // Find expression summary for this node
  const rule = rules.find((r) => r.target === node.path);
  const expressionSummary = rule?.expression ?? undefined;

  const rows: React.ReactNode[] = [
    <TargetFieldRow
      key={node.path}
      fieldName={node.fieldName}
      fieldPath={node.path}
      fieldType={toFieldType(node.type)}
      required={node.isRequired}
      status={status}
      expressionSummary={expressionSummary}
      isSelected={selectedPath === node.path}
      depth={node.depth}
      isExpandable={isExpandable}
      isExpanded={isExpanded}
      coverageText={coverageText}
      onClick={() => onSelectNode(node.path, node.type)}
      onToggleExpand={isExpandable ? () => onToggleExpand(node.path) : undefined}
    />,
  ];

  // Render children if expanded
  if (isExpandable && isExpanded) {
    for (const child of node.children) {
      rows.push(
        ...renderNode({
          node: child,
          statusMap,
          coverageMap,
          expandedPaths,
          selectedPath,
          searchQuery,
          onSelectNode,
          onToggleExpand,
          rules,
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
 * TargetWorklist — center column of the Mapping Editor.
 *
 * Renders the target schema as a navigable, filterable, groupable tree of
 * `TargetFieldRow` components. Mapping status is derived from rules +
 * validation results via `useTargetStatus`.
 *
 * All state (selection, grouping, search) is owned by the parent — this
 * component is purely presentational beyond its internal expand/collapse state.
 */
export function TargetWorklist({
  nodes,
  rules,
  validationResult,
  selectedPath,
  groupingMode,
  searchQuery,
  onSelectNode,
  currentSubtreePath = null,
  breadcrumbMode = false,
  onSubtreeNavigate,
  className = '',
}: TargetWorklistProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const { statusMap, coverageMap } = useTargetStatus(rules, validationResult, nodes);

  const rootNodes = useMemo(() => getRootNodes(nodes), [nodes]);

  const groupedRoots = useMemo(
    () => applyGrouping(rootNodes, groupingMode, statusMap),
    [rootNodes, groupingMode, statusMap],
  );

  const handleToggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // When breadcrumb mode is active and user clicks an object/array node,
  // drill into that subtree instead of opening its builder.
  const handleSelectNode = (path: string, nodeType: SchemaTreeNode['type']) => {
    if (breadcrumbMode && (nodeType === 'object' || nodeType === 'array')) {
      onSubtreeNavigate?.(path);
    } else {
      onSelectNode(path, nodeType);
    }
  };

  // When breadcrumb mode is active, filter nodes to only those within the
  // current subtree path.
  const effectiveRootNodes = useMemo(() => {
    if (!breadcrumbMode || !currentSubtreePath) return groupedRoots;
    // Find the node at currentSubtreePath and use its children as roots
    function findNode(
      candidates: SchemaTreeNode[],
      targetPath: string,
    ): SchemaTreeNode | undefined {
      for (const n of candidates) {
        if (n.path === targetPath) return n;
        const found = findNode(n.children, targetPath);
        if (found) return found;
      }
      return undefined;
    }
    const subtreeNode = findNode(Array.from(nodes), currentSubtreePath);
    if (!subtreeNode) return groupedRoots;
    return subtreeNode.children;
  }, [breadcrumbMode, currentSubtreePath, groupedRoots, nodes]);

  if (nodes.length === 0) {
    return (
      <div
        className={`flex h-full items-center justify-center text-sm text-slate-500 ${className}`}
        data-testid="target-worklist-empty"
      >
        No target schema loaded
      </div>
    );
  }

  const rows = effectiveRootNodes.flatMap((node) =>
    renderNode({
      node,
      statusMap,
      coverageMap,
      expandedPaths,
      selectedPath,
      searchQuery,
      onSelectNode: handleSelectNode,
      onToggleExpand: handleToggleExpand,
      rules,
    }),
  );

  if (rows.length === 0 && searchQuery) {
    return (
      <div
        className={`flex h-full items-center justify-center text-sm text-slate-500 ${className}`}
        data-testid="target-worklist-no-results"
      >
        No fields match &ldquo;{searchQuery}&rdquo;
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col overflow-hidden ${className}`}
      data-testid="target-worklist-container"
    >
      {/* Breadcrumb nav — only shown when breadcrumb mode is active */}
      {breadcrumbMode && (
        <BreadcrumbNav
          currentPath={currentSubtreePath}
          onNavigate={(path) => onSubtreeNavigate?.(path)}
          className="shrink-0 border-b border-slate-800"
        />
      )}
      <div
        role="grid"
        aria-label="Target schema fields"
        data-testid="target-worklist"
        className="overflow-y-auto flex-1"
      >
        {rows}
      </div>
    </div>
  );
}
