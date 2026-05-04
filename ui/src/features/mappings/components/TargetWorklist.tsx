import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { Filter, List, Search, SortAsc, X } from 'lucide-react';

import { TargetFieldRow } from './TargetFieldRow';
import type { TargetFieldType } from './TargetFieldRow';
import { useTargetStatus } from '../hooks/use-target-status';
import type { EditorView, TargetFilter, TargetSort } from '../types';

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
  /** Fired when a field row is clicked */
  onSelectNode: (path: string, nodeType: SchemaTreeNode['type']) => void;
  /** Current sort mode (controlled) */
  sort: TargetSort;
  /** Fired when sort mode changes */
  onSortChange: (sort: TargetSort) => void;
  /** Current editor view (controlled) */
  view: EditorView;
  /** Fired when view toggle is clicked */
  onViewToggle: (view: EditorView) => void;
  /** Optional className for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------

const SORT_OPTIONS: { value: TargetSort; label: string }[] = [
  { value: 'schema', label: 'Schema order' },
  { value: 'unmapped-first', label: 'Unmapped first' },
  { value: 'required-first', label: 'Required first' },
];

// ---------------------------------------------------------------------------
// Filter chip config
// ---------------------------------------------------------------------------

const FILTER_CHIPS: { value: TargetFilter; label: string }[] = [
  { value: 'unmapped', label: 'Unmapped' },
  { value: 'warnings', label: 'Warnings' },
  { value: 'required', label: 'Required' },
  { value: 'arrays', label: 'Arrays' },
];

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
 * Checks whether a node passes all active filter chips.
 * AND semantics: must satisfy every active filter.
 */
function nodeMatchesFilters(
  node: SchemaTreeNode,
  activeFilters: Set<TargetFilter>,
  statusMap: Map<string, string>,
): boolean {
  if (activeFilters.size === 0) return true;

  for (const filter of activeFilters) {
    switch (filter) {
      case 'unmapped':
        if (statusMap.get(node.path) !== 'unmapped') return false;
        break;
      case 'warnings':
        if (
          statusMap.get(node.path) !== 'warning' &&
          statusMap.get(node.path) !== 'error'
        ) return false;
        break;
      case 'required':
        if (!node.isRequired) return false;
        break;
      case 'arrays':
        if (node.type !== 'array') return false;
        break;
    }
  }
  return true;
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
  activeFilters: Set<TargetFilter>;
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
  activeFilters,
  onSelectNode,
  onToggleExpand,
  rules,
}: RenderNodeProps): ReactNode[] {
  // Filter by search query
  if (searchQuery && !nodeMatchesSearch(node, searchQuery)) {
    return [];
  }

  // Filter by active chips (leaf nodes only — container nodes pass through if any child matches)
  const isContainer = node.childCount > 0;
  if (!isContainer && activeFilters.size > 0 && !nodeMatchesFilters(node, activeFilters, statusMap)) {
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
          activeFilters,
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
// FilterChip sub-component
// ---------------------------------------------------------------------------

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={`target-filter-${label.toLowerCase()}`}
      className={[
        'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
        active
          ? 'bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/50'
          : 'border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
      ].join(' ')}
    >
      {label}
    </button>
  );
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
 * Search and filter chip state are owned internally. Grouping mode is
 * controlled by the parent via `groupingMode`. Sort and view toggle are
 * controlled by the parent and rendered in the toolbar row above the search.
 */
export function TargetWorklist({
  nodes,
  rules,
  validationResult,
  selectedPath,
  groupingMode,
  onSelectNode,
  sort,
  onSortChange,
  view,
  onViewToggle,
  className = '',
}: TargetWorklistProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<TargetFilter>>(new Set());

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

  const handleFilterToggle = useCallback((filter: TargetFilter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  }, []);

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

  const rows = groupedRoots.flatMap((node) =>
    renderNode({
      node,
      statusMap,
      coverageMap,
      expandedPaths,
      selectedPath,
      searchQuery,
      activeFilters,
      onSelectNode,
      onToggleExpand: handleToggleExpand,
      rules,
    }),
  );

  const isFiltering = searchQuery.trim().length > 0 || activeFilters.size > 0;

  return (
    <div
      className={`flex flex-col overflow-hidden ${className}`}
      data-testid="target-worklist-container"
    >
      {/* Sort + View toggle toolbar */}
      <div className="shrink-0 border-b border-slate-800 px-2 py-1.5 flex items-center gap-2">
        {/* Sort selector — hidden in rules view */}
        {view !== 'rules' && (
          <div className="flex items-center gap-1">
            <SortAsc size={12} className="text-slate-500 shrink-0" aria-hidden="true" />
            <select
              aria-label="Sort order"
              data-testid="toolbar-sort"
              value={sort}
              onChange={(e) => onSortChange(e.target.value as TargetSort)}
              className="h-6 rounded border border-slate-700 bg-slate-800 px-1.5 text-xs text-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {SORT_OPTIONS.map(({ value: v, label }) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Spacer */}
        <span className="flex-1" aria-hidden="true" />

        {/* View toggle */}
        <div
          role="group"
          aria-label="Editor view"
          className="flex rounded border border-slate-700 bg-slate-800"
        >
          <button
            type="button"
            data-testid="toolbar-view-target"
            aria-pressed={view === 'target'}
            onClick={() => view !== 'target' && onViewToggle('target')}
            className={[
              'flex items-center gap-1 rounded-l px-2 py-0.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
              view === 'target'
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200',
            ].join(' ')}
          >
            <Filter size={11} aria-hidden="true" />
            Target
          </button>
          <button
            type="button"
            data-testid="toolbar-view-rules"
            aria-pressed={view === 'rules'}
            onClick={() => view !== 'rules' && onViewToggle('rules')}
            className={[
              'flex items-center gap-1 rounded-r px-2 py-0.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
              view === 'rules'
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200',
            ].join(' ')}
          >
            <List size={11} aria-hidden="true" />
            Rules
          </button>
        </div>
      </div>

      {/* Search + filter toolbar — hidden in rules view */}
      {view !== 'rules' && (
        <div className="shrink-0 border-b border-slate-800 px-2 py-1.5 space-y-1.5">
          {/* Search input */}
          <div className="relative flex items-center">
            <Search
              size={12}
              className="pointer-events-none absolute left-2 text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              role="searchbox"
              aria-label="Search target fields"
              data-testid="target-search"
              placeholder="Search fields…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-6 w-full rounded border border-slate-700 bg-slate-800 pl-6 pr-6 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                data-testid="target-search-clear"
                className="absolute right-1.5 text-slate-500 hover:text-slate-300"
              >
                <X size={11} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Filter chips */}
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Filter target fields"
            data-testid="target-filter-chips"
          >
            <Filter size={11} className="text-slate-600 shrink-0" aria-hidden="true" />
            {FILTER_CHIPS.map(({ value: v, label }) => (
              <FilterChip
                key={v}
                label={label}
                active={activeFilters.has(v)}
                onClick={() => handleFilterToggle(v)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Field list */}
      {rows.length === 0 && isFiltering ? (
        <div
          className="flex flex-1 items-center justify-center text-sm text-slate-500"
          data-testid="target-worklist-no-results"
        >
          No fields match the current filters
        </div>
      ) : (
        <div
          role="grid"
          aria-label="Target schema fields"
          data-testid="target-worklist"
          className="overflow-y-auto flex-1"
        >
          {rows}
        </div>
      )}
    </div>
  );
}
