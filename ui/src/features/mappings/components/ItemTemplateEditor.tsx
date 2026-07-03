/**
 * ItemTemplateEditor.tsx — FS-043 T-07 / T-10 / T-11
 *
 * Item template layer for the Array Builder.
 *
 * Renders below the collection layer for map, filterMap, and mergeArrayBranches modes.
 *
 * Features:
 *   - Derives target item fields from the array target's item schema (children of the array node)
 *   - Renders a list of ItemFieldRow components
 *   - Accordion model: only one field expanded at a time
 *   - "Item fields" section header with mapped/total count badge
 *   - Object fields in the item schema render as expandable groups (leaf fields only in T-07)
 *   - Nested array fields show a "Configure nested array" button (T-10)
 *   - Item-level field paths derived from source array path in the source schema
 *   - T-11: Passes per-field validation entries to ItemFieldRow
 */

import { Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ItemFieldRow } from './ItemFieldRow';
import { createEmptyItemFieldMapping } from '../lib/array-builder-state';
import type { ItemFieldMapping, ItemTemplateState, ArrayBuilderState } from '../lib/array-builder-state';
import { getFieldValidationEntries } from '../lib/array-validation';
import type { ArrayValidationState } from '../lib/array-validation';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ItemTemplateEditorProps {
  /** The item template state to display and edit. */
  readonly itemTemplate: ItemTemplateState;
  /**
   * The target array node from the target schema.
   * Its children are the item fields to render.
   */
  readonly targetArrayNode: SchemaTreeNode | null;
  /** Parsed source schema — for source field picker in ItemFieldRow. */
  readonly parsedSourceSchema: ParsedSchema | null;
  /**
   * The source array path currently selected in the collection layer.
   * Used to derive item-level field paths from the source schema.
   */
  readonly sourceArrayPath: string;
  /** Optional item-context override paths (e.g. objectFields mode: day, value.*). */
  readonly itemContextFieldPaths?: readonly string[];
  /** Parent array source path (if nested context) for parent-scope field selection. */
  readonly parentSourceArrayPath?: string;
  /** Fires when a field mapping changes. */
  readonly onFieldMappingChange: (fieldPath: string, mapping: ItemFieldMapping) => void;
  /**
   * T-10: Fires when the user clicks "Configure nested array" for an array-type field.
   * The ArrayBuilder will swap to the nested focused panel.
   */
  readonly onEnterNestedArray?: (targetFieldPath: string) => void;
  /**
   * T-10: Map of existing nested array states (for status indicators).
   */
  readonly nestedArrayStates?: ReadonlyMap<string, ArrayBuilderState>;
  /**
   * T-10: Current nesting depth (0 = outer, 1 = one level nested).
   * At depth >= 2, nested array fields show a "use custom expression" message instead.
   */
  readonly nestingDepth?: number;
  /**
   * T-11: Validation state for this item template.
   * Used to pass per-field validation entries to ItemFieldRow.
   */
  readonly validationState?: ArrayValidationState | null;
  readonly className?: string;
}

interface RenderableField {
  readonly path: string;
  readonly fieldName: string;
  readonly type: SchemaTreeNode['type'];
  readonly isRequired: boolean;
  readonly isNestedArray: boolean;
  readonly objectLabel?: string;
}

