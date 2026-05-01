import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, FileQuestion, Loader2 } from 'lucide-react';
import type { ForwardedRef } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { getNodeDomId, useFlattenedTree, useTreeKeyboardNav, useTreeSearch } from '../hooks';
import type { SchemaTreeViewProps } from '../types';
import { SchemaSearchInput } from './SchemaSearchInput';
import { SchemaTreeNodeRow } from './SchemaTreeNodeRow';
import { SchemaTreeToolbar } from './SchemaTreeToolbar';

import { Button } from '@/components';
import type { MappingNodeStatus, ParsedSchema, SchemaTreeNode } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed row height in pixels */
const ROW_HEIGHT = 32;

/** Number of rows to render above/below the viewport */
const OVERSCAN = 15;

// ---------------------------------------------------------------------------
// Imperative handle for external control
// ---------------------------------------------------------------------------

export interface SchemaTreeViewHandle {
  /** Scroll to a specific node by its path. Returns true if the node was found. */
  scrollToNode: (path: string) => boolean;
}

// ---------------------------------------------------------------------------
// Extended props for component states
// ---------------------------------------------------------------------------

interface SchemaTreeViewComponentProps extends Partial<SchemaTreeViewProps> {
  /** Show loading skeleton */
  loading?: boolean;
  /** Error message or SchemaParseError to display */
  error?: string | { message: string };
  /** Callback when retry button is clicked */
  onRetry?: () => void;
  /** Override schema as optional for loading/error states */
  schema?: ParsedSchema;
  /** Max height of the tree container in pixels (default: 600) */
  maxHeight?: number;
}

// ---------------------------------------------------------------------------
// Helper: collect all expandable paths recursively
// ---------------------------------------------------------------------------

function collectAllExpandablePaths(nodes: SchemaTreeNode[]): Set<string> {
  const result = new Set<string>();
  function visit(list: SchemaTreeNode[]) {
    for (const node of list) {
      if (node.childCount > 0) {
        result.add(node.path);
        visit(node.children);
      }
    }
  }
  visit(nodes);
  return result;
}

