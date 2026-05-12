import type { ParsedSchema } from '@/lib/types/domain';

/**
 * Maximum number of target field lines included in the eligible target listing.
 * Matches SOURCE_CONTEXT_LINE_LIMIT in use-auto-map-review.ts.
 */
const TARGET_LISTING_LINE_LIMIT = 200;

/**
 * Derives a formatted listing of eligible target fields from a ParsedSchema,
 * suitable for use as the `{{targetSection}}` placeholder in the auto-map AI prompt.
 *
 * Eligible targets are all non-object nodes (string, number, boolean, array, enum,
 * null, any, union). Object nodes are structural groupings and are never valid
 * mapping targets.
 *
 * @param schema - The parsed target schema.
 * @param sectionPath - When provided, only descendants of this path are included
 *   (i.e. nodes whose path starts with `sectionPath + '.'`). When null/undefined,
 *   all eligible nodes in the entire schema are included (header mode).
 * @returns A newline-separated listing string in the format `"- {path} ({type})"`,
 *   capped at 200 lines. Returns an empty string when no eligible targets exist.
 */
export function deriveEligibleTargets(
  schema: ParsedSchema | null | undefined,
  sectionPath?: string | null,
): string {
  if (!schema) return '';

  const prefix = sectionPath ? `${sectionPath}.` : null;
  const lines: string[] = [];
  const seenPaths = new Set<string>();
  const stack = [...schema.nodes].reverse();

  while (stack.length > 0 && lines.length < TARGET_LISTING_LINE_LIMIT) {
    const node = stack.pop();
    if (!node) break;

    if (Array.isArray(node.children) && node.children.length > 0) {
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        stack.push(node.children[i]);
      }
    }

    // Section filter: skip nodes outside the requested section
    if (prefix !== null && !node.path.startsWith(prefix)) continue;

    // Eligibility filter: exclude object nodes
    if (node.type === 'object') continue;

    // Defensive de-dupe: some schema parsers may include both flattened and nested nodes.
    if (seenPaths.has(node.path)) continue;
    seenPaths.add(node.path);

    lines.push(`- ${node.path} (${node.type})`);
  }

  return lines.join('\n');
}
