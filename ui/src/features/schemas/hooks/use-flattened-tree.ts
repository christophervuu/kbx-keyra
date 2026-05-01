import { useMemo } from 'react';

import type { SchemaTreeNode } from '@/lib/types';

/**
 * Computes a flattened array of visible tree nodes based on expand state.
 * Performs a DFS traversal, only including nodes whose ancestors are all expanded.
 * This flat list is the input to the virtualizer.
 */
export function useFlattenedTree(
  nodes: SchemaTreeNode[],
  expandedPaths: Set<string>,
): SchemaTreeNode[] {
  return useMemo(() => flattenTree(nodes, expandedPaths), [nodes, expandedPaths]);
}

/**
 * Pure function: DFS traversal producing a flat array of visible nodes.
 * Exported for unit testing and non-hook contexts.
 */
export function flattenTree(
  nodes: SchemaTreeNode[],
  expandedPaths: Set<string>,
): SchemaTreeNode[] {
  const result: SchemaTreeNode[] = [];

  function visit(nodeList: SchemaTreeNode[]) {
    for (const node of nodeList) {
      result.push(node);
      if (node.children.length > 0 && expandedPaths.has(node.path)) {
        visit(node.children);
      }
    }
  }

  visit(nodes);
  return result;
}
