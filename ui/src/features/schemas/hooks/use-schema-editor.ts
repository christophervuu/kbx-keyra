import { useCallback, useMemo, useState } from 'react';

import { useAdapter } from '@/lib/api';
import type { ParsedSchema, SchemaNodeType, SchemaTreeNode } from '@/lib/types';

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
import { parseJsonSchema } from '../lib';
import type { EditNodeCallbacks } from '../types';

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
  }, [isEditing, editedNodes, originalContent, adapter, schemaId, onSaved]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  };
}
