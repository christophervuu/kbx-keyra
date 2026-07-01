import type { AutoMapScopeMode } from '../persistence/auto-map.js';
import type { SchemaNode } from '../schema/types.js';

const DEFAULT_MAX_TARGETS_PER_UNIT = 75;
const MIN_MAX_TARGETS_PER_UNIT = 2;

export interface AutoMapPlannerScope {
  readonly mode: AutoMapScopeMode;
  readonly sectionPath?: string;
  readonly targetPaths?: readonly string[];
}

export interface AutoMapWorkUnitPlannerInput {
  readonly targetSchemaNodes: readonly SchemaNode[];
  readonly scope: AutoMapPlannerScope;
  readonly maxTargetsPerUnit?: number;
}

export interface PlannedAutoMapWorkUnit {
  readonly workUnitId: string;
  readonly workUnitOrder: number;
  readonly scopeMode: AutoMapScopeMode;
  readonly rootPath: string;
  readonly targetPaths: readonly string[];
  readonly contextPaths: readonly string[];
  readonly split: {
    readonly index: number;
    readonly total: number;
  };
}

export interface AutoMapWorkUnitPlan {
  readonly scopeMode: AutoMapScopeMode;
  readonly normalizedTargetPaths: readonly string[];
  readonly workUnits: readonly PlannedAutoMapWorkUnit[];
}

function normalizePath(path: string): string {
  return path.trim();
}

function normalizeExplicitTargetPaths(targetPaths: readonly string[] | undefined): string[] {
  if (!targetPaths || targetPaths.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of targetPaths) {
    const path = normalizePath(entry);
    if (path === '' || seen.has(path)) {
      continue;
    }

    seen.add(path);
    normalized.push(path);
  }

  normalized.sort((left, right) => left.localeCompare(right));
  return normalized;
}

function isEligibleTargetNode(node: SchemaNode): boolean {
  return node.type !== 'object';
}

function buildNodeMaps(nodes: readonly SchemaNode[]): {
  readonly byPath: ReadonlyMap<string, SchemaNode>;
  readonly eligiblePaths: readonly string[];
  readonly eligiblePathSet: ReadonlySet<string>;
} {
  const byPath = new Map<string, SchemaNode>();
  const eligible: string[] = [];

  for (const node of nodes) {
    byPath.set(node.path, node);
    if (isEligibleTargetNode(node)) {
      eligible.push(node.path);
    }
  }

  eligible.sort((left, right) => left.localeCompare(right));
  return {
    byPath,
    eligiblePaths: eligible,
    eligiblePathSet: new Set(eligible),
  };
}

function arrayAncestorChain(path: string, byPath: ReadonlyMap<string, SchemaNode>): string[] {
  const chain: string[] = [];
  let currentPath: string | undefined = path;

  while (currentPath) {
    const current = byPath.get(currentPath);
    if (!current) {
      break;
    }

    if (current.isArray) {
      chain.push(current.path);
    }

    currentPath = current.parentPath;
  }

  return chain.reverse();
}

function nearestArrayAncestor(path: string, byPath: ReadonlyMap<string, SchemaNode>): string | null {
  const chain = arrayAncestorChain(path, byPath);
  return chain.length === 0 ? null : chain[chain.length - 1] ?? null;
}

function topLevelGroupRoot(path: string): string {
  const firstDot = path.indexOf('.');
  return firstDot === -1 ? path : path.slice(0, firstDot);
}

function resolveScopeTargets(
  scope: AutoMapPlannerScope,
  eligiblePaths: readonly string[],
  eligiblePathSet: ReadonlySet<string>,
): string[] {
  if (scope.mode === 'whole') {
    return [...eligiblePaths];
  }

  if (scope.mode === 'section') {
    const section = scope.sectionPath?.trim();
    if (!section) {
      return [];
    }

    const prefix = `${section}.`;
    return eligiblePaths.filter((path) => path.startsWith(prefix));
  }

  const explicit = normalizeExplicitTargetPaths(scope.targetPaths);
  return explicit.filter((path) => eligiblePathSet.has(path));
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push([...items.slice(index, index + size)]);
  }

  return output;
}

function dedupeStable(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    output.push(value);
  }

  return output;
}

function computeHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  const unsigned = hash >>> 0;
  return unsigned.toString(16).padStart(8, '0');
}

function buildWorkUnitId(
  order: number,
  rootPath: string,
  targetPaths: readonly string[],
  contextPaths: readonly string[],
): string {
  const orderPart = String(order).padStart(6, '0');
  const signature = `${rootPath}|${targetPaths.join(',')}|${contextPaths.join(',')}`;
  return `wu_${orderPart}_${computeHash(signature)}`;
}