function collectPathsToDepth(nodes: SchemaTreeNode[], targetDepth: number): Set<string> {
  const result = new Set<string>();
  function visit(list: SchemaTreeNode[]) {
    for (const node of list) {
      if (node.childCount > 0) {
        if (node.depth < targetDepth) {
          result.add(node.path);
        }
        visit(node.children);
      }
    }
  }
  visit(nodes);
  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SchemaTreeView = forwardRef(function SchemaTreeView(
  {
    schema,
    loading = false,
    error,
    onRetry,
    maxHeight = 600,
    searchable = true,
    variant = 'source',
    mappingStatus,
    onSelectNode,
    selectedPath: controlledSelectedPath,
  }: SchemaTreeViewComponentProps,
  ref: ForwardedRef<SchemaTreeViewHandle>,
) {
  // Determine initial expanded set: all depth-0 nodes with children
  const defaultExpanded = useMemo(() => {
    if (!schema) return new Set<string>();
    const paths = new Set<string>();
    for (const node of schema.nodes) {
      if (node.childCount > 0) {
        paths.add(node.path);
      }
    }
    return paths;
  }, [schema]);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(defaultExpanded);

  // Reset expanded paths when schema changes (derive-state-during-render pattern)
  const [prevSchema, setPrevSchema] = useState(schema);
  if (schema !== prevSchema) {
    setPrevSchema(schema);
    setExpandedPaths(defaultExpanded);
  }

  // Selection state: controlled vs uncontrolled
  const [internalSelectedPath, setInternalSelectedPath] = useState<string | undefined>(undefined);
  const isControlledSelection = controlledSelectedPath !== undefined;
  const effectiveSelectedPath = isControlledSelection ? controlledSelectedPath : internalSelectedPath;

  const handleSelect = useCallback((node: SchemaTreeNode) => {
    if (!isControlledSelection) {
      setInternalSelectedPath(node.path);
    }
    onSelectNode?.(node);
  }, [isControlledSelection, onSelectNode]);

  const handleToggle = useCallback((path: string) => {
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

  // Toolbar handlers
  const handleExpandAll = useCallback(() => {
    if (!schema) return;
    setExpandedPaths(collectAllExpandablePaths(schema.nodes));
  }, [schema]);

  const handleCollapseAll = useCallback(() => {
    setExpandedPaths(new Set<string>());
  }, []);

  const handleExpandToDepth = useCallback((depth: number) => {
    if (!schema) return;
    setExpandedPaths(collectPathsToDepth(schema.nodes, depth));
  }, [schema]);

  // Search state
  const search = useTreeSearch(
    schema?.nodes ?? [],
    expandedPaths,
    setExpandedPaths,
  );

  // Determine effective expanded paths (search overrides user expand state)
  const effectiveExpandedPaths = search.isSearchActive
    ? search.searchExpandedPaths
    : expandedPaths;

  // Flatten tree based on effective expand state, filtered by search
  const allFlatNodes = useFlattenedTree(schema?.nodes ?? [], effectiveExpandedPaths);

  // When search is active, filter flat nodes to only visible paths
  const flatNodes = useMemo(() => {
    if (!search.isSearchActive) return allFlatNodes;
    return allFlatNodes.filter((node) => search.filterResult.visiblePaths.has(node.path));
  }, [allFlatNodes, search.isSearchActive, search.filterResult.visiblePaths]);

  // Scroll container ref
  const scrollRef = useRef<HTMLDivElement>(null);

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  // Scroll to index helper for keyboard nav
  const scrollToIndex = useCallback((index: number) => {
    virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [virtualizer]);

  // Keyboard navigation
  const keyboardNav = useTreeKeyboardNav({
    flatNodes,
    expandedPaths: effectiveExpandedPaths,
    onToggle: handleToggle,
    onSelect: handleSelect,
    scrollToIndex,
  });

  // Expose scrollToNode via imperative handle
  useImperativeHandle(ref, () => ({
    scrollToNode(path: string): boolean {
      const index = flatNodes.findIndex((n) => n.path === path);
      if (index === -1) return false;
      virtualizer.scrollToIndex(index, { align: 'auto' });
      return true;
    },
  }), [flatNodes, virtualizer]);

  // Determine mapping status for a node (only for target variant)
  const getMappingStatus = useCallback((path: string): MappingNodeStatus | undefined => {
    if (variant !== 'target' || !mappingStatus) return undefined;
    return mappingStatus.get(path);
  }, [variant, mappingStatus]);

  // Pre-compute sibling info for all flat nodes (using the full tree structure)
  const siblingInfoMap = useMemo(() => {
    if (!schema) return new Map<string, { posInSet: number; setSize: number }>();
    const map = new Map<string, { posInSet: number; setSize: number }>();

    function visitNodes(nodes: SchemaTreeNode[]) {
      for (let i = 0; i < nodes.length; i++) {
        map.set(nodes[i].path, { posInSet: i + 1, setSize: nodes.length });
        if (nodes[i].children.length > 0) {
          visitNodes(nodes[i].children);
        }
      }
    }
    visitNodes(schema.nodes);
    return map;
  }, [schema]);

  // Render states
  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    const message = typeof error === 'string' ? error : error.message;
    return <ErrorState message={message} onRetry={onRetry} />;
  }

  if (!schema || schema.nodes.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col">
      {/* Inferred schema banner */}
      {schema.inferred && <InferredBanner />}

      {/* Search input */}
      {searchable && (
        <SchemaSearchInput
          value={search.query}
          onChange={search.setQuery}
          onClear={search.clearSearch}
          matchCount={search.filterResult.matchCount}
          isSearchActive={search.isSearchActive}
        />
      )}

      {/* Toolbar */}
      <SchemaTreeToolbar
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        onExpandToDepth={handleExpandToDepth}
      />

      {/* Virtualized tree container */}
      <div
        ref={scrollRef}
        role="tree"
        aria-label="Schema tree"
        aria-activedescendant={keyboardNav.activeDescendantId}
        tabIndex={0}
        className="overflow-y-auto outline-none focus:ring-1 focus:ring-slate-600 rounded"
        style={{ maxHeight: `${maxHeight}px` }}
        onKeyDown={keyboardNav.handleKeyDown}
        onFocus={keyboardNav.handleFocus}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const node = flatNodes[virtualRow.index];
            const isExpanded = effectiveExpandedPaths.has(node.path);
            const siblingInfo = siblingInfoMap.get(node.path);

            return (
              <div
                key={node.path}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <SchemaTreeNodeRow
                  node={node}
                  isExpanded={isExpanded}
                  onToggle={handleToggle}
                  highlightQuery={search.isSearchActive ? search.debouncedQuery : undefined}
                  isSelected={effectiveSelectedPath === node.path}
                  isFocused={keyboardNav.focusedIndex === virtualRow.index}
                  onSelect={handleSelect}
                  mappingStatus={getMappingStatus(node.path)}
                  id={getNodeDomId(node.path)}
                  posInSet={siblingInfo?.posInSet}
                  setSize={siblingInfo?.setSize}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// State components
// ---------------------------------------------------------------------------

function LoadingState() {
  const widths = [140, 180, 120, 160, 100, 200];

  return (
    <div className="p-4 space-y-3" aria-label="Loading schema" role="status">
      <div className="flex items-center gap-2 text-slate-400 mb-4">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        <span className="text-sm">Loading schema...</span>
      </div>
      {/* Skeleton lines */}
      {widths.map((width, i) => (
        <div key={i} className="flex items-center gap-2" style={{ paddingLeft: `${(i % 3) * 20}px` }}>
          <div className="h-4 w-4 rounded bg-slate-700 animate-pulse" />
          <div
            className="h-4 rounded bg-slate-700 animate-pulse"
            style={{ width: `${width}px` }}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center" role="status">
      <FileQuestion size={40} className="text-slate-600 mb-3" aria-hidden="true" />
      <p className="text-sm text-slate-400">No fields found in schema</p>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center" role="alert">
      <AlertTriangle size={40} className="text-red-400 mb-3" aria-hidden="true" />
      <p className="text-sm text-red-300 font-medium mb-1">Failed to parse schema</p>
      <p className="text-xs text-slate-400 mb-4 max-w-sm">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

function InferredBanner() {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-950/30 border border-amber-800/30 rounded text-xs text-amber-300 mb-1">
      <AlertTriangle size={14} aria-hidden="true" />
      <span>Schema inferred from sample data</span>
    </div>
  );
}