interface ObjectGroup {
  readonly path: string;
  readonly label: string;
  readonly children: readonly RenderableField[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derives item-level field paths from the source schema for a given source array path.
 *
 * For a source array at "orders", item fields are paths like "orders[].id", "orders[].name".
 * We strip the array prefix to get just "id", "name" for use in item("id") references.
 */
function deriveItemFieldPaths(
  parsedSourceSchema: ParsedSchema | null,
  sourceArrayPath: string,
): string[] {
  if (!parsedSourceSchema || !sourceArrayPath) return [];
  const allPaths = flattenSchemaPaths(parsedSourceSchema).map((e) => e.path);

  // Scoped nested sources use internal placeholder form (e.g. __item__:employees).
  // In that case, derive children by matching any absolute path segment ending with
  // `${normalizedArrayPath}.<leaf>` and return item-relative leaf names.
  const isScopedItemPath = sourceArrayPath.startsWith('__item__:');
  const normalizedArrayPath = isScopedItemPath
    ? sourceArrayPath.slice('__item__:'.length)
    : sourceArrayPath.startsWith('__source__:')
      ? sourceArrayPath.slice('__source__:'.length)
      : sourceArrayPath;

  const uniqueLeafs = new Set<string>();

  if (isScopedItemPath) {
    const infix = `.${normalizedArrayPath}.`;
    for (const path of allPaths) {
      const index = path.indexOf(infix);
      const offset = index >= 0
        ? index + infix.length
        : path.startsWith(`${normalizedArrayPath}.`)
          ? normalizedArrayPath.length + 1
          : -1;
      if (offset < 0) continue;
      const remainder = path.slice(offset);
      if (!remainder) continue;
      uniqueLeafs.add(remainder);
    }
    return Array.from(uniqueLeafs);
  }

  // Unscoped source arrays use absolute source schema path.
  const prefix = `${normalizedArrayPath}.`;
  for (const path of allPaths) {
    if (!path.startsWith(prefix)) continue;
    const remainder = path.slice(prefix.length);
    if (!remainder) continue;
    uniqueLeafs.add(remainder);
  }
  return Array.from(uniqueLeafs);
}

/**
 * Extracts leaf item fields from the target array node's children.
 * Returns only direct children that are leaf fields (not nested arrays).
 */
function getItemFields(targetArrayNode: SchemaTreeNode | null): SchemaTreeNode[] {
  if (!targetArrayNode) return [];
  return targetArrayNode.children;
}

function getRenderableFields(targetArrayNode: SchemaTreeNode | null): RenderableField[] {
  const itemFields = getItemFields(targetArrayNode);
  const renderable: RenderableField[] = [];

  for (const field of itemFields) {
    if (field.type === 'array') {
      renderable.push({
        path: field.path,
        fieldName: field.fieldName,
        type: field.type,
        isRequired: field.isRequired,
        isNestedArray: true,
      });
      continue;
    }

    if (field.type === 'object') {
      renderable.push({
        path: field.path,
        fieldName: field.fieldName,
        type: field.type,
        isRequired: field.isRequired,
        isNestedArray: false,
      });

      for (const child of field.children) {
        renderable.push({
          path: child.path,
          fieldName: child.fieldName,
          type: child.type,
          isRequired: child.isRequired,
          isNestedArray: child.type === 'array',
          objectLabel: field.fieldName,
        });
      }
      continue;
    }

    renderable.push({
      path: field.path,
      fieldName: field.fieldName,
      type: field.type,
      isRequired: field.isRequired,
      isNestedArray: false,
    });
  }

  return renderable;
}

function getObjectGroups(targetArrayNode: SchemaTreeNode | null): ObjectGroup[] {
  if (!targetArrayNode) return [];

  const groups: ObjectGroup[] = [];
  for (const field of targetArrayNode.children) {
    if (field.type !== 'object') continue;
    const children: RenderableField[] = field.children.map((child) => ({
      path: child.path,
      fieldName: child.fieldName,
      type: child.type,
      isRequired: child.isRequired,
      isNestedArray: child.type === 'array',
      objectLabel: field.fieldName,
    }));
    groups.push({
      path: field.path,
      label: field.fieldName,
      children,
    });
  }
  return groups;
}

function deriveParentFieldPaths(
  parsedSourceSchema: ParsedSchema | null,
  parentSourceArrayPath: string,
): string[] {
  if (!parsedSourceSchema || !parentSourceArrayPath) return [];

  const normalized = parentSourceArrayPath.startsWith('__item__:')
    ? parentSourceArrayPath.slice('__item__:'.length)
    : parentSourceArrayPath.startsWith('__source__:')
      ? parentSourceArrayPath.slice('__source__:'.length)
      : parentSourceArrayPath;

  const allPaths = flattenSchemaPaths(parsedSourceSchema).map((e) => e.path);
  const prefix = `${normalized}.`;
  return allPaths
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length))
    .filter((path) => path.length > 0 && !path.includes('.'));
}

/**
 * Finds the current mapping for a field path in the item template.
 */
function findMapping(
  itemTemplate: ItemTemplateState,
  fieldPath: string,
): ItemFieldMapping {
  const leafKey = fieldPath.includes('.') ? fieldPath.slice(fieldPath.lastIndexOf('.') + 1) : fieldPath;
  return (
    itemTemplate.fields.find((f) => f.targetFieldPath === fieldPath)
    ?? itemTemplate.fields.find((f) => f.targetFieldPath === leafKey)
    ??
    createEmptyItemFieldMapping(fieldPath)
  );
}

