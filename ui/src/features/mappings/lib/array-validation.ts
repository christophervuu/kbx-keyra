/**
 * array-validation.ts — FS-043 T-11
 *
 * Multi-level array-specific validation model.
 *
 * Key design principle (AE-10):
 *   Incomplete ≠ Invalid.
 *   - 'incomplete' severity: the user hasn't finished yet (muted/gray UI).
 *   - 'warning' severity: something is unusual but not blocking.
 *   - 'error' severity: a genuine problem (type mismatch, source not found, etc.).
 *
 * Validation levels:
 *   1. collection — source array path, filter predicate, merge branches
 *   2. item       — required target fields present, nested array validity
 *   3. leaf       — per-field type compatibility
 *   4. finalOutput — generated expression parse result
 *
 * Usage:
 *   const validation = deriveArrayValidation(state, parsedSourceSchema, parsedTargetSchema, targetArrayNode);
 */

import type {
  ArrayBuilderState,
  ItemFieldMapping,
  ItemTemplateState,
  MergeBranch,
} from './array-builder-state';
import { flattenSchemaPaths } from './autocomplete-utils';

import type { ParsedSchema, SchemaTreeNode, SchemaNodeType } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValidationSeverity = 'incomplete' | 'warning' | 'error';
export type ValidationLevel = 'collection' | 'item' | 'leaf' | 'finalOutput';

export interface ArrayValidationEntry {
  readonly level: ValidationLevel;
  /** Target field path this entry relates to (empty string for collection/final level). */
  readonly fieldPath: string;
  readonly message: string;
  readonly severity: ValidationSeverity;
}

export interface ArrayValidationState {
  readonly entries: readonly ArrayValidationEntry[];
  /** Convenience counts. */
  readonly errorCount: number;
  readonly warningCount: number;
  readonly incompleteCount: number;
  /** True when there are no errors (warnings and incomplete are allowed). */
  readonly isValid: boolean;
  /** True when there are no errors AND no incomplete entries. */
  readonly isComplete: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entry(
  level: ValidationLevel,
  fieldPath: string,
  message: string,
  severity: ValidationSeverity,
): ArrayValidationEntry {
  return { level, fieldPath, message, severity };
}

/**
 * Looks up a path in the source schema and returns its type, or null if not found.
 */
function getSourcePathType(
  parsedSourceSchema: ParsedSchema | null,
  path: string,
): string | null {
  if (!parsedSourceSchema || !path.trim()) return null;
  const entries = flattenSchemaPaths(parsedSourceSchema);
  return entries.find((e) => e.path === path)?.type ?? null;
}

/**
 * Finds a node in the target schema tree by path.
 */
function findTargetNode(
  nodes: readonly SchemaTreeNode[],
  path: string,
): SchemaTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    const found = findTargetNode(node.children, path);
    if (found) return found;
  }
  return null;
}

/**
 * Broad type-compatibility check between a source-derived type string and a target SchemaNodeType.
 * Best-effort — returns false only when there is a clear mismatch.
 */
function isTypeCompatible(sourceType: string | null, targetType: SchemaNodeType): boolean {
  if (sourceType === null) return true; // unknown — assume compatible
  if (sourceType === targetType) return true;
  // number ↔ integer are compatible
  if ((sourceType === 'number' || sourceType === 'integer') &&
      (targetType === 'number' || targetType === 'integer')) return true;
  // any string-like
  if (sourceType === 'string' && targetType === 'string') return true;
  // object/array are structural — skip deep check
  if (targetType === 'object' || targetType === 'array') return true;
  return false;
}

// ---------------------------------------------------------------------------
// Collection-level validation
// ---------------------------------------------------------------------------

