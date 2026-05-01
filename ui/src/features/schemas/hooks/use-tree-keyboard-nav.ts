import type { KeyboardEvent } from 'react';
import { useCallback, useState } from 'react';

import type { SchemaTreeNode } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseTreeKeyboardNavOptions {
  /** The flat list of currently visible nodes (respects expand + search state) */
  flatNodes: SchemaTreeNode[];
  /** Current expanded paths */
  expandedPaths: Set<string>;
  /** Toggle expand/collapse for a path */
  onToggle: (path: string) => void;
  /** Select a node */
  onSelect: (node: SchemaTreeNode) => void;
  /** Scroll a node into view by index */
  scrollToIndex: (index: number) => void;
}

export interface UseTreeKeyboardNavReturn {
  /** Currently focused index in the flat node list (-1 = none) */
  focusedIndex: number;
  /** Set focused index externally (e.g., on initial focus) */
  setFocusedIndex: (index: number) => void;
  /** The DOM ID for a node at a given path */
  getNodeId: (path: string) => string;
  /** The active descendant DOM ID (or undefined if no focus) */
  activeDescendantId: string | undefined;
  /** Key down handler to attach to the tree container */
  handleKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  /** Handler for when tree container receives focus */
  handleFocus: () => void;
}

// ---------------------------------------------------------------------------
// Utility: generate stable DOM ID for a node path
// ---------------------------------------------------------------------------

export function getNodeDomId(path: string): string {
  return `schema-tree-node-${path.replace(/\./g, '-')}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTreeKeyboardNav({
  flatNodes,
  expandedPaths,
  onToggle,
  onSelect,
  scrollToIndex,
}: UseTreeKeyboardNavOptions): UseTreeKeyboardNavReturn {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const getNodeId = useCallback((path: string) => getNodeDomId(path), []);

  const activeDescendantId = focusedIndex >= 0 && focusedIndex < flatNodes.length
    ? getNodeDomId(flatNodes[focusedIndex].path)
    : undefined;

  const moveFocus = useCallback((newIndex: number) => {
    const clamped = Math.max(0, Math.min(newIndex, flatNodes.length - 1));
    setFocusedIndex(clamped);
    scrollToIndex(clamped);
  }, [flatNodes.length, scrollToIndex]);

  const handleFocus = useCallback(() => {
    // If no node is focused yet, focus the first one
    if (focusedIndex < 0 && flatNodes.length > 0) {
      setFocusedIndex(0);
    }
  }, [focusedIndex, flatNodes.length]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (flatNodes.length === 0) return;

    const currentIndex = focusedIndex < 0 ? 0 : focusedIndex;
    const currentNode = flatNodes[currentIndex];

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        moveFocus(currentIndex + 1);
        break;
      }

      case 'ArrowUp': {
        e.preventDefault();
        moveFocus(currentIndex - 1);
        break;
      }

      case 'ArrowRight': {
        e.preventDefault();
        if (!currentNode) break;
        if (currentNode.childCount > 0 && !expandedPaths.has(currentNode.path)) {
          // Collapsed expandable → expand
          onToggle(currentNode.path);
        } else if (currentNode.childCount > 0 && expandedPaths.has(currentNode.path)) {
          // Expanded → move to first child
          moveFocus(currentIndex + 1);
        }
        // Leaf → no action
        break;
      }

      case 'ArrowLeft': {
        e.preventDefault();
        if (!currentNode) break;
        if (currentNode.childCount > 0 && expandedPaths.has(currentNode.path)) {
          // Expanded → collapse
          onToggle(currentNode.path);
        } else {
          // Collapsed or leaf → move to parent
          const parentPath = currentNode.parentPath;
          if (parentPath) {
            const parentIndex = flatNodes.findIndex((n) => n.path === parentPath);
            if (parentIndex >= 0) {
              moveFocus(parentIndex);
            }
          }
        }
        break;
      }

      case 'Home': {
        e.preventDefault();
        moveFocus(0);
        break;
      }

      case 'End': {
        e.preventDefault();
        moveFocus(flatNodes.length - 1);
        break;
      }

      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (!currentNode) break;
        // Select the node
        onSelect(currentNode);
        // Also toggle expand if expandable
        if (currentNode.childCount > 0) {
          onToggle(currentNode.path);
        }
        break;
      }

      default:
        // No action for other keys
        break;
    }
  }, [flatNodes, focusedIndex, expandedPaths, moveFocus, onToggle, onSelect]);

  return {
    focusedIndex,
    setFocusedIndex,
    getNodeId,
    activeDescendantId,
    handleKeyDown,
    handleFocus,
  };
}
