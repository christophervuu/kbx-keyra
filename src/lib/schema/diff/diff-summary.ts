// ---------------------------------------------------------------------------
// Schema node diff summary (FS-077 T-04)
//
// Pure function that compares two sets of SchemaNodes (pre-sync vs post-sync)
// and computes deterministic added / removed / modified field path lists.
//
// Modified detection heuristic: path + structural fingerprint
// (type, isArray, depth).  If any fingerprint field differs at the same
// path the node is classified as modified.
// ---------------------------------------------------------------------------

import type { SchemaDiffSummary } from '../../persistence/types.js';

/**
 * Structural fingerprint used for modified-field detection.
 */
interface NodeFingerprint {
  readonly type: string;
  readonly isArray: boolean;
  readonly depth: number;
}

function fingerprint(node: { readonly type: string; readonly isArray: boolean; readonly depth: number }): NodeFingerprint {
  return {
    type: node.type,
    isArray: node.isArray,
    depth: node.depth,
  };
}

function fingerprintsEqual(a: NodeFingerprint, b: NodeFingerprint): boolean {
  return a.type === b.type && a.isArray === b.isArray && a.depth === b.depth;
}

/**
 * Compute a deterministic field-level diff summary between two schema node sets.
 *
 * The result is always stable: paths appear in lexicographic order within each
 * category list.
 *
 * @param priorNodes - Schema nodes from before the re-sync (pre-sync state).
 * @param currentNodes - Schema nodes from after the re-sync (post-sync state).
 */
export function computeSchemaDiff(
  priorNodes: ReadonlyArray<{ readonly path: string; readonly type: string; readonly isArray: boolean; readonly depth: number }>,
  currentNodes: ReadonlyArray<{ readonly path: string; readonly type: string; readonly isArray: boolean; readonly depth: number }>,
): SchemaDiffSummary {
  const priorMap = new Map<string, NodeFingerprint>();
  for (const node of priorNodes) {
    priorMap.set(node.path, fingerprint(node));
  }

  const currentMap = new Map<string, NodeFingerprint>();
  for (const node of currentNodes) {
    currentMap.set(node.path, fingerprint(node));
  }

  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  // Determine all unique paths (union of both sets).
  const allPaths = new Set<string>();
  for (const path of priorMap.keys()) {
    allPaths.add(path);
  }
  for (const path of currentMap.keys()) {
    allPaths.add(path);
  }

  // Iterate in sorted order for deterministic output.
  const sortedPaths = [...allPaths].sort();

  for (const path of sortedPaths) {
    const priorFp = priorMap.get(path);
    const currentFp = currentMap.get(path);

    if (priorFp === undefined && currentFp !== undefined) {
      added.push(path);
    } else if (priorFp !== undefined && currentFp === undefined) {
      removed.push(path);
    } else if (priorFp !== undefined && currentFp !== undefined) {
      if (!fingerprintsEqual(priorFp, currentFp)) {
        modified.push(path);
      }
      // else: unchanged — skip
    }
  }

  return { added, removed, modified };
}
