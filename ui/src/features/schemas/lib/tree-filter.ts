import type { SchemaTreeNode } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TreeFilterResult {
  /** Paths of nodes whose fieldName matches the query */
  matchingPaths: Set<string>;
  /** Matching paths + all ancestor paths (to maintain tree structure) */
  visiblePaths: Set<string>;
  /** Total number of matching nodes */
  matchCount: number;
}

// ---------------------------------------------------------------------------
// Filter function
// ---------------------------------------------------------------------------

/**
 * Pure function that filters a tree of SchemaTreeNodes by case-insensitive
 * substring match on fieldName. Returns the set of matching paths, the set
 * of paths that should be visible (matches + ancestors), and the match count.
 *
 * Performance: traverses all nodes once in O(n). For 23,000 nodes this
 * completes well within 300ms.
 */
export function filterTree(
  nodes: SchemaTreeNode[],
  query: string,
): TreeFilterResult {
  if (!query.trim()) {
    return { matchingPaths: new Set(), visiblePaths: new Set(), matchCount: 0 };
  }

  const lowerQuery = query.toLowerCase();
  const matchingPaths = new Set<string>();
  const visiblePaths = new Set<string>();

  function visit(nodeList: SchemaTreeNode[]): boolean {
    let hasMatch = false;

    for (const node of nodeList) {
      const fieldMatches = node.fieldName.toLowerCase().includes(lowerQuery);
      let childHasMatch = false;

      if (node.children.length > 0) {
        childHasMatch = visit(node.children);
      }

      if (fieldMatches) {
        matchingPaths.add(node.path);
        visiblePaths.add(node.path);
        hasMatch = true;
      }

      if (childHasMatch) {
        // This node is an ancestor of a match — must be visible
        visiblePaths.add(node.path);
        hasMatch = true;
      }
    }

    return hasMatch;
  }

  visit(nodes);

  return {
    matchingPaths,
    visiblePaths,
    matchCount: matchingPaths.size,
  };
}
