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

import { Layers, ChevronRight } from 'lucide-react';
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
  // Find paths that are children of the source array
  const prefix = sourceArrayPath + '.';
  const childPaths = allPaths
    .filter((p) => p.startsWith(prefix))
    .map((p) => p.slice(prefix.length))
    .filter((p) => !p.includes('.')); // leaf fields only (no nested objects)
  return childPaths;
}

/**
 * Extracts leaf item fields from the target array node's children.
 * Returns only direct children that are leaf fields (not nested arrays).
 */
function getItemFields(targetArrayNode: SchemaTreeNode | null): SchemaTreeNode[] {
  if (!targetArrayNode) return [];
  return targetArrayNode.children;
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
  onFieldMappingChange,
  onEnterNestedArray,
  nestedArrayStates,
  nestingDepth = 0,
  validationState = null,
  className = '',
}: ItemTemplateEditorProps) {
  const [expandedFieldPath, setExpandedFieldPath] = useState<string | null>(null);

  const itemFields = useMemo(() => getItemFields(targetArrayNode), [targetArrayNode]);

  const itemFieldPaths = useMemo(
    () => deriveItemFieldPaths(parsedSourceSchema, sourceArrayPath),
    [parsedSourceSchema, sourceArrayPath],
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
        {itemFields.map((field) => {
          const mapping = findMapping(itemTemplate, field.path);
          const isNestedArray = field.type === 'array';

          // Nested array fields — T-10 entry point
          if (isNestedArray) {
            const nestedLeafKey = field.path.includes('.') ? field.path.slice(field.path.lastIndexOf('.') + 1) : field.path;
            const hasNestedState = (nestedArrayStates?.has(field.path) ?? false)
              || (nestedArrayStates?.has(nestedLeafKey) ?? false);
            const atDepthLimit = nestingDepth >= 2;
            return (
              <NestedArrayRow
                key={field.path}
                field={field}
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
