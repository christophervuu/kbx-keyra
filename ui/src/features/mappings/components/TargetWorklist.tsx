import { ChevronDown, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { TargetFieldRow } from './TargetFieldRow';
import type { TargetFieldType } from './TargetFieldRow';
import { useTargetStatus } from '../hooks/use-target-status';
import { inferRuleType } from '../lib/infer-rule-type';
import type { TargetFilterTab, TargetSort } from '../types';

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
  /** Optional target schema display name shown in the panel header */
  targetSchemaName?: string | null;
  /** Optional className for the outer container */
  className?: string;
  /** Condensed table mode for focused row-editing state. */
  condensed?: boolean;
}

// ---------------------------------------------------------------------------
// Filter chip config
// ---------------------------------------------------------------------------

const FILTER_TABS: { value: TargetFilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'required', label: 'Required' },
  { value: 'unmapped', label: 'Unmapped' },
  { value: 'warnings', label: 'Warnings' },
  { value: 'errors', label: 'Errors' },
  { value: 'ai', label: 'AI Suggestions' },
  { value: 'mapped', label: 'Mapped' },
  { value: 'has-notes', label: 'Has Notes' },
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
 * Normalizes schema nodes into a root-only tree with consistent children/depth.
 * Supports both flattened and hierarchical input shapes.
 */
