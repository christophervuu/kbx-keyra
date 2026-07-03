import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { parseJsonSchema } from '../lib';
import {
  addArrayField,
  addField,
  addNestedObject,
  changeType,
  removeField,
  renameField,
  toggleRequired,
  updateDescription,
} from '../lib/schema-editor-ops';
import { countAllNodes, treeToJsonSchema } from '../lib/tree-to-json-schema';
import type { EditNodeCallbacks } from '../types';

import { useAdapter } from '@/lib/api';
import { cancelSchemaDetailReads, invalidateSchemaDependents } from '@/lib/query';
import type { ParsedSchema, SchemaNodeType, SchemaTreeNode } from '@/lib/types';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseSchemaEditorResult {
  /** Whether the tree is in edit mode */
  isEditing: boolean;
  /** Local copy of nodes being edited (mirrors parsedSchema.nodes when editing starts) */
  editedNodes: SchemaTreeNode[];
  /**
   * A synthetic ParsedSchema using editedNodes — pass this to SchemaTreeView
   * when isEditing is true so the tree reflects live edits.
   */
  editedParsedSchema: ParsedSchema | null;
  /** True when local nodes differ from the original parsed schema nodes */
  isDirty: boolean;
  /** Enter edit mode: snapshots parsedSchema.nodes into local state */
  startEditing: () => void;
  /** Exit edit mode: discard all local edits */
  cancelEditing: () => void;
  /**
   * Save: reconstruct JSON Schema from editedNodes, persist via adapter,
   * re-parse and call onSaved with the fresh ParsedSchema, then exit edit mode.
   */
  saveEdits: () => Promise<void>;
  /** Callback object to pass as `onNodeEdit` to SchemaTreeView */
  editCallbacks: EditNodeCallbacks;
  /** Save changes for a single selected field */
  saveFieldEdits: (path: string, updates: {
    name: string;
    description: string;
    type: SchemaNodeType;
    isRequired: boolean;
  }) => Promise<void>;
  /** Add a new root-level field and persist immediately */
  addRootField: () => Promise<void>;
}

