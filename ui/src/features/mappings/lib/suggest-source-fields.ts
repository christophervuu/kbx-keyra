/**
 * suggestSourceFields — client-side heuristic source field suggestions.
 *
 * Given a target field path + type and a parsed source schema, returns up to
 * `maxResults` (default 5) suggested source field paths ordered by match strength.
 *
 * Matching priority (highest → lowest):
 *   1. Exact name match:        target last segment === source last segment (case-sensitive)
 *   2. Case-insensitive match:  same comparison, case-insensitive
 *   3. Contains match:          source last segment contains target last segment (case-insensitive)
 *
 * Type compatibility filter:
 *   Applied on top of name matching. Source fields whose type is incompatible
 *   with the target type are excluded. Compatible pairs:
 *     - Same type is always compatible.
 *     - 'integer' ↔ 'number' are mutually compatible.
 *     - 'any' source is compatible with any target.
 *     - 'string' target accepts 'enum' source.
 *
 * Phase 2 note: the returned `SuggestedField` shape includes a `matchKind`
 * field so the UI can render an "AI suggested" group alongside heuristic
 * suggestions in the future.
 */

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';
import type { TargetFieldType } from '../components/TargetFieldRow';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MatchKind = 'exact' | 'case-insensitive' | 'contains';

export interface SuggestedField {
  /** Full dot-path of the source field */
  readonly path: string;
  /** Display name (last path segment) */
  readonly fieldName: string;
  /** Source field type */
  readonly type: string;
  /** How the match was determined */
  readonly matchKind: MatchKind;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the last segment of a dot-path. */
function lastName(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1];
}

/**
 * Returns true if the source type is compatible with the target type.
 */
function isTypeCompatible(sourceType: string, targetType: TargetFieldType): boolean {
  if (sourceType === 'any') return true;
  if (sourceType === targetType) return true;
  // integer ↔ number
  if (
    (sourceType === 'integer' && targetType === 'number') ||
    (sourceType === 'number' && targetType === 'integer')
  ) {
    return true;
  }
  // enum source → string target
  if (sourceType === 'enum' && targetType === 'string') return true;
  return false;
}

/**
 * Flattens a SchemaTreeNode tree into a flat list of leaf + intermediate nodes.
 * Skips object/array container nodes (they are not directly mappable as scalars).
 */
function flattenNodes(nodes: readonly SchemaTreeNode[]): SchemaTreeNode[] {
  const result: SchemaTreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main utility
// ---------------------------------------------------------------------------

/**
 * Returns up to `maxResults` suggested source fields for a given target field.
 *
 * @param targetPath         Full dot-path of the target field.
 * @param targetType         JSON Schema type of the target field.
 * @param parsedSourceSchema Parsed source schema (or null — returns empty array).
 * @param maxResults         Maximum number of suggestions to return (default 5).
 */
export function suggestSourceFields(
  targetPath: string,
  targetType: TargetFieldType,
  parsedSourceSchema: ParsedSchema | null,
  maxResults = 5,
): SuggestedField[] {
  if (!parsedSourceSchema || parsedSourceSchema.nodes.length === 0) return [];

  const targetName = lastName(targetPath).toLowerCase();
  const allNodes = flattenNodes(parsedSourceSchema.nodes);

  const exact: SuggestedField[] = [];
  const caseInsensitive: SuggestedField[] = [];
  const contains: SuggestedField[] = [];

  for (const node of allNodes) {
    // Skip object/array containers — they are not scalar source values
    if (node.type === 'object' || node.type === 'array') continue;

    if (!isTypeCompatible(node.type, targetType)) continue;

    // Use original casing for exact match, lowercase for the rest
    const sourceNameOriginal = lastName(node.path);
    const sourceNameLower = sourceNameOriginal.toLowerCase();
    const targetNameOriginal = lastName(targetPath);

    const suggestion: SuggestedField = {
      path: node.path,
      fieldName: node.fieldName,
      type: node.type,
      matchKind: 'contains', // will be overridden below
    };

    if (sourceNameOriginal === targetNameOriginal) {
      // Exact case-sensitive match
      exact.push({ ...suggestion, matchKind: 'exact' });
    } else if (sourceNameLower === targetName) {
      // Case-insensitive match (different casing)
      caseInsensitive.push({ ...suggestion, matchKind: 'case-insensitive' });
    } else if (sourceNameLower.includes(targetName) || targetName.includes(sourceNameLower)) {
      // Contains match
      contains.push({ ...suggestion, matchKind: 'contains' });
    }
  }

  // Deduplicate: exact takes priority, then case-insensitive, then contains
  const seen = new Set<string>();
  const results: SuggestedField[] = [];

  for (const group of [exact, caseInsensitive, contains]) {
    for (const item of group) {
      if (!seen.has(item.path) && results.length < maxResults) {
        seen.add(item.path);
        results.push(item);
      }
    }
  }

  return results;
}
