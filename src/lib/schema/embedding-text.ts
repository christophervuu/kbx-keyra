import type { SchemaNode } from './types.js';

/**
 * Generates canonical embedding text for a schema node.
 *
 * With description: "{path} | {fieldName} ({type}) | {description}"
 * Without description: "{path} | {fieldName} ({type})"
 */
export function generateEmbeddingText(node: SchemaNode): string {
  const base = `${node.path} | ${node.fieldName} (${node.type})`;
  const description = node.description?.trim();

  if (!description) {
    return base;
  }

  return `${base} | ${description}`;
}