function findNodeByPath(nodes: SchemaTreeNode[], path: string): SchemaTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children.length > 0) {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages edit-mode state and all inline tree editing operations for the
 * Schema Detail page.
 *
 * @param parsedSchema  Current parsed schema (read from useSchemaDetail).
 * @param schemaId      Schema ID used when persisting via the adapter.
 * @param originalContent  Raw schema content — used to preserve $schema/$id
 *                         and other non-structural top-level keys on save.
 * @param onSaved       Called after a successful save with the refreshed
 *                      ParsedSchema (allows the page to update its state).
 */
export function useSchemaEditor(
  parsedSchema: ParsedSchema | null,
  schemaId: string,
  originalContent: Record<string, unknown> | string | null,
  onSaved: (refreshed: ParsedSchema) => void,
): UseSchemaEditorResult {
  const adapter = useAdapter();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [editedNodes, setEditedNodes] = useState<SchemaTreeNode[]>([]);

  // ---- Edit mode entry / exit ----

  const startEditing = useCallback(() => {
    if (!parsedSchema) return;
    setEditedNodes(parsedSchema.nodes.slice());
    setIsEditing(true);
  }, [parsedSchema]);

  const cancelEditing = useCallback(() => {
    setEditedNodes([]);
    setIsEditing(false);
  }, []);

  // ---- Save flow ----

  const saveEdits = useCallback(async () => {
    if (!isEditing) return;

    const rawContent = treeToJsonSchema(
      editedNodes,
      originalContent ?? undefined,
    );
    const fieldCount = countAllNodes(editedNodes);

    await cancelSchemaDetailReads(queryClient, schemaId);
    await adapter.updateSchema(schemaId, { content: rawContent, fieldCount });

    // Re-parse so the tree immediately reflects the persisted state
    let refreshed: ParsedSchema | null = null;
    try {
      refreshed = parseJsonSchema(rawContent);
    } catch {
      // Non-fatal — caller can fall back to editedNodes
    }

    setIsEditing(false);
    setEditedNodes([]);

    if (refreshed) {
      onSaved(refreshed);
    }

    invalidateSchemaDependents(queryClient, schemaId);
  }, [isEditing, editedNodes, originalContent, adapter, onSaved, queryClient, schemaId]);

  const persistNodes = useCallback(async (nodesToPersist: SchemaTreeNode[]) => {
    const rawContent = treeToJsonSchema(
      nodesToPersist,
      originalContent ?? undefined,
    );
    const fieldCount = countAllNodes(nodesToPersist);

    await cancelSchemaDetailReads(queryClient, schemaId);
    await adapter.updateSchema(schemaId, { content: rawContent, fieldCount });

    let refreshed: ParsedSchema | null = null;
    try {
      refreshed = parseJsonSchema(rawContent);
    } catch {
      refreshed = null;
    }

    setIsEditing(false);
    setEditedNodes([]);

    if (refreshed) {
      onSaved(refreshed);
    }

    invalidateSchemaDependents(queryClient, schemaId);
  }, [adapter, onSaved, originalContent, queryClient, schemaId]);

  const saveFieldEdits = useCallback(async (
    path: string,
    updates: { name: string; description: string; type: SchemaNodeType; isRequired: boolean },
  ) => {
    const baseNodes = (isEditing ? editedNodes : parsedSchema?.nodes) ?? [];
    if (baseNodes.length === 0) return;

    const currentNode = findNodeByPath(baseNodes, path);
    if (!currentNode) return;

    let nextNodes = baseNodes;

    if (updates.type !== currentNode.type) {
      nextNodes = changeType(nextNodes, path, updates.type);
    }

    if (updates.isRequired !== currentNode.isRequired) {
      nextNodes = toggleRequired(nextNodes, path);
    }

    const currentDescription = (currentNode.description ?? '').trim();
    const nextDescription = updates.description.trim();
    if (currentDescription !== nextDescription) {
      nextNodes = updateDescription(nextNodes, path, updates.description);
    }

    const nextName = updates.name.trim();
    if (nextName && nextName !== currentNode.fieldName) {
      nextNodes = renameField(nextNodes, path, nextName);
    }

    await persistNodes(nextNodes);
  }, [editedNodes, isEditing, parsedSchema?.nodes, persistNodes]);

  const addRootField = useCallback(async () => {
    const baseNodes = (isEditing ? editedNodes : parsedSchema?.nodes) ?? [];
    const nextNodes = addField(baseNodes, null, 'newField', 'string');
    await persistNodes(nextNodes);
  }, [editedNodes, isEditing, parsedSchema?.nodes, persistNodes]);

  // ---- Tree operation dispatchers ----

  const editCallbacks = useMemo<EditNodeCallbacks>(
    () => ({
      onToggleRequired: (path) =>
        setEditedNodes((prev) => toggleRequired(prev, path)),

      onChangeType: (path, newType: SchemaNodeType) =>
        setEditedNodes((prev) => changeType(prev, path, newType)),

      onRenameField: (path, newName) =>
        setEditedNodes((prev) => renameField(prev, path, newName)),

      onUpdateDescription: (path, description) =>
        setEditedNodes((prev) => updateDescription(prev, path, description)),

      onAddField: (parentPath) =>
        setEditedNodes((prev) =>
          addField(prev, parentPath, 'newField', 'string'),
        ),

      onRemoveField: (path) =>
        setEditedNodes((prev) => removeField(prev, path)),

      onAddNestedObject: (parentPath) =>
        setEditedNodes((prev) =>
          addNestedObject(prev, parentPath, 'newObject'),
        ),

      onAddArrayField: (parentPath) =>
        setEditedNodes((prev) => addArrayField(prev, parentPath, 'newArray')),
    }),
    [],
  );

  // ---- Derived state ----

  const isDirty = useMemo(() => {
    if (!isEditing || !parsedSchema) return false;
    return JSON.stringify(editedNodes) !== JSON.stringify(parsedSchema.nodes);
  }, [isEditing, editedNodes, parsedSchema]);

  const editedParsedSchema = useMemo<ParsedSchema | null>(() => {
    if (!isEditing || !parsedSchema) return null;
    return {
      ...parsedSchema,
      nodes: editedNodes,
      totalFieldCount: countAllNodes(editedNodes),
    };
  }, [isEditing, parsedSchema, editedNodes]);

  return {
    isEditing,
    editedNodes,
    editedParsedSchema,
    isDirty,
    startEditing,
    cancelEditing,
    saveEdits,
    editCallbacks,
    saveFieldEdits,
    addRootField,
  };
}
