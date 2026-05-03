/**
 * Reconstruct a JSON Schema object from a `SchemaTreeNode[]` tree.
 *
 * The resulting object can be serialised and re-parsed by `parseJsonSchema`
 * to reproduce the same tree (round-trip stable for the supported subset of
 * JSON Schema that the editor handles).
 *
 * Top-level keys from `originalContent` that are not `type`, `properties`, or
 * `required` (e.g. `$schema`, `$id`, `title`, custom extensions) are
 * preserved in the output.
 */

import type { SchemaTreeNode } from '@/lib/types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a flat/nested `SchemaTreeNode[]` tree into a JSON Schema object.
 *
 * @param nodes - Top-level nodes of the schema tree.
 * @param originalContent - Optional original raw schema content. Keys that
 *   are not structural (`type`, `properties`, `required`) are copied through
 *   to preserve `$schema`, `$id`, `title`, and custom extensions.
 */
export function treeToJsonSchema(
  nodes: SchemaTreeNode[],
  originalContent?: Record<string, unknown> | string,
): Record<string, unknown> {
  const { properties, required } = buildProperties(nodes);

  // Preserve unrecognised top-level keys from the original content
  const preserved: Record<string, unknown> = {};
  if (originalContent) {
    const raw =
      typeof originalContent === 'string'
        ? (JSON.parse(originalContent) as Record<string, unknown>)
        : originalContent;
    const structural = new Set(['type', 'properties', 'required']);
    for (const [key, value] of Object.entries(raw)) {
      if (!structural.has(key)) {
        preserved[key] = value;
      }
    }
  }

  return {
    ...preserved,
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

/**
 * Count all nodes in a tree (including descendants).  Used to compute
 * `fieldCount` after an edit.
 */
export function countAllNodes(nodes: SchemaTreeNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countAllNodes(node.children), 0);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildProperties(nodes: SchemaTreeNode[]): {
  properties: Record<string, unknown>;
  required: string[];
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const node of nodes) {
    properties[node.fieldName] = nodeToJsonSchemaValue(node);
    if (node.isRequired) {
      required.push(node.fieldName);
    }
  }

  return { properties, required };
}

function nodeToJsonSchemaValue(node: SchemaTreeNode): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (node.description) {
    result.description = node.description;
  }

  switch (node.type) {
    case 'string':
      result.type = 'string';
      break;

    case 'number':
      result.type = 'number';
      break;

    case 'boolean':
      result.type = 'boolean';
      break;

    case 'null':
      result.type = 'null';
      break;

    case 'enum':
      result.type = 'string';
      if (node.enumValues && node.enumValues.length > 0) {
        result.enum = node.enumValues;
      }
      break;

    case 'union':
      // Union types cannot be perfectly round-tripped from the tree representation.
      // Reconstruct as anyOf using the unionTypes array when available.
      if (node.unionTypes && node.unionTypes.length > 0) {
        result.anyOf = node.unionTypes.map((t) => ({ type: t }));
      } else {
        result.type = 'string';
      }
      break;

    case 'object': {
      result.type = 'object';
      if (node.children.length > 0) {
        const { properties, required } = buildProperties(node.children);
        result.properties = properties;
        if (required.length > 0) {
          result.required = required;
        }
      }
      break;
    }

    case 'array': {
      result.type = 'array';
      if (node.children.length > 0) {
        // Children represent the properties of array items objects
        const { properties, required } = buildProperties(node.children);
        result.items = {
          type: 'object',
          properties,
          ...(required.length > 0 ? { required } : {}),
        };
      } else {
        // Default: array of strings
        result.items = { type: 'string' };
      }
      break;
    }

    case 'any':
    default:
      // No `type` constraint
      break;
  }

  return result;
}