function validateCollection(
  state: ArrayBuilderState,
  parsedSourceSchema: ParsedSchema | null,
): ArrayValidationEntry[] {
  const entries: ArrayValidationEntry[] = [];
  const { collectionState } = state;

  switch (collectionState.mode) {
    case 'map':
    case 'filterMap': {
      const { sourceArrayPath } = collectionState;
      if (!sourceArrayPath.trim()) {
        entries.push(entry('collection', '', 'No source array selected.', 'incomplete'));
      } else {
        const sourceType = getSourcePathType(parsedSourceSchema, sourceArrayPath);
        if (sourceType !== null && sourceType !== 'array') {
          entries.push(entry(
            'collection', '',
            `Source path "${sourceArrayPath}" is not an array (found: ${sourceType}).`,
            'error',
          ));
        }
      }

      if (collectionState.mode === 'filterMap') {
        const pred = collectionState.filterPredicate;
        if (pred.kind === 'structured') {
          if (!pred.left.fieldPath && pred.left.kind === 'itemField') {
            entries.push(entry('collection', '', 'Filter predicate: left operand not set.', 'incomplete'));
          }
          if (pred.right.kind === 'none' && pred.operator !== 'isNull' && pred.operator !== 'isNotNull') {
            entries.push(entry('collection', '', 'Filter predicate: right operand not set.', 'incomplete'));
          }
        } else if (pred.kind === 'raw' && !pred.dsl.trim()) {
          entries.push(entry('collection', '', 'Filter predicate: raw DSL is empty.', 'incomplete'));
        }
      }
      break;
    }

    case 'buildFromValues': {
      if (collectionState.entries.length === 0) {
        entries.push(entry('collection', '', 'No value entries defined.', 'incomplete'));
      }
      break;
    }

    case 'mergeArrayBranches': {
      const { branches } = collectionState;
      if (branches.length < 2) {
        entries.push(entry('collection', '', 'Merge requires at least 2 branches.', 'incomplete'));
      }
      branches.forEach((branch: MergeBranch, i: number) => {
        if (!branch.sourceArrayPath.trim()) {
          entries.push(entry(
            'collection', '',
            `Branch ${i + 1}: no source array selected.`,
            'incomplete',
          ));
        } else {
          const sourceType = getSourcePathType(parsedSourceSchema, branch.sourceArrayPath);
          if (sourceType !== null && sourceType !== 'array') {
            entries.push(entry(
              'collection', '',
              `Branch ${i + 1}: source "${branch.sourceArrayPath}" is not an array (found: ${sourceType}).`,
              'error',
            ));
          }
        }
      });
      break;
    }

    case 'customExpression': {
      if (!collectionState.rawExpression.trim()) {
        entries.push(entry('collection', '', 'Custom expression is empty.', 'incomplete'));
      }
      break;
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Item-template validation
// ---------------------------------------------------------------------------

function validateItemTemplate(
  itemTemplate: ItemTemplateState,
  targetArrayNode: SchemaTreeNode | null,
): ArrayValidationEntry[] {
  const entries: ArrayValidationEntry[] = [];
  if (!targetArrayNode) return entries;

  for (const field of targetArrayNode.children) {
    if (field.type === 'array') continue; // nested arrays validated separately

    const mapping = itemTemplate.fields.find((f) => f.targetFieldPath === field.path);
    const isMapped = mapping !== undefined && mapping.kind !== 'empty';

    if (!isMapped && field.isRequired) {
      entries.push(entry(
        'item', field.path,
        `Required field "${field.fieldName}" is not mapped.`,
        'incomplete',
      ));
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Leaf-output validation
// ---------------------------------------------------------------------------

/**
 * Infers the output type of an ItemFieldMapping.
 * Returns null when the type cannot be determined statically.
 */
function inferMappingOutputType(
  mapping: ItemFieldMapping,
  parsedSourceSchema: ParsedSchema | null,
): string | null {
  if (mapping.kind === 'empty') return null;
  if (mapping.kind === 'expression') return null;

  if (mapping.kind === 'crossArrayLookup') {
    // Return field type from the lookup array — best-effort
    const { lookupArrayPath, returnField } = mapping.lookupState;
    if (!lookupArrayPath || !returnField) return null;
    const fullPath = `${lookupArrayPath}.${returnField}`;
    return getSourcePathType(parsedSourceSchema, fullPath);
  }

  // chain kind
  const { source } = mapping.chainState;
  if (source.kind === 'static') {
    const v = source.value;
    return v.type; // 'string' | 'number' | 'boolean' | 'null'
  }
  if (source.kind === 'field') {
    // Strip scope prefix to get the actual field path
    let fieldPath = source.path;
    if (fieldPath.startsWith('__item__:')) fieldPath = fieldPath.slice('__item__:'.length);
    else if (fieldPath.startsWith('__source__:')) fieldPath = fieldPath.slice('__source__:'.length);
    return getSourcePathType(parsedSourceSchema, fieldPath);
  }
  return null;
}

function validateLeafOutputs(
  itemTemplate: ItemTemplateState,
  targetArrayNode: SchemaTreeNode | null,
  parsedSourceSchema: ParsedSchema | null,
): ArrayValidationEntry[] {
  const entries: ArrayValidationEntry[] = [];
  if (!targetArrayNode) return entries;

  for (const mapping of itemTemplate.fields) {
    if (mapping.kind === 'empty') continue;

    const targetNode = findTargetNode(targetArrayNode.children, mapping.targetFieldPath);
    if (!targetNode) continue;

    const outputType = inferMappingOutputType(mapping, parsedSourceSchema);
    if (outputType !== null && !isTypeCompatible(outputType, targetNode.type)) {
      entries.push(entry(
        'leaf', mapping.targetFieldPath,
        `Type mismatch: expression produces "${outputType}" but target field "${targetNode.fieldName}" expects "${targetNode.type}".`,
        'error',
      ));
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Final-output validation
// ---------------------------------------------------------------------------

function validateFinalOutput(
  expression: string,
): ArrayValidationEntry[] {
  const entries: ArrayValidationEntry[] = [];
  if (!expression.trim()) {
    entries.push(entry('finalOutput', '', 'No expression generated.', 'incomplete'));
  }
  // Note: engine parse validation is handled by useDslValidation in ArrayBuilder.
  // This layer only checks for empty expression.
  return entries;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Derives the full multi-level validation state for an ArrayBuilderState.
 *
 * @param state              The current array builder state.
 * @param expression         The generated DSL expression (from generateArrayExpression).
 * @param parsedSourceSchema Parsed source schema for type lookups.
 * @param targetArrayNode    The target array's SchemaTreeNode (for item field validation).
 */
export function deriveArrayValidation(
  state: ArrayBuilderState,
  expression: string,
  parsedSourceSchema: ParsedSchema | null,
  targetArrayNode: SchemaTreeNode | null,
): ArrayValidationState {
  const allEntries: ArrayValidationEntry[] = [
    ...validateCollection(state, parsedSourceSchema),
    ...validateItemTemplate(state.itemTemplate, targetArrayNode),
    ...validateLeafOutputs(state.itemTemplate, targetArrayNode, parsedSourceSchema),
    ...validateFinalOutput(expression),
  ];

  const errorCount = allEntries.filter((e) => e.severity === 'error').length;
  const warningCount = allEntries.filter((e) => e.severity === 'warning').length;
  const incompleteCount = allEntries.filter((e) => e.severity === 'incomplete').length;

  return {
    entries: allEntries,
    errorCount,
    warningCount,
    incompleteCount,
    isValid: errorCount === 0,
    isComplete: errorCount === 0 && incompleteCount === 0,
  };
}

/**
 * Returns the validation entries for a specific field path.
 */
export function getFieldValidationEntries(
  validation: ArrayValidationState,
  fieldPath: string,
): readonly ArrayValidationEntry[] {
  return validation.entries.filter((e) => e.fieldPath === fieldPath);
}