function normalizeSchemaNodesToTree(nodes: readonly SchemaTreeNode[]): SchemaTreeNode[] {
  type MutableNode = SchemaTreeNode & { children: SchemaTreeNode[] };

  const flattened: SchemaTreeNode[] = [];
  const seenFromInput = new Set<string>();
  const walk = (next: readonly SchemaTreeNode[]) => {
    for (const node of next) {
      if (seenFromInput.has(node.path)) continue;
      seenFromInput.add(node.path);
      flattened.push(node);
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  };
  walk(nodes);

  const nodeByPath = new Map<string, MutableNode>();
  const orderByPath = new Map<string, number>();

  flattened.forEach((node, index) => {
    orderByPath.set(node.path, index);
    if (!nodeByPath.has(node.path)) {
      nodeByPath.set(node.path, {
        ...node,
        children: [],
        childCount: 0,
      });
    }
  });

  const roots: MutableNode[] = [];
  for (const node of flattened) {
    const current = nodeByPath.get(node.path);
    if (!current) continue;

    const explicitParentPath = typeof node.parentPath === 'string' && node.parentPath.trim().length > 0
      ? node.parentPath.trim()
      : null;
    const inferredParentPath = node.path.includes('.')
      ? node.path.slice(0, node.path.lastIndexOf('.'))
      : null;

    const parentPath = [explicitParentPath, inferredParentPath]
      .filter((path, index, arr): path is string => Boolean(path) && arr.indexOf(path) === index)
      .find((path) => path !== node.path && nodeByPath.has(path));

    const parent = parentPath ? nodeByPath.get(parentPath) : undefined;
    if (parent) {
      parent.children.push(current);
      parent.childCount = parent.children.length;
      continue;
    }

    roots.push(current);
  }

  const sortByInputOrder = (list: MutableNode[]) => {
    list.sort((a, b) => (orderByPath.get(a.path) ?? 0) - (orderByPath.get(b.path) ?? 0));
    for (const node of list) {
      if (node.children.length > 0) {
        sortByInputOrder(node.children as MutableNode[]);
      }
    }
  };
  sortByInputOrder(roots);

  const assignDepth = (list: MutableNode[], depth: number) => {
    for (const node of list) {
      node.depth = depth;
      node.childCount = node.children.length;
      if (node.children.length > 0) {
        assignDepth(node.children as MutableNode[], depth + 1);
      }
    }
  };
  assignDepth(roots, 0);

  return roots;
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
function nodeMatchesFilterTab(params: {
  node: SchemaTreeNode;
  activeFilterTab: TargetFilterTab;
  statusMap: Map<string, string>;
  rulesByTarget: Map<string, MappingRule>;
  autoMapSuggestionStatusByPath?: Readonly<Record<string, 'suggested' | 'accepted' | 'edited' | 'dismissed' | 'stale'>>;
}): boolean {
  const { node, activeFilterTab, statusMap, rulesByTarget, autoMapSuggestionStatusByPath } = params;
  if (activeFilterTab === 'all') return true;

  const status = statusMap.get(node.path);
  const hasRule = rulesByTarget.has(node.path);
  const autoMapStatus = autoMapSuggestionStatusByPath?.[node.path];
  const note = rulesByTarget.get(node.path)?.description?.trim() ?? '';

  switch (activeFilterTab) {
    case 'required':
      return node.isRequired;
    case 'unmapped':
      return status === 'unmapped' && autoMapStatus !== 'suggested';
    case 'warnings':
      return status === 'warning';
    case 'errors':
      return status === 'error';
    case 'ai':
      return autoMapStatus === 'suggested';
    case 'mapped':
      return hasRule && autoMapStatus !== 'suggested';
    case 'has-notes':
      return note.length > 0;
    default:
      return true;
  }
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

function inferSourceFields(expression: string | null): string[] {
  if (!expression) return [];
  const sourceMatches = [...expression.matchAll(/source\("([^"]+)"\)/g)].map((match) => match[1]);
  const enrichmentMatches = [...expression.matchAll(/get\(external\("([^"]+)"\),\s*"([^"]+)"\)/g)]
    .map((match) => `${match[1]}.${match[2]}`);
  return [...new Set([...sourceMatches, ...enrichmentMatches])];
}

function inferArraySourceSummary(expression: string | null): string {
  const fields = inferSourceFields(expression);
  if (fields.length === 0) return 'No source list configured';
  return fields[0] ?? 'No source list configured';
}

function inferSourceSummary(expression: string | null): string {
  const fields = inferSourceFields(expression);
  if (fields.length === 0) return '—';
  if (fields.length <= 2) return fields.join(', ');
  return `${fields.slice(0, 2).join(', ')} +${fields.length - 2}`;
}

function inferInputTypeLabel(expression: string | null): string {
  if (!expression || expression.trim().length === 0) return 'Not configured';
  const hasPrimary = /source\("[^"]+"\)/.test(expression);
  const hasEnrichment = /get\(external\("[^"]+"\),\s*"[^"]+"\)/.test(expression);

  if (hasPrimary && hasEnrichment) return 'Mixed inputs';
  if (hasEnrichment) return 'Enrichment input';
  if (hasPrimary) return 'Primary source';
  return inferRuleType(expression);
}

function inferContainerCoverageLabel(
  coverage: { mapped: number; total: number } | undefined,
): string {
  if (!coverage || coverage.total <= 0) {
    return 'No mappable descendants';
  }
  if (coverage.mapped === 0) {
    return 'No child mappings';
  }
  if (coverage.mapped >= coverage.total) {
    return 'Fully mapped';
  }
  return 'Partially mapped';
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
  activeFilterTab: TargetFilterTab;
  onSelectNode: (path: string, nodeType: SchemaTreeNode['type']) => void;
  onToggleExpand: (path: string) => void;
  rulesByTarget: Map<string, MappingRule>;
  sampleOutputByTargetPath?: Readonly<Record<string, string | null | undefined>>;
  sampleArrayItemCountByTargetPath?: Readonly<Record<string, number | null | undefined>>;
  autoMapSuggestionStatusByPath?: Readonly<Record<string, 'suggested' | 'accepted' | 'edited' | 'dismissed' | 'stale'>>;
  arrayChildDisplayModeByPath: Readonly<Record<string, ArrayChildDisplayMode | undefined>>;
  onSetArrayChildDisplayMode: (path: string, mode: ArrayChildDisplayMode) => void;
  collectedVisibleTargetPaths?: string[];
  condensed?: boolean;
}

function renderNode({
  node,
  statusMap,
  coverageMap,
  expandedPaths,
  selectedPath,
  searchQuery,
  activeFilterTab,
  onSelectNode,
  onToggleExpand,
  rulesByTarget,
  sampleOutputByTargetPath,
  sampleArrayItemCountByTargetPath,
  autoMapSuggestionStatusByPath,
  arrayChildDisplayModeByPath,
  onSetArrayChildDisplayMode,
  collectedVisibleTargetPaths,
  condensed = false,
}: RenderNodeProps): ReactNode[] {
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


  const matchingRule = rulesByTarget.get(node.path);
  const isArrayNode = node.type === 'array';
  const isContainer = node.childCount > 0;
  const coverage = coverageMap.get(node.path);
  const coverageValue = coverage ? { mapped: coverage.mapped, total: coverage.total } : undefined;
  const arrayItemCount = isArrayNode ? (sampleArrayItemCountByTargetPath?.[node.path] ?? null) : null;
  const sourceSummary = isArrayNode
    ? inferArraySourceSummary(matchingRule?.expression ?? null)
    : inferSourceSummary(matchingRule?.expression ?? null);
  const methodLabel = isArrayNode
    ? inferArrayMethodLabel(matchingRule?.expression ?? null)
    : inferInputTypeLabel(matchingRule?.expression ?? null);
  const mappingTypeLabel = isContainer
    ? inferContainerCoverageLabel(coverageValue)
    : methodLabel;
  const notesPreview = suggestionNotes ?? matchingRule?.description ?? null;
  const sampleOutputPreview = sampleOutputByTargetPath?.[node.path] ?? null;
  const isExpandable = isContainer;
  const isExpanded = expandedPaths.has(node.path);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const rowMetadata = [
      sourceSummary,
      mappingTypeLabel,
      notesPreview,
      typeof (node as { description?: unknown }).description === 'string'
        ? ((node as { description?: string }).description ?? '')
        : '',
    ];
    const rowMetadataMatch = rowMetadata.some((value) => value?.toLowerCase().includes(q));
    if (!nodeMatchesSearch(node, searchQuery) && !rowMetadataMatch) {
      return [];
    }
  }

  // Filter by active tab (leaf nodes only — container nodes pass through if any child matches)
  if (!isContainer && !nodeMatchesFilterTab({
    node,
    activeFilterTab,
    statusMap,
    rulesByTarget,
    autoMapSuggestionStatusByPath,
  })) {
    return [];
  }

  if (collectedVisibleTargetPaths && node.childCount === 0) {
    collectedVisibleTargetPaths.push(node.path);
  }

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
      condensed={condensed}
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
            <span>Method: {methodLabel}</span>
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
            activeFilterTab,
            onSelectNode,
            onToggleExpand,
            rulesByTarget,
            sampleOutputByTargetPath,
            sampleArrayItemCountByTargetPath,
            autoMapSuggestionStatusByPath,
            arrayChildDisplayModeByPath,
            onSetArrayChildDisplayMode,
            collectedVisibleTargetPaths,
            condensed,
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
          activeFilterTab,
          onSelectNode,
          onToggleExpand,
          rulesByTarget,
          sampleOutputByTargetPath,
          sampleArrayItemCountByTargetPath,
          autoMapSuggestionStatusByPath,
          arrayChildDisplayModeByPath,
          onSetArrayChildDisplayMode,
          collectedVisibleTargetPaths,
          condensed,
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
  targetSchemaName,
  className = '',
  condensed = false,
}: TargetWorklistProps) {
  void targetSchemaName;

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilterTab, setActiveFilterTab] = useState<TargetFilterTab>('all');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [arrayChildDisplayModeByPath, setArrayChildDisplayModeByPath] = useState<
    Record<string, ArrayChildDisplayMode | undefined>
  >({});

  const treeNodes = useMemo(() => normalizeSchemaNodesToTree(nodes), [nodes]);

  const { statusMap, coverageMap } = useTargetStatus(rules, validationResult, treeNodes);
  const rulesByTarget = useMemo(() => {
    const map = new Map<string, MappingRule>();
    for (const rule of rules) {
      if (!map.has(rule.target)) {
        map.set(rule.target, rule);
      }
    }
    return map;
  }, [rules]);

  const rootNodes = treeNodes;

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

  const handleFilterTabClick = useCallback((tab: TargetFilterTab) => {
    setActiveFilterTab(tab);
    setIsFilterMenuOpen(false);
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
        activeFilterTab,
        onSelectNode,
        onToggleExpand: handleToggleExpand,
        rulesByTarget,
        sampleOutputByTargetPath,
        sampleArrayItemCountByTargetPath,
        autoMapSuggestionStatusByPath,
        arrayChildDisplayModeByPath,
        onSetArrayChildDisplayMode: handleSetArrayChildDisplayMode,
        collectedVisibleTargetPaths,
        condensed,
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
    activeFilterTab,
    onSelectNode,
    handleToggleExpand,
    rulesByTarget,
    sampleOutputByTargetPath,
    sampleArrayItemCountByTargetPath,
    autoMapSuggestionStatusByPath,
    arrayChildDisplayModeByPath,
    handleSetArrayChildDisplayMode,
    condensed,
  ]);

  useEffect(() => {
    onVisibleScopeChange?.({
      visibleTargetPaths,
      count: visibleTargetPaths.length,
    });
  }, [onVisibleScopeChange, visibleTargetPaths]);

  const isFiltering = searchQuery.trim().length > 0 || activeFilterTab !== 'all';
  const activeFilterLabel = FILTER_TABS.find((tab) => tab.value === activeFilterTab)?.label ?? 'All';

  if (treeNodes.length === 0) {
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
      data-condensed={condensed ? 'true' : 'false'}
    >
      {/* Search + filter toolbar */}
      <div className="shrink-0 border-b border-slate-800 bg-slate-950 px-2.5 py-1.5">
        {/* Search + filters */}
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

          <div className="relative">
            <button
              type="button"
              data-testid="target-filter-button"
              aria-haspopup="menu"
              aria-expanded={isFilterMenuOpen}
              onClick={() => setIsFilterMenuOpen((prev) => !prev)}
              className="inline-flex h-6 items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 text-xs text-slate-300 transition-colors hover:bg-slate-700/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              Filters: {activeFilterLabel}
              <ChevronDown size={11} aria-hidden="true" />
            </button>

            {isFilterMenuOpen && (
              <div
                role="menu"
                data-testid="target-filter-menu"
                className="absolute right-0 z-30 mt-1 min-w-[180px] rounded border border-slate-700 bg-slate-900 p-1 shadow-xl"
              >
                {FILTER_TABS.map(({ value, label }) => {
                  const active = activeFilterTab === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      data-testid={`target-filter-${label.toLowerCase().replace(/\s+/g, '-')}`}
                      onClick={() => handleFilterTabClick(value)}
                      className={[
                        'flex w-full items-center rounded px-2 py-1.5 text-left text-xs transition-colors',
                        active
                          ? 'bg-slate-800 text-slate-100'
                          : 'text-slate-300 hover:bg-slate-800/70',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
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
        </div>
      </div>

      <div
        className={[
          'grid items-center gap-2 border-b border-slate-800 bg-slate-950 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-500',
          condensed
            ? 'grid-cols-[56px_45%_1fr]'
            : 'grid-cols-[56px_minmax(220px,34%)_minmax(160px,24%)_minmax(120px,16%)_1fr]',
        ].join(' ')}
      >
        <span className="text-center">Status</span>
        <span>Target field</span>
        {!condensed && <span>Source field</span>}
        {!condensed && <span className="flex min-w-[120px] justify-center">Method</span>}
        <span>Notes</span>
      </div>

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
