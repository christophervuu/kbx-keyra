/**
 * Pure, immutable tree manipulation functions for the schema editor.
 *
 * All functions return a new tree (no mutation). Callers should store the
 * result in state (e.g. via `useSchemaEditor`).
 *
 * Assumptions:
 * - `nodes` is the top-level array of a nested `SchemaTreeNode[]` tree.
 * - Each node has `children: SchemaTreeNode[]` and `childCount: number`.
 * - `path` is a dot-separated string that uniquely identifies a node.
 */

import type { SchemaNodeType, SchemaTreeNode } from '@/lib/types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Recursively map over every node; fn is applied to matched nodes. */
function mapTree(
  nodes: SchemaTreeNode[],
  fn: (node: SchemaTreeNode) => SchemaTreeNode,
): SchemaTreeNode[] {
  return nodes.map((node) => {
    const next = fn(node);
    return { ...next, children: mapTree(next.children, fn) };
  });
}

/** Replace a path prefix in a subtree (used after a rename). */
function rewritePaths(
  nodes: SchemaTreeNode[],
  oldPrefix: string,
  newPrefix: string,
): SchemaTreeNode[] {
  return nodes.map((node) => {
    const updatedPath =
      node.path === oldPrefix
        ? newPrefix
        : node.path.startsWith(oldPrefix + '.')
          ? newPrefix + node.path.slice(oldPrefix.length)
          : node.path;

    const updatedParentPath =
      node.parentPath === null
        ? null
        : node.parentPath === oldPrefix
          ? newPrefix
          : node.parentPath.startsWith(oldPrefix + '.')
            ? newPrefix + node.parentPath.slice(oldPrefix.length)
            : node.parentPath;

    return {
      ...node,
      path: updatedPath,
      parentPath: updatedParentPath,
      children: rewritePaths(node.children, oldPrefix, newPrefix),
    };
  });
}

// ---------------------------------------------------------------------------
// Exported operations
// ---------------------------------------------------------------------------

/**
 * Toggle the `isRequired` flag on the node at `path`.
 */
export function toggleRequired(nodes: SchemaTreeNode[], path: string): SchemaTreeNode[] {
  return mapTree(nodes, (node) =>
    node.path === path ? { ...node, isRequired: !node.isRequired } : node,
  );
}

/**
 * Change the `type` of the node at `path`.
 *
 * - Changing to a scalar type (string, number, boolean, null, any) clears children.
 * - Changing between object/array preserves children but updates `isArray`.
 */
export function changeType(
  nodes: SchemaTreeNode[],
  path: string,
  newType: SchemaNodeType,
): SchemaTreeNode[] {
  return mapTree(nodes, (node) => {
    if (node.path !== path) return node;

    const isContainer = newType === 'object' || newType === 'array';
    const isArray = newType === 'array';

    if (!isContainer) {
      // Scalar type — drop children
      return { ...node, type: newType, isArray: false, children: [], childCount: 0 };
    }

    // Container type — preserve existing children
    return { ...node, type: newType, isArray };
  });
}

/**
 * Rename the field at `path` to `newName`.
 *
 * Updates the node's `fieldName` and `path`, and rewrites all descendant
 * `path` / `parentPath` values that start with the old path.
 */
export function renameField(
  nodes: SchemaTreeNode[],
  path: string,
  newName: string,
): SchemaTreeNode[] {
  return nodes.map((node) => {
    if (node.path === path) {
      const newPath = node.parentPath ? `${node.parentPath}.${newName}` : newName;
      const updatedChildren = rewritePaths(node.children, path, newPath);
      return { ...node, fieldName: newName, path: newPath, children: updatedChildren };
    }

    if (node.children.length > 0) {
      return { ...node, children: renameField(node.children, path, newName) };
    }

    return node;
  });
}

/**
 * Set (or clear) the `description` on the node at `path`.
 */
export function updateDescription(
  nodes: SchemaTreeNode[],
  path: string,
  description: string,
): SchemaTreeNode[] {
  return mapTree(nodes, (node) =>
    node.path === path
      ? { ...node, description: description.trim() || undefined }
      : node,
  );
}

/**
 * Add a new scalar/container field as a child of `parentPath`.
 *
 * Pass `parentPath = null` to append at the root level.
 * The new node has `isRequired = false` by default.
 */
export function addField(
  nodes: SchemaTreeNode[],
  parentPath: string | null,
  fieldName: string,
  type: SchemaNodeType = 'string',
): SchemaTreeNode[] {
  const newPath = parentPath ? `${parentPath}.${fieldName}` : fieldName;
  const depth = parentPath ? parentPath.split('.').length : 0;

  const newNode: SchemaTreeNode = {
    path: newPath,
    fieldName,
    type,
    depth,
    isArray: type === 'array',
    isRequired: false,
    parentPath,
    childCount: 0,
    children: [],
  };

  if (parentPath === null) {
    return [...nodes, newNode];
  }

  return nodes.map((node) => {
    if (node.path === parentPath) {
      return {
        ...node,
        children: [...node.children, newNode],
        childCount: node.childCount + 1,
      };
    }
    if (node.children.length > 0) {
      return { ...node, children: addField(node.children, parentPath, fieldName, type) };
    }
    return node;
  });
}

/**
 * Remove the node at `path` and all its descendants.
 *
 * Also updates `childCount` on the direct parent.
 */
export function removeField(nodes: SchemaTreeNode[], path: string): SchemaTreeNode[] {
  return nodes
    .filter((node) => node.path !== path)
    .map((node) => {
      if (node.children.length === 0) return node;
      const newChildren = removeField(node.children, path);
      return { ...node, children: newChildren, childCount: newChildren.length };
    });
}

/**
 * Add a nested object field with one placeholder child (`newField: string`).
 */
export function addNestedObject(
  nodes: SchemaTreeNode[],
  parentPath: string | null,
  objectName: string,
): SchemaTreeNode[] {
  const withObject = addField(nodes, parentPath, objectName, 'object');
  const objectPath = parentPath ? `${parentPath}.${objectName}` : objectName;
  return addField(withObject, objectPath, 'newField', 'string');
}

/**
 * Add an array field. Items default to `string` (no explicit child nodes).
 */
export function addArrayField(
  nodes: SchemaTreeNode[],
  parentPath: string | null,
  arrayName: string,
): SchemaTreeNode[] {
  return addField(nodes, parentPath, arrayName, 'array');
}
