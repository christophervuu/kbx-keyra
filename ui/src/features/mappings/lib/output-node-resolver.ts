import type { MappingRule, OutputPathEntry } from '@/lib/types/domain';

export type OutputNodeResolution =
  | {
      readonly kind: 'rule';
      readonly targetPath: string;
      readonly ruleIndex: number;
      readonly resolution: 'metadata-owning-rule' | 'normalized-exact-rule' | 'ancestor-rule';
    }
  | {
      readonly kind: 'target-field';
      readonly targetPath: string;
      readonly resolution: 'schema-fallback';
    }
  | {
      readonly kind: 'unresolvable';
      readonly reason: 'no-editable-target';
    };

function normalizeArrayIndices(path: string): string {
  return path.replace(/\[\d+\]/g, '');
}

function normalizePath(path: string): string {
  return normalizeArrayIndices(path).replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
}

function buildAncestorPaths(path: string): string[] {
  if (!path) return [];
  const ancestors: string[] = [];
  let cursor = path;
  while (cursor.length > 0) {
    ancestors.push(cursor);
    const dotIndex = cursor.lastIndexOf('.');
    if (dotIndex < 0) break;
    cursor = cursor.slice(0, dotIndex);
  }
  return ancestors;
}

function normalizeRuleTargetMap(rules: readonly MappingRule[]): Map<string, { target: string; ruleIndex: number }> {
  const ruleTargetMap = new Map<string, { target: string; ruleIndex: number }>();
  rules.forEach((rule, index) => {
    const normalized = normalizePath(rule.target);
    if (!ruleTargetMap.has(normalized)) {
      ruleTargetMap.set(normalized, { target: rule.target, ruleIndex: index });
    }
  });
  return ruleTargetMap;
}

function findRuleByPath(
  ruleTargetMap: Map<string, { target: string; ruleIndex: number }>,
  path: string | undefined,
): { target: string; ruleIndex: number } | null {
  if (!path) return null;
  const normalized = normalizePath(path);
  if (!normalized) return null;
  return ruleTargetMap.get(normalized) ?? null;
}

export function resolveOutputNodeSelection(params: {
  readonly runtimePath: string;
  readonly pathEntry?: OutputPathEntry;
  readonly rules: readonly MappingRule[];
  readonly targetSchemaPaths: ReadonlySet<string>;
}): OutputNodeResolution {
  const { runtimePath, pathEntry, rules, targetSchemaPaths } = params;
  const normalizedRuntimePath = normalizePath(runtimePath);
  const normalizedTargetSchemaPath = normalizePath(pathEntry?.targetSchemaPath ?? runtimePath);
  const ruleTargetMap = normalizeRuleTargetMap(rules);

  // 1) metadata owning rule
  const metadataRule = findRuleByPath(ruleTargetMap, pathEntry?.owningRuleTargetPath);
  if (metadataRule) {
    return {
      kind: 'rule',
      targetPath: metadataRule.target,
      ruleIndex: metadataRule.ruleIndex,
      resolution: 'metadata-owning-rule',
    };
  }

  // 2) normalized exact rule
  const exactRule =
    findRuleByPath(ruleTargetMap, normalizedRuntimePath)
    ?? findRuleByPath(ruleTargetMap, normalizedTargetSchemaPath);
  if (exactRule) {
    return {
      kind: 'rule',
      targetPath: exactRule.target,
      ruleIndex: exactRule.ruleIndex,
      resolution: 'normalized-exact-rule',
    };
  }

  // 3) longest ancestor rule
  const ancestorPaths = buildAncestorPaths(normalizedRuntimePath);
  for (const ancestorPath of ancestorPaths) {
    const ancestorRule = findRuleByPath(ruleTargetMap, ancestorPath);
    if (ancestorRule) {
      return {
        kind: 'rule',
        targetPath: ancestorRule.target,
        ruleIndex: ancestorRule.ruleIndex,
        resolution: 'ancestor-rule',
      };
    }
  }

  // 4) schema-field fallback (unconfigured target)
  if (normalizedTargetSchemaPath && targetSchemaPaths.has(normalizedTargetSchemaPath)) {
    return {
      kind: 'target-field',
      targetPath: normalizedTargetSchemaPath,
      resolution: 'schema-fallback',
    };
  }

  // 5) truly unresolvable
  return {
    kind: 'unresolvable',
    reason: 'no-editable-target',
  };
}
