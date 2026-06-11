import { Crosshair, Filter, List, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { TargetFieldRow } from './TargetFieldRow';
import type { TargetFieldType } from './TargetFieldRow';
import { useTargetStatus } from '../hooks/use-target-status';
import { inferRuleType } from '../lib/infer-rule-type';
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
  /** Fired when active target selection should be cleared */
  onClearSelection?: () => void;
  /** Fired when filter/search scope changes for auto-map affordance */
  onVisibleScopeChange?: (scope: { visibleTargetPaths: string[]; count: number }) => void;
  /** Optional sample output lookup keyed by target path */
  sampleOutputByTargetPath?: Readonly<Record<string, string | null | undefined>>;
  /** Optional sample array item counts keyed by target path */
  sampleArrayItemCountByTargetPath?: Readonly<Record<string, number | null | undefined>>;
  /** Optional auto-map suggestion status keyed by target path */
  autoMapSuggestionStatusByPath?: Readonly<Record<string, 'suggested' | 'accepted' | 'edited' | 'dismissed' | 'stale'>>;
  /** Current sort mode (controlled) */
  sort?: TargetSort;
  /** Fired when sort mode changes */
  onSortChange?: (sort: TargetSort) => void;
  /** Current editor view (controlled) */
  view: EditorView;
  /** Fired when view toggle is clicked */
  onViewToggle: (view: EditorView) => void;
  /** Optional target schema display name shown in the panel header */
  targetSchemaName?: string | null;
  /** Optional className for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Filter chip config
// ---------------------------------------------------------------------------

const FILTER_CHIPS: { value: TargetFilter; label: string }[] = [
  { value: 'unmapped', label: 'Unmapped' },
  { value: 'warnings', label: 'Warnings' },
  { value: 'required', label: 'Required' },
  { value: 'arrays', label: 'Arrays' },
];

const ARRAY_INLINE_CHILD_THRESHOLD = 25;
const ARRAY_MEDIUM_CHILD_THRESHOLD = 75;
const ARRAY_PRIORITIZED_CHILD_LIMIT = 25;

type ArrayChildDisplayMode = 'summary' | 'prioritized' | 'all';

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

function inferArrayMethodLabel(expression: string | null): string {
  if (!expression) return 'Not configured';
  const normalized = expression.replace(/\s+/g, '');
  if (normalized.startsWith('filter(') && normalized.includes('map(')) return 'Filter + map';
  if (normalized.startsWith('map(')) return 'Map list';
  if (normalized.startsWith('merge(')) return 'Merge lists';
  if (normalized.startsWith('array(')) return 'Build list';
  return 'Custom list logic';
}

function inferArraySourceSummary(expression: string | null): string {
  if (!expression) return 'No source list configured';
  const sourceMatch = expression.match(/source\("([^"]+)"\)/);
  if (!sourceMatch) return 'Source list set in builder';
  return sourceMatch[1];
}

function prioritizeArrayChildren(
  children: readonly SchemaTreeNode[],
  statusMap: Map<string, string>,
): SchemaTreeNode[] {
  const rank = (node: SchemaTreeNode): [number, number, string] => {
    const status = statusMap.get(node.path);
    const statusRank =
      status === 'error' ? 0
        : status === 'warning' ? 1
          : status === 'unmapped' ? 2
            : 3;
    const requiredRank = node.isRequired ? 0 : 1;
    return [statusRank, requiredRank, node.fieldName.toLowerCase()];
  };

  return [...children].sort((a, b) => {
    const [aStatus, aRequired, aName] = rank(a);
    const [bStatus, bRequired, bName] = rank(b);
    if (aStatus !== bStatus) return aStatus - bStatus;
    if (aRequired !== bRequired) return aRequired - bRequired;
    return aName.localeCompare(bName);
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
  rulesByTarget: Map<string, MappingRule>;
  sampleOutputByTargetPath?: Readonly<Record<string, string | null | undefined>>;
  sampleArrayItemCountByTargetPath?: Readonly<Record<string, number | null | undefined>>;
  autoMapSuggestionStatusByPath?: Readonly<Record<string, 'suggested' | 'accepted' | 'edited' | 'dismissed' | 'stale'>>;
  arrayChildDisplayModeByPath: Readonly<Record<string, ArrayChildDisplayMode | undefined>>;
  onSetArrayChildDisplayMode: (path: string, mode: ArrayChildDisplayMode) => void;
  collectedVisibleTargetPaths?: string[];
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
  rulesByTarget,
  sampleOutputByTargetPath,
  sampleArrayItemCountByTargetPath,
  autoMapSuggestionStatusByPath,
  arrayChildDisplayModeByPath,
  onSetArrayChildDisplayMode,
  collectedVisibleTargetPaths,
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
  const autoMapStatus = autoMapSuggestionStatusByPath?.[node.path];
  const effectiveStatus =
    autoMapStatus === 'suggested'
      ? 'ai'
      : autoMapStatus === 'stale'
        ? 'warning'
        : status;
  const suggestionNotes =
    autoMapStatus === 'suggested'
      ? 'AI suggestion pending review'
      : autoMapStatus === 'accepted'
        ? 'AI suggestion accepted'
        : autoMapStatus === 'edited'
          ? 'AI suggestion edited before apply'
          : autoMapStatus === 'dismissed'
            ? 'AI suggestion dismissed'
            : autoMapStatus === 'stale'
              ? 'AI suggestion stale — refresh recommended'
              : null;

  if (collectedVisibleTargetPaths && node.childCount === 0) {
    collectedVisibleTargetPaths.push(node.path);
  }

  const matchingRule = rulesByTarget.get(node.path);
  const isArrayNode = node.type === 'array';
  const arrayItemCount = isArrayNode ? (sampleArrayItemCountByTargetPath?.[node.path] ?? null) : null;
  const sourceSummary = isArrayNode
    ? inferArraySourceSummary(matchingRule?.expression ?? null)
    : (matchingRule?.expression ?? null);
  const mappingTypeLabel = isArrayNode
    ? inferArrayMethodLabel(matchingRule?.expression ?? null)
    : (matchingRule ? inferRuleType(matchingRule.expression) : 'Not configured');
  const notesPreview = suggestionNotes ?? matchingRule?.description ?? null;
  const sampleOutputPreview = sampleOutputByTargetPath?.[node.path] ?? null;
  const isExpandable = node.childCount > 0;
  const isExpanded = expandedPaths.has(node.path);
  const coverage = coverageMap.get(node.path);
  const coverageValue = coverage ? { mapped: coverage.mapped, total: coverage.total } : undefined;

  const rows: ReactNode[] = [
    <TargetFieldRow
      key={node.path}
      fieldName={node.fieldName}
      fieldPath={node.path}
      fieldType={toFieldType(node.type)}
      required={node.isRequired}
      status={effectiveStatus}
      isSelected={selectedPath === node.path}
      depth={node.depth}
      isExpandable={isExpandable}
      isExpanded={isExpanded}
      coverage={coverageValue}
      sourceSummary={sourceSummary ?? undefined}
      mappingTypeLabel={mappingTypeLabel}
      notesPreview={notesPreview ?? undefined}
      sampleOutputPreview={sampleOutputPreview ?? undefined}
      onClick={() => onSelectNode(node.path, node.type)}
      onToggleExpand={isExpandable ? () => onToggleExpand(node.path) : undefined}
    />,
  ];

  // Render children if expanded
  if (isExpandable && isExpanded) {
    if (isArrayNode && node.children.length > ARRAY_INLINE_CHILD_THRESHOLD) {
      const childCount = node.children.length;
      const defaultMode: ArrayChildDisplayMode =
        childCount > ARRAY_MEDIUM_CHILD_THRESHOLD ? 'summary' : 'prioritized';
      const childMode = arrayChildDisplayModeByPath[node.path] ?? defaultMode;

      const prioritizedChildren = prioritizeArrayChildren(node.children, statusMap);
      const visibleChildren =
        childMode === 'all'
          ? node.children
          : childMode === 'prioritized'
            ? prioritizedChildren.slice(0, ARRAY_PRIORITIZED_CHILD_LIMIT)
            : [];

      const modeDescription =
        childMode === 'all'
          ? `Showing all ${childCount} child fields`
          : childMode === 'prioritized'
            ? `Showing ${visibleChildren.length} prioritized of ${childCount} child fields`
            : `${childCount} child fields available`;

      rows.push(
        <div
          key={`${node.path}::__array-summary`}
          data-testid={`array-summary-${node.path}`}
          className="ml-8 mr-2 mb-2 rounded border border-slate-700/80 bg-slate-900/70 px-2 py-1.5"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
            <span>{modeDescription}</span>
            <span>Method: {mappingTypeLabel}</span>
            <span>Source list: {sourceSummary}</span>
            <span>Items: {arrayItemCount ?? '—'}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {childMode !== 'all' && (
              <button
                type="button"
                data-testid={`array-view-all-${node.path}`}
                onClick={() => onSetArrayChildDisplayMode(node.path, 'all')}
                className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              >
                View all child fields
              </button>
            )}
            {childMode !== 'prioritized' && childCount > ARRAY_MEDIUM_CHILD_THRESHOLD && (
              <button
                type="button"
                data-testid={`array-view-prioritized-${node.path}`}
                onClick={() => onSetArrayChildDisplayMode(node.path, 'prioritized')}
                className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              >
                Show prioritized child fields
              </button>
            )}
            {childMode === 'all' && childCount > ARRAY_INLINE_CHILD_THRESHOLD && (
              <button
                type="button"
                data-testid={`array-view-prioritized-${node.path}`}
                onClick={() => onSetArrayChildDisplayMode(node.path, 'prioritized')}
                className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              >
                Show prioritized child fields
              </button>
            )}
            <button
              type="button"
              data-testid={`array-open-builder-${node.path}`}
              onClick={() => onSelectNode(node.path, 'array')}
              className="rounded border border-blue-700/70 bg-blue-900/20 px-2 py-0.5 text-[11px] text-blue-300 transition-colors hover:bg-blue-900/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              Open Array Builder
            </button>
          </div>
        </div>,
      );

      for (const child of visibleChildren) {
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
            rulesByTarget,
            sampleOutputByTargetPath,
            sampleArrayItemCountByTargetPath,
            autoMapSuggestionStatusByPath,
            arrayChildDisplayModeByPath,
            onSetArrayChildDisplayMode,
            collectedVisibleTargetPaths,
          }),
        );
      }
      return rows;
    }

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
          rulesByTarget,
          sampleOutputByTargetPath,
          sampleArrayItemCountByTargetPath,
          autoMapSuggestionStatusByPath,
          arrayChildDisplayModeByPath,
          onSetArrayChildDisplayMode,
          collectedVisibleTargetPaths,
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
      role="menuitemcheckbox"
      aria-pressed={active}
      aria-checked={active}
      data-testid={`target-filter-${label.toLowerCase()}`}
      className={[
        'flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
        active
          ? 'bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/50'
          : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100',
      ].join(' ')}
    >
      {label}
      {active ? <span aria-hidden="true">✓</span> : null}
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
  onClearSelection,
  onVisibleScopeChange,
  sampleOutputByTargetPath,
  sampleArrayItemCountByTargetPath,
  autoMapSuggestionStatusByPath,
  view,
  onViewToggle,
  targetSchemaName = null,
  className = '',
}: TargetWorklistProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<TargetFilter>>(new Set());
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [arrayChildDisplayModeByPath, setArrayChildDisplayModeByPath] = useState<
    Record<string, ArrayChildDisplayMode | undefined>
  >({});

  const { statusMap, coverageMap } = useTargetStatus(rules, validationResult, nodes);
  const rulesByTarget = useMemo(() => {
    const map = new Map<string, MappingRule>();
    for (const rule of rules) {
      if (!map.has(rule.target)) {
        map.set(rule.target, rule);
      }
    }
    return map;
  }, [rules]);

  const rootNodes = useMemo(() => getRootNodes(nodes), [nodes]);

  const groupedRoots = useMemo(
    () => applyGrouping(rootNodes, groupingMode, statusMap),
    [rootNodes, groupingMode, statusMap],
  );

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

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

  const handleSetArrayChildDisplayMode = useCallback((path: string, mode: ArrayChildDisplayMode) => {
    setArrayChildDisplayModeByPath((prev) => ({ ...prev, [path]: mode }));
  }, []);

  const { rows, visibleTargetPaths } = useMemo(() => {
    const collectedVisibleTargetPaths: string[] = [];
    const renderedRows = groupedRoots.flatMap((node) =>
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
        rulesByTarget,
        sampleOutputByTargetPath,
        sampleArrayItemCountByTargetPath,
        autoMapSuggestionStatusByPath,
        arrayChildDisplayModeByPath,
        onSetArrayChildDisplayMode: handleSetArrayChildDisplayMode,
        collectedVisibleTargetPaths,
      }),
    );

    return {
      rows: renderedRows,
      visibleTargetPaths: collectedVisibleTargetPaths,
    };
  }, [
    groupedRoots,
    statusMap,
    coverageMap,
    expandedPaths,
    selectedPath,
    searchQuery,
    activeFilters,
    onSelectNode,
    handleToggleExpand,
    rulesByTarget,
    sampleOutputByTargetPath,
    sampleArrayItemCountByTargetPath,
    autoMapSuggestionStatusByPath,
    arrayChildDisplayModeByPath,
    handleSetArrayChildDisplayMode,
  ]);

  useEffect(() => {
    onVisibleScopeChange?.({
      visibleTargetPaths,
      count: visibleTargetPaths.length,
    });
  }, [onVisibleScopeChange, visibleTargetPaths]);

  const isFiltering = searchQuery.trim().length > 0 || activeFilters.size > 0;
  const activeFilterCount = activeFilters.size;

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

  return (
    <div
      className={`flex flex-col overflow-hidden ${className}`}
      data-testid="target-worklist-container"
    >
      {/* Panel header */}
      <div className="shrink-0 border-b border-slate-800 px-2 h-8">
        <div className="flex h-full items-center">
          <div className="flex min-w-0 items-center gap-2">
            <span
              data-testid="target-header-badge"
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-indigo-900/50 text-indigo-300"
            >
              TGT
            </span>
            <h2
              className="min-w-0 truncate text-xs font-semibold text-slate-300"
              data-testid="target-header-name"
              title={targetSchemaName ?? 'No target schema'}
            >
              {targetSchemaName ?? 'No target schema'}
            </h2>
          </div>

          <div
            role="group"
            aria-label="Editor view"
            className="ml-auto flex rounded border border-slate-700 bg-slate-800"
          >
            <button
              type="button"
              data-testid="toolbar-view-target"
              aria-label="Target view"
              aria-pressed={view === 'target'}
              onClick={() => view !== 'target' && onViewToggle('target')}
              className={[
                'flex items-center justify-center rounded-l px-2 py-0.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
                view === 'target'
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200',
              ].join(' ')}
            >
              <Crosshair size={11} aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="toolbar-view-rules"
              aria-label="Rules view"
              aria-pressed={view === 'rules'}
              onClick={() => view !== 'rules' && onViewToggle('rules')}
              className={[
                'flex items-center justify-center rounded-r px-2 py-0.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
                view === 'rules'
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200',
              ].join(' ')}
            >
              <List size={11} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Search + filter toolbar — hidden in rules view */}
      {view !== 'rules' && (
        <div className="shrink-0 border-b border-slate-800 px-2 py-1.5">
          {/* Search input */}
          <div className="flex items-center gap-1.5">
            <div className="relative flex flex-1 items-center">
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

            {selectedPath && onClearSelection && (
              <button
                type="button"
                onClick={onClearSelection}
                data-testid="target-clear-selection"
                className="inline-flex h-6 items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 text-xs text-slate-300 transition-colors hover:bg-slate-700/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              >
                Clear active row
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                data-testid="target-filter-button"
                aria-haspopup="menu"
                aria-expanded={isFilterMenuOpen}
                aria-label="Filter target fields"
                onClick={() => setIsFilterMenuOpen((prev) => !prev)}
                className="inline-flex h-6 items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 text-xs text-slate-300 transition-colors hover:bg-slate-700/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              >
                <Filter size={11} aria-hidden="true" />
                Filters
                {activeFilterCount > 0 && (
                  <span
                    className="inline-flex min-w-[1rem] items-center justify-center rounded-full bg-blue-600/40 px-1 text-[10px] font-semibold text-blue-200"
                    data-testid="target-filter-count"
                    aria-hidden="true"
                  >
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {isFilterMenuOpen && (
                <div
                  role="menu"
                  aria-label="Filter target fields"
                  data-testid="target-filter-menu"
                  className="absolute right-0 z-20 mt-1 w-44 rounded border border-slate-700 bg-slate-900 p-1 shadow-lg"
                >
                  {FILTER_CHIPS.map(({ value: v, label }) => (
                    <FilterChip
                      key={v}
                      label={label}
                      active={activeFilters.has(v)}
                      onClick={() => handleFilterToggle(v)}
                    />
                  ))}
                </div>
              )}
            </div>

            <span
              className="hidden shrink-0 text-[11px] text-slate-500 lg:inline"
              data-testid="visible-scope-count"
            >
              Scope: {visibleTargetPaths.length}
            </span>
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
