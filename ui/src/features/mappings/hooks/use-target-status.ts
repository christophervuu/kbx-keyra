import { useMemo } from 'react';

import type { Diagnostic, ValidationResult } from '@/lib/engine';
import type { MappingRule, SchemaTreeNode } from '@/lib/types/domain';
import type { TargetFieldStatus } from '../components/TargetFieldRow';
import type { CompletionStatus } from '../lib/array-builder-state';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoverageEntry {
  readonly mapped: number;
  readonly total: number;
}

export interface UseTargetStatusResult {
  /**
   * Map from target field path → mapping status.
   * Every node in the schema tree has an entry.
   */
  readonly statusMap: Map<string, TargetFieldStatus>;
  /**
   * Map from object/array node path → { mapped, total } child coverage.
   * Only nodes with children have an entry.
   */
  readonly coverageMap: Map<string, CoverageEntry>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collects every schema path by recursively walking a potentially hierarchical
 * node list (root-only arrays with nested children, or flattened arrays).
 */
function collectAllPaths(nodes: readonly SchemaTreeNode[]): Set<string> {
  const paths = new Set<string>();

  function walk(current: readonly SchemaTreeNode[]) {
    for (const node of current) {
      if (paths.has(node.path)) continue;
      paths.add(node.path);
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return paths;
}

/**
 * Returns every node in depth-first order from a possibly hierarchical root list.
 */
function collectAllNodes(nodes: readonly SchemaTreeNode[]): SchemaTreeNode[] {
  const ordered: SchemaTreeNode[] = [];
  const seen = new Set<string>();

  function walk(current: readonly SchemaTreeNode[]) {
    for (const node of current) {
      if (seen.has(node.path)) continue;
      seen.add(node.path);
      ordered.push(node);
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return ordered;
}

/**
 * Returns all leaf descendant paths of a given node.
 * Leaf = a node whose type is not 'object' or 'array'.
 * Traverses the children tree recursively.
 */
function getLeafDescendants(node: SchemaTreeNode): string[] {
  const leaves: string[] = [];
  function traverse(n: SchemaTreeNode) {
    if (n.type !== 'object' && n.type !== 'array') {
      leaves.push(n.path);
    } else {
      for (const child of n.children) {
        traverse(child);
      }
    }
  }
  // Start from children (not the node itself)
  for (const child of node.children) {
    traverse(child);
  }
  return leaves;
}

/**
 * Builds a map from target path → worst-severity diagnostic status.
 * Uses `targetPath` on each diagnostic when available; falls back to
 * `ruleIndex` to look up the rule's target path.
 */
function buildDiagnosticStatusMap(
  diagnostics: readonly Diagnostic[],
  rules: readonly MappingRule[],
): Map<string, 'warning' | 'error'> {
  const map = new Map<string, 'warning' | 'error'>();

  for (const diag of diagnostics) {
    if (diag.severity !== 'error' && diag.severity !== 'warning') continue;

    let targetPath: string | undefined = diag.targetPath;

    // Fall back to rule index if targetPath not on diagnostic
    if (!targetPath && diag.ruleIndex !== undefined && rules[diag.ruleIndex]) {
      targetPath = rules[diag.ruleIndex].target;
    }

    if (!targetPath) continue;

    const existing = map.get(targetPath);
    // error beats warning
    if (diag.severity === 'error' || existing === undefined) {
      map.set(targetPath, diag.severity);
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * T-11: Maps an ArrayBuilderState CompletionStatus to a TargetFieldStatus.
 * Returns null when no override is needed.
 */
function completionStatusToTargetStatus(
  completionStatus: CompletionStatus,
): TargetFieldStatus | null {
  switch (completionStatus) {
    case 'notStarted': return 'unmapped';
    case 'inProgress': return 'warning';
    case 'complete': return 'mapped';
    case 'hasErrors': return 'error';
    default: return null;
  }
}

/**
 * Derives per-field mapping status and section coverage from rules + validation.
 *
 * Status derivation:
 *   1. Build a Set of rule target paths (mapped paths).
 *   2. Overlay validation diagnostics: warning / error overrides "mapped".
 *   3. Any path not in the rule set is "unmapped".
 *   4. T-11: Array nodes with a known completionStatus override their status.
 *
 * Coverage derivation:
 *   For each object/array node, count how many direct children are mapped
 *   (status !== 'unmapped').
 *
 * @param rules                Current mapping rules array.
 * @param validationResult     Engine validation result (or null if not yet validated).
 * @param nodes                Flat list of SchemaTreeNode from the parsed target schema.
 * @param arrayCompletionMap   T-11: Optional map from array target path → CompletionStatus.
 *                             When provided, overrides the status for array nodes.
 */
export function useTargetStatus(
  rules: readonly MappingRule[],
  validationResult: ValidationResult | null,
  nodes: readonly SchemaTreeNode[],
  arrayCompletionMap?: ReadonlyMap<string, CompletionStatus>,
): UseTargetStatusResult {
  return useMemo(() => {
    const statusMap = new Map<string, TargetFieldStatus>();
    const coverageMap = new Map<string, CoverageEntry>();

    if (nodes.length === 0) {
      return { statusMap, coverageMap };
    }

    // Step 1: build set of paths that have rules
    const mappedPaths = new Set<string>(rules.map((r) => r.target));

    // Step 2: build diagnostic overlay
    const diagMap = validationResult
      ? buildDiagnosticStatusMap(validationResult.diagnostics, rules)
      : new Map<string, 'warning' | 'error'>();

    // Step 3: assign status to every node
    const allPaths = collectAllPaths(nodes);
    for (const path of allPaths) {
      if (!mappedPaths.has(path)) {
        statusMap.set(path, 'unmapped');
      } else {
        const diagStatus = diagMap.get(path);
        statusMap.set(path, diagStatus ?? 'mapped');
      }
    }

    // Step 3b: roll up container-node status from leaf descendants.
    // Parent severity precedence: error > warning > mapped > unmapped.
    const allNodes = collectAllNodes(nodes);
    for (const node of allNodes) {
      if (node.childCount === 0 || node.children.length === 0) continue;

      const leafPaths = getLeafDescendants(node);
      if (leafPaths.length === 0) continue;

      let hasError = false;
      let hasWarning = false;
      let mappedCount = 0;

      for (const leafPath of leafPaths) {
        const leafStatus = statusMap.get(leafPath) ?? 'unmapped';
        if (leafStatus === 'error') {
          hasError = true;
          break;
        }
        if (leafStatus === 'warning') {
          hasWarning = true;
        }
        if (leafStatus === 'mapped' || leafStatus === 'warning') {
          mappedCount++;
        }
      }

      if (hasError) {
        statusMap.set(node.path, 'error');
      } else if (hasWarning) {
        statusMap.set(node.path, 'warning');
      } else if (mappedCount === leafPaths.length) {
        statusMap.set(node.path, 'mapped');
      } else {
        statusMap.set(node.path, 'unmapped');
      }
    }

    // Step 3c: T-11 — override array node status from arrayCompletionMap
    if (arrayCompletionMap && arrayCompletionMap.size > 0) {
      for (const [arrayPath, completionStatus] of arrayCompletionMap) {
        const overrideStatus = completionStatusToTargetStatus(completionStatus);
        if (overrideStatus !== null) {
          statusMap.set(arrayPath, overrideStatus);
        }
      }
    }

    // Step 4: compute coverage for object/array nodes using leaf descendants
    for (const node of allNodes) {
      if (node.childCount > 0 && node.children.length > 0) {
        const leafPaths = getLeafDescendants(node);
        if (leafPaths.length === 0) continue;
        let mapped = 0;
        for (const leafPath of leafPaths) {
          const leafStatus = statusMap.get(leafPath);
          if (leafStatus !== undefined && leafStatus !== 'unmapped') {
            mapped++;
          }
        }
        coverageMap.set(node.path, { mapped, total: leafPaths.length });
      }
    }

    return { statusMap, coverageMap };
  }, [rules, validationResult, nodes, arrayCompletionMap]);
}
