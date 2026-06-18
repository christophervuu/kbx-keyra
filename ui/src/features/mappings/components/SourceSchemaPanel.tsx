/**
 * SourceSchemaPanel — left panel of the Mapping Editor.
 *
 * FS-093 T-08 addendum:
 * - Guided terminology uses “Input fields” / “Browse inputs”.
 * - Input tree is grouped by Primary Source + Enrichment Inputs aliases.
 * - Leaf selection returns metadata so callers can generate source/external DSL.
 */

import { ChevronDown, ChevronRight, GripVertical, Search, X } from 'lucide-react';
import { memo, useContext, useMemo, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';

import { PreviewContext } from '../context/preview-context';
import { useDragSource } from '../hooks/use-drag-source';
import { resolveFieldTestValue } from '../lib/source-field-display';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InputNodeKind =
  | 'primary'
  | 'enrichment'
  | 'constant'
  | 'static'
  | 'item'
  | 'parent'
  | 'expression';

export interface StagedInputField {
  readonly path: string;
  readonly kind: InputNodeKind;
  readonly label?: string;
  readonly alias?: string;
  readonly constantName?: string;
  readonly staticValue?: unknown;
  readonly rawExpression?: string;
  readonly valueType?: SchemaTreeNode['type'];
  readonly sampleValue?: unknown;
  readonly expression: string;
}

export interface InputSchemaGroup {
  readonly key: string;
  readonly kind: InputNodeKind;
  readonly label: string;
  readonly alias?: string;
  readonly parsedSchema: ParsedSchema | null;
  readonly sourceData?: unknown;
}

export interface SourceSchemaPanelProps {
  /** Parsed primary source schema (or null when not yet loaded). */
  parsedSourceSchema: ParsedSchema | null;
  /** Optional source schema display name shown in the panel header. */
  sourceSchemaName?: string | null;
  /** Optional enrichment input groups (alias + parsed schema). */
  enrichmentInputGroups?: readonly { alias: string; parsedSchema: ParsedSchema | null }[];
  /** Optional enrichment source data map for subline previews. */
  enrichmentSourceData?: Readonly<Record<string, unknown>>;
  /**
   * Fires when an input field is clicked (click-to-stage) or dropped.
   * Receives metadata for DSL generation (primary => source(), enrichment => get(external(), ...)).
   */
  onStageField: (field: StagedInputField) => void;
  /** Optional smart-tray selected inputs for selected-state highlighting. */
  selectedInputs?: readonly {
    kind: InputNodeKind;
    path: string;
    alias?: string;
  }[];
  /** Optional className for the outer container. */
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
// Helpers
// ---------------------------------------------------------------------------

function buildStagedField(
  kind: InputNodeKind,
  path: string,
  options?: {
    readonly alias?: string;
    readonly valueType?: SchemaTreeNode['type'];
    readonly sampleValue?: unknown;
  },
): StagedInputField {
  const alias = options?.alias;
  const valueType = options?.valueType;
  const sampleValue = options?.sampleValue;

  if (kind === 'enrichment' && alias) {
    return {
      path,
      kind,
      alias,
      ...(valueType ? { valueType } : {}),
      ...(sampleValue !== undefined ? { sampleValue } : {}),
      expression: `get(external("${alias}"), "${path}")`,
    };
  }
  return {
    path,
    kind: 'primary',
    ...(valueType ? { valueType } : {}),
    ...(sampleValue !== undefined ? { sampleValue } : {}),
    expression: `source("${path}")`,
  };
}

function cloneNode(node: SchemaTreeNode, children: SchemaTreeNode[]): SchemaTreeNode {
  return {
    ...node,
    children,
    childCount: children.length,
  };
}

function filterTreeByQuery(nodes: readonly SchemaTreeNode[], query: string): SchemaTreeNode[] {
  if (query.trim().length === 0) return [...nodes];
  const q = query.trim().toLowerCase();

  function filterNode(node: SchemaTreeNode): SchemaTreeNode | null {
    const matchesSelf =
      node.fieldName.toLowerCase().includes(q)
      || node.path.toLowerCase().includes(q);

    const filteredChildren = node.children
      .map((child) => filterNode(child))
      .filter((child): child is SchemaTreeNode => child !== null);

    if (!matchesSelf && filteredChildren.length === 0) return null;
    return cloneNode(node, filteredChildren);
  }

  return nodes
    .map((node) => filterNode(node))
    .filter((node): node is SchemaTreeNode => node !== null);
}

function countMatchingNodes(nodes: readonly SchemaTreeNode[]): number {
  let count = 0;
  const walk = (next: readonly SchemaTreeNode[]) => {
    for (const node of next) {
      count += 1;
      if (node.children.length > 0) walk(node.children);
    }
  };
  walk(nodes);
  return count;
}

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

// ---------------------------------------------------------------------------
// Leaf field row (draggable)
// ---------------------------------------------------------------------------

interface LeafFieldRowProps {
  readonly node: SchemaTreeNode;
  readonly sampleValue?: string;
  readonly stagedField: StagedInputField;
  readonly onStageField: (field: StagedInputField) => void;
  readonly isHighlighted?: boolean;
  readonly isSelected?: boolean;
}

const LeafFieldRow = memo(function LeafFieldRow({
  node,
  sampleValue,
  stagedField,
  onStageField,
  isHighlighted = false,
  isSelected = false,
}: LeafFieldRowProps) {
  const { isDragging, dragHandlers } = useDragSource(node.path);

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    // Ignore the synthetic click emitted after a drag gesture.
    if (isDragging) {
      e.preventDefault();
      return;
    }
    onStageField(stagedField);
  };

  return (
    <div
      draggable
      data-testid={`source-field-${node.path}`}
      data-path={node.path}
      {...dragHandlers}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onStageField(stagedField);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Stage input field ${node.path}`}
      aria-pressed={isSelected}
      data-selected={isSelected ? 'true' : 'false'}
      style={{ paddingLeft: node.depth * 16 + 8 }}
      className={[
        'group flex min-h-[44px] cursor-grab items-center gap-1.5 border-b border-slate-800/50 py-1.5 pr-2 text-sm',
        'last:border-b-0 hover:bg-slate-800/40',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
        isDragging ? 'opacity-50' : '',
        isHighlighted ? 'bg-blue-950/30' : '',
        isSelected ? 'ring-1 ring-inset ring-emerald-500 bg-emerald-950/25' : '',
      ].filter(Boolean).join(' ')}
    >
      <GripVertical
        size={11}
        className="shrink-0 text-slate-700 group-hover:text-slate-500"
        aria-hidden="true"
      />

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
          {isSelected && (
            <span
              className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300"
              data-testid={`source-field-selected-badge-${node.path}`}
            >
              In tray
            </span>
          )}
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
  readonly node: SchemaTreeNode;
  readonly isExpanded: boolean;
  readonly onToggle: (path: string) => void;
  readonly isHighlighted?: boolean;
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
      ].filter(Boolean).join(' ')}
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
  readonly node: SchemaTreeNode;
  readonly expandedPaths: Set<string>;
  readonly onToggle: (path: string) => void;
  readonly onStageField: (field: StagedInputField) => void;
  readonly sourceData: unknown;
  readonly matchingPaths: Set<string>;
  readonly inputKind: InputNodeKind;
  readonly alias?: string;
  readonly selectedInputs: readonly {
    kind: InputNodeKind;
    path: string;
    alias?: string;
  }[];
}

function renderNode({
  node,
  expandedPaths,
  onToggle,
  onStageField,
  sourceData,
  matchingPaths,
  inputKind,
  alias,
  selectedInputs,
}: RenderNodeProps): ReactNode[] {
  const rows: ReactNode[] = [];

  const isContainer = node.type === 'object' || node.type === 'array';
  const isExpanded = expandedPaths.has(node.path);
  const isHighlighted = matchingPaths.has(node.path);
  const isSelected = selectedInputs.some((selected) =>
    selected.kind === inputKind
    && selected.path === node.path
    && (inputKind !== 'enrichment' || selected.alias === alias),
  );
  const sampleValue = !isContainer ? resolveFieldTestValue(sourceData, node.path) : undefined;

  rows.push(
    isContainer ? (
      <ContainerNodeRow
        key={`${inputKind}:${alias ?? 'primary'}:${node.path}`}
        node={node}
        isExpanded={isExpanded}
        onToggle={onToggle}
        isHighlighted={isHighlighted}
      />
    ) : (
      <LeafFieldRow
        key={`${inputKind}:${alias ?? 'primary'}:${node.path}`}
        node={node}
        sampleValue={sampleValue}
        stagedField={buildStagedField(inputKind, node.path, {
          alias,
          valueType: node.type,
          sampleValue,
        })}
        onStageField={onStageField}
        isHighlighted={isHighlighted}
        isSelected={isSelected}
      />
    ),
  );

  if (isContainer && isExpanded && node.children.length > 0) {
    for (const child of node.children) {
      rows.push(...renderNode({
        node: child,
        expandedPaths,
        onToggle,
        onStageField,
        sourceData,
        matchingPaths,
        inputKind,
        alias,
        selectedInputs,
      }));
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SourceSchemaPanel({
  parsedSourceSchema,
  sourceSchemaName = null,
  enrichmentInputGroups = [],
  enrichmentSourceData = {},
  onStageField,
  selectedInputs = [],
  className = '',
}: SourceSchemaPanelProps) {
  void sourceSchemaName;
  const previewCtx = useContext(PreviewContext);
  const primarySourceData = previewCtx?.sourceData ?? null;

  const allGroups = useMemo<InputSchemaGroup[]>(() => {
    const primaryGroup: InputSchemaGroup = {
      key: 'primary',
      kind: 'primary',
      label: 'Primary Source',
      parsedSchema: parsedSourceSchema,
      sourceData: primarySourceData,
    };
    const enrichmentGroupsMapped: InputSchemaGroup[] = enrichmentInputGroups.map((group) => ({
      key: `enrichment:${group.alias}`,
      kind: 'enrichment',
      alias: group.alias,
      label: group.alias,
      parsedSchema: group.parsedSchema,
      sourceData: enrichmentSourceData[group.alias] ?? null,
    }));
    return [primaryGroup, ...enrichmentGroupsMapped];
  }, [enrichmentInputGroups, enrichmentSourceData, parsedSourceSchema, primarySourceData]);

  const hasAnySchema = allGroups.some((group) => group.parsedSchema !== null && group.parsedSchema.nodes.length > 0);

  const [query, setQuery] = useState('');
  const [expandedByGroup, setExpandedByGroup] = useState<Record<string, Set<string>>>({});

  const normalizedQuery = query.trim().toLowerCase();

  const groupsWithNodes = useMemo(() => {
    return allGroups.map((group) => {
      const baseNodes = normalizeSchemaNodesToTree(group.parsedSchema?.nodes ?? []);
      const filteredNodes = filterTreeByQuery(baseNodes, normalizedQuery);
      const rootNodes = filteredNodes;
      const matchCount = countMatchingNodes(filteredNodes);
      const matchingPaths = new Set<string>();

      if (normalizedQuery.length > 0) {
        const walk = (nodes: readonly SchemaTreeNode[]) => {
          for (const node of nodes) {
            if (
              node.fieldName.toLowerCase().includes(normalizedQuery)
              || node.path.toLowerCase().includes(normalizedQuery)
            ) {
              matchingPaths.add(node.path);
            }
            if (node.children.length > 0) walk(node.children);
          }
        };
        walk(filteredNodes);
      }

      return {
        ...group,
        rootNodes,
        matchCount,
        matchingPaths,
      };
    });
  }, [allGroups, normalizedQuery]);

  const totalMatchCount = useMemo(
    () => groupsWithNodes.reduce((sum, group) => sum + group.matchCount, 0),
    [groupsWithNodes],
  );

  const isSearchActive = normalizedQuery.length > 0;

  const handleToggleGroupNode = (groupKey: string, path: string) => {
    setExpandedByGroup((prev) => {
      const existing = prev[groupKey] ?? new Set<string>();
      const nextSet = new Set(existing);
      if (nextSet.has(path)) nextSet.delete(path);
      else nextSet.add(path);
      return { ...prev, [groupKey]: nextSet };
    });
  };

  const clearSearch = () => {
    setQuery('');
  };

  if (!hasAnySchema) {
    return (
      <div
        className={`flex h-full items-center justify-center text-xs text-slate-500 ${className}`}
        data-testid="source-schema-panel-empty"
      >
        No input schema loaded
      </div>
    );
  }

  return (
    <div
      data-testid="source-schema-panel"
      className={`flex flex-col overflow-hidden ${className}`}
      aria-label="Input fields"
    >
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
            aria-label="Search input fields"
            data-testid="source-search"
            placeholder="Search input fields…"
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
            {totalMatchCount === 0
              ? 'No results'
              : `${totalMatchCount} result${totalMatchCount === 1 ? '' : 's'}`}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isSearchActive && totalMatchCount === 0 ? (
          <div
            className="flex h-full items-center justify-center text-xs text-slate-500"
            data-testid="source-search-no-results"
          >
            No input fields match &ldquo;{query}&rdquo;
          </div>
        ) : (
          <div className="divide-y divide-slate-800/70">
            {groupsWithNodes.map((group) => {
              const expandedPaths = expandedByGroup[group.key] ?? new Set<string>();
              const hasRows = group.rootNodes.length > 0;

              return (
                <section
                  key={group.key}
                  data-testid={`input-group-${group.key}`}
                  aria-label={group.label}
                  className="py-1"
                >
                  <header className="sticky top-0 z-[1] bg-slate-950/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {group.kind === 'primary' ? 'Primary Source' : `Enrichment Input: ${group.label}`}
                  </header>

                  {hasRows ? (
                    group.rootNodes.flatMap((node) => renderNode({
                      node,
                      expandedPaths,
                      onToggle: (path) => handleToggleGroupNode(group.key, path),
                      onStageField,
                      sourceData: group.sourceData ?? null,
                      matchingPaths: group.matchingPaths,
                      inputKind: group.kind,
                      alias: group.alias,
                      selectedInputs,
                    }))
                  ) : (
                    <p className="px-3 py-2 text-xs text-slate-500" data-testid={`input-group-empty-${group.key}`}>
                      {isSearchActive ? 'No matching fields in this input.' : 'No fields available.'}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