// ---------------------------------------------------------------------------
// Sub-component: NestedArrayRow
// ---------------------------------------------------------------------------

function NestedArrayRow({
  field,
  hasNestedState,
  atDepthLimit,
  onEnter,
}: {
  field: SchemaTreeNode;
  hasNestedState: boolean;
  atDepthLimit: boolean;
  onEnter: (path: string) => void;
}) {
  return (
    <div
      data-testid={`item-field-nested-array-${field.path}`}
      className="flex items-center gap-2 rounded-lg border border-amber-800/40 bg-amber-950/10 px-3 py-2"
    >
      <Layers size={11} aria-hidden="true" className="shrink-0 text-amber-400" />
      <span className="shrink-0 rounded bg-amber-900/50 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
        array
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">
        {field.fieldName}
      </span>

      {atDepthLimit ? (
        <span className="shrink-0 text-[10px] text-slate-600 italic">
          Use custom expression for deeper nesting
        </span>
      ) : (
        <button
          type="button"
          data-testid={`nested-array-enter-${field.path}`}
          onClick={() => { onEnter(field.path); }}
          className={[
            'inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
            hasNestedState
              ? 'bg-amber-900/40 text-amber-300 hover:bg-amber-900/60'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600',
          ].join(' ')}
          aria-label={`Configure nested array ${field.fieldName}`}
        >
          {hasNestedState ? 'Edit nested array' : 'Configure nested array'}
          <ChevronRight size={9} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ItemTemplateEditor({
  itemTemplate,
  targetArrayNode,
  parsedSourceSchema,
  sourceArrayPath,
  itemContextFieldPaths,
  parentSourceArrayPath = '',
  onFieldMappingChange,
  onEnterNestedArray,
  nestedArrayStates,
  nestingDepth = 0,
  validationState = null,
  className = '',
}: ItemTemplateEditorProps) {
  const [expandedFieldPath, setExpandedFieldPath] = useState<string | null>(null);
  const [expandedObjectPaths, setExpandedObjectPaths] = useState<Set<string>>(new Set());

  const itemFields = useMemo(() => getRenderableFields(targetArrayNode), [targetArrayNode]);
  const objectGroups = useMemo(() => getObjectGroups(targetArrayNode), [targetArrayNode]);
  const objectGroupPathSet = useMemo(() => new Set(objectGroups.map((group) => group.path)), [objectGroups]);
  const topLevelFields = useMemo(
    () => itemFields.filter((field) => {
      if (objectGroupPathSet.has(field.path)) return true;
      const parentPath = field.path.includes('.') ? field.path.slice(0, field.path.lastIndexOf('.')) : null;
      return !(parentPath !== null && objectGroupPathSet.has(parentPath));
    }),
    [itemFields, objectGroupPathSet],
  );

  const itemFieldPaths = useMemo(() => {
    if (itemContextFieldPaths !== undefined && itemContextFieldPaths.length > 0) {
      return [...new Set(itemContextFieldPaths.map((path) => path.trim()).filter((path) => path.length > 0))];
    }
    return deriveItemFieldPaths(parsedSourceSchema, sourceArrayPath);
  }, [itemContextFieldPaths, parsedSourceSchema, sourceArrayPath]);

  const parentFieldPaths = useMemo(
    () => deriveParentFieldPaths(parsedSourceSchema, parentSourceArrayPath),
    [parsedSourceSchema, parentSourceArrayPath],
  );

  const mappedCount = useMemo(
    () => itemFields.filter((f) => {
      const mapping = findMapping(itemTemplate, f.path);
      return mapping.kind !== 'empty';
    }).length,
    [itemFields, itemTemplate],
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleToggleExpand(fieldPath: string) {
    setExpandedFieldPath((prev) => (prev === fieldPath ? null : fieldPath));
  }

  function handleEnterNestedArray(fieldPath: string) {
    onEnterNestedArray?.(fieldPath);
  }

  function handleToggleObjectGroup(path: string) {
    setExpandedObjectPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (itemFields.length === 0) {
    return (
      <div
        data-testid="item-template-editor-empty"
        className={['space-y-2', className].filter(Boolean).join(' ')}
      >
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Item fields
        </span>
        <div className="rounded-lg border border-dashed border-slate-700 px-4 py-5 text-center">
          <p className="text-xs text-slate-500">
            {targetArrayNode
              ? 'No item fields found in target schema.'
              : 'Select a source array to configure item fields.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="item-template-editor"
      className={['space-y-3', className].filter(Boolean).join(' ')}
    >
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Item fields
        </span>
        <span
          data-testid="item-template-mapped-count"
          className={[
            'rounded px-1.5 py-0.5 text-[10px] font-medium',
            mappedCount === itemFields.length
              ? 'bg-green-900/50 text-green-400'
              : 'bg-slate-700 text-slate-400',
          ].join(' ')}
        >
          {mappedCount} / {itemFields.length} mapped
        </span>
      </div>

      {/* Field list */}
      <div className="space-y-1.5">
        {topLevelFields.map((field) => {
          const objectGroup = objectGroups.find((group) => group.path === field.path);
          if (objectGroup) {
            const isExpanded = expandedObjectPaths.has(objectGroup.path);
            return (
              <div
                key={objectGroup.path}
                data-testid={`object-group-${objectGroup.path}`}
                className="rounded-lg border border-slate-700 bg-slate-800/20"
              >
                <button
                  type="button"
                  data-testid={`object-group-toggle-${objectGroup.path}`}
                  aria-expanded={isExpanded}
                  onClick={() => { handleToggleObjectGroup(objectGroup.path); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown size={11} aria-hidden="true" className="shrink-0 text-slate-400" />
                  ) : (
                    <ChevronRight size={11} aria-hidden="true" className="shrink-0 text-slate-400" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-200">{objectGroup.label}</span>
                  <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[9px] font-medium text-slate-300">object</span>
                </button>

                {isExpanded && (
                  <div className="space-y-1.5 border-t border-slate-700 px-2 pb-2 pt-2">
                    {objectGroup.children.map((child) => {
                      const childMapping = findMapping(itemTemplate, child.path);
                      return (
                        <ItemFieldRow
                          key={child.path}
                          fieldName={child.fieldName}
                          fieldPath={child.path}
                          fieldType={child.type}
                          isRequired={child.isRequired}
                          isExpanded={expandedFieldPath === child.path}
                          mapping={childMapping}
                          parsedSourceSchema={parsedSourceSchema}
                          itemFieldPaths={itemFieldPaths}
                          parentFieldPaths={parentFieldPaths}
                          hasParentScope={nestingDepth >= 1}
                          validationEntries={validationState ? getFieldValidationEntries(validationState, child.path) : []}
                          onToggleExpand={handleToggleExpand}
                          onMappingChange={onFieldMappingChange}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const mapping = findMapping(itemTemplate, field.path);
          const isNestedArray = field.isNestedArray;

          // Nested array fields — T-10 entry point
          if (isNestedArray) {
            const nestedLeafKey = field.path.includes('.') ? field.path.slice(field.path.lastIndexOf('.') + 1) : field.path;
            const hasNestedState = (nestedArrayStates?.has(field.path) ?? false)
              || (nestedArrayStates?.has(nestedLeafKey) ?? false);
            const atDepthLimit = nestingDepth >= 2;
            return (
              <NestedArrayRow
                key={field.path}
                field={{
                  path: field.path,
                  fieldName: field.fieldName,
                  type: 'array',
                  depth: 0,
                  isArray: true,
                  isRequired: field.isRequired,
                  parentPath: null,
                  childCount: 0,
                  children: [],
                }}
                hasNestedState={hasNestedState}
                atDepthLimit={atDepthLimit}
                onEnter={handleEnterNestedArray}
              />
            );
          }

          return (
            <ItemFieldRow
              key={field.path}
              fieldName={field.fieldName}
              fieldPath={field.path}
              fieldType={field.type}
              isRequired={field.isRequired}
              isExpanded={expandedFieldPath === field.path}
              mapping={mapping}
              parsedSourceSchema={parsedSourceSchema}
              itemFieldPaths={itemFieldPaths}
              parentFieldPaths={parentFieldPaths}
              hasParentScope={nestingDepth >= 1}
              validationEntries={validationState ? getFieldValidationEntries(validationState, field.path) : []}
              onToggleExpand={handleToggleExpand}
              onMappingChange={onFieldMappingChange}
            />
          );
        })}
      </div>
    </div>
  );
}