function resolveGroupRoot(path: string, scope: AutoMapPlannerScope, byPath: ReadonlyMap<string, SchemaNode>): string {
  const nearestArray = nearestArrayAncestor(path, byPath);
  if (nearestArray) {
    return nearestArray;
  }

  const sectionPath = scope.sectionPath?.trim();
  if (scope.mode === 'section' && sectionPath && path.startsWith(`${sectionPath}.`)) {
    return sectionPath;
  }

  return topLevelGroupRoot(path);
}

function normalizeMaxTargetsPerUnit(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_MAX_TARGETS_PER_UNIT;
  }

  return Math.max(MIN_MAX_TARGETS_PER_UNIT, Math.trunc(value));
}

function buildContextPaths(
  rootPath: string,
  rootNode: SchemaNode | undefined,
  rootInScope: boolean,
  byPath: ReadonlyMap<string, SchemaNode>,
): string[] {
  if (rootNode?.isArray) {
    const allArrayAncestors = arrayAncestorChain(rootPath, byPath);
    const outerArrays = allArrayAncestors.filter((path) => path !== rootPath);
    const includeRootAsContext = rootInScope ? [] : [rootPath];
    return dedupeStable([...outerArrays, ...includeRootAsContext]);
  }

  if (rootNode?.type === 'object') {
    return [rootPath];
  }

  return [];
}

/**
 * Creates deterministic structural work units for Auto-Map session runs.
 *
 * Guarantees:
 * - Stable ordering and IDs for repeated equivalent inputs.
 * - In-scope-only `targetPaths` for filtered run modes.
 * - Array-child targets always carry array parent iterator context via `contextPaths`.
 */
export function planAutoMapWorkUnits(input: AutoMapWorkUnitPlannerInput): AutoMapWorkUnitPlan {
  const maps = buildNodeMaps(input.targetSchemaNodes);
  const normalizedTargetPaths = resolveScopeTargets(input.scope, maps.eligiblePaths, maps.eligiblePathSet);
  const maxTargetsPerUnit = normalizeMaxTargetsPerUnit(input.maxTargetsPerUnit);

  if (normalizedTargetPaths.length === 0) {
    return {
      scopeMode: input.scope.mode,
      normalizedTargetPaths,
      workUnits: [],
    };
  }

  const grouped = new Map<string, string[]>();
  for (const path of normalizedTargetPaths) {
    const root = resolveGroupRoot(path, input.scope, maps.byPath);
    const existing = grouped.get(root);
    if (existing) {
      existing.push(path);
    } else {
      grouped.set(root, [path]);
    }
  }

  const groupRoots = [...grouped.keys()].sort((left, right) => left.localeCompare(right));
  const workUnits: PlannedAutoMapWorkUnit[] = [];

  for (const rootPath of groupRoots) {
    const targets = dedupeStable((grouped.get(rootPath) ?? []).sort((left, right) => left.localeCompare(right)));
    if (targets.length === 0) {
      continue;
    }

    const rootNode = maps.byPath.get(rootPath);
    const rootInScope = targets.includes(rootPath);
    const contextPaths = buildContextPaths(rootPath, rootNode, rootInScope, maps.byPath);

    const preservedTargets = rootNode?.isArray && rootInScope ? [rootPath] : [];
    const chunkableTargets = targets.filter((path) => !preservedTargets.includes(path));

    const splitChunks =
      targets.length > maxTargetsPerUnit
        ? chunk(chunkableTargets, Math.max(1, maxTargetsPerUnit - preservedTargets.length))
        : [chunkableTargets];

    const normalizedSplitChunks = splitChunks.length === 0 ? [[]] : splitChunks;
    const splitTotal = normalizedSplitChunks.length;

    for (let splitIndex = 0; splitIndex < normalizedSplitChunks.length; splitIndex += 1) {
      const splitTargets = normalizedSplitChunks[splitIndex] ?? [];
      const targetPaths = [...preservedTargets, ...splitTargets];

      const workUnitOrder = workUnits.length;
      workUnits.push({
        workUnitId: buildWorkUnitId(workUnitOrder, rootPath, targetPaths, contextPaths),
        workUnitOrder,
        scopeMode: input.scope.mode,
        rootPath,
        targetPaths,
        contextPaths,
        split: {
          index: splitIndex,
          total: splitTotal,
        },
      });
    }
  }

  return {
    scopeMode: input.scope.mode,
    normalizedTargetPaths,
    workUnits,
  };
}
