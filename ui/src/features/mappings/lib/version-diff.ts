import type { MappingConfig, MappingRule } from '@/lib/types/domain';

export interface RuleDiff {
  readonly type: 'added' | 'modified' | 'removed';
  readonly targetPath: string;
  readonly oldExpression?: string;
  readonly newExpression?: string;
  readonly oldDescription?: string;
  readonly newDescription?: string;
}

export interface ConfigDiff {
  readonly field: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export interface VersionDiff {
  readonly summary: {
    readonly added: number;
    readonly modified: number;
    readonly removed: number;
  };
  readonly ruleDiffs: readonly RuleDiff[];
  readonly configDiffs: readonly ConfigDiff[];
}

function groupRulesByTarget(rules: readonly MappingRule[]): Map<string, MappingRule[]> {
  const grouped = new Map<string, MappingRule[]>();

  for (const rule of rules) {
    const bucket = grouped.get(rule.target) ?? [];
    bucket.push(rule);
    grouped.set(rule.target, bucket);
  }

  return grouped;
}

function toSortedUnique(values: readonly string[] | undefined): readonly string[] {
  if (!values || values.length === 0) return [];
  return [...new Set(values)].sort();
}

function addArrayConfigDiff(
  diffs: ConfigDiff[],
  field: 'nullSubtrees' | 'externalSources',
  oldValues: readonly string[] | undefined,
  newValues: readonly string[] | undefined,
): void {
  const oldNormalized = toSortedUnique(oldValues);
  const newNormalized = toSortedUnique(newValues);

  if (JSON.stringify(oldNormalized) !== JSON.stringify(newNormalized)) {
    diffs.push({
      field,
      oldValue: oldNormalized,
      newValue: newNormalized,
    });
  }
}

function addConstantsDiffs(
  diffs: ConfigDiff[],
  oldConstants: Readonly<Record<string, unknown>> | undefined,
  newConstants: Readonly<Record<string, unknown>> | undefined,
): void {
  const oldRecord = oldConstants ?? {};
  const newRecord = newConstants ?? {};

  const keys = new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)]);
  const sortedKeys = [...keys].sort();

  for (const key of sortedKeys) {
    const oldValue = oldRecord[key];
    const newValue = newRecord[key];

    if (!Object.is(oldValue, newValue)) {
      diffs.push({
        field: `constants.${key}`,
        oldValue,
        newValue,
      });
    }
  }
}

const DEFAULT_VERSION_DIFF_CONFIG: MappingConfig = {
  name: 'Unknown version',
  version: 0,
  engineVersion: 'unknown',
  config: {},
  rules: [],
};

function normalizeConfig(config: MappingConfig | null | undefined): MappingConfig {
  if (!config || typeof config !== 'object') {
    return DEFAULT_VERSION_DIFF_CONFIG;
  }

  return {
    ...DEFAULT_VERSION_DIFF_CONFIG,
    ...config,
    config:
      config.config && typeof config.config === 'object'
        ? config.config
        : DEFAULT_VERSION_DIFF_CONFIG.config,
    rules: Array.isArray(config.rules) ? config.rules : DEFAULT_VERSION_DIFF_CONFIG.rules,
  };
}

export function computeVersionDiff(
  oldConfig: MappingConfig | null | undefined,
  newConfig: MappingConfig | null | undefined,
): VersionDiff {
  const normalizedOldConfig = normalizeConfig(oldConfig);
  const normalizedNewConfig = normalizeConfig(newConfig);

  const oldGrouped = groupRulesByTarget(normalizedOldConfig.rules);
  const newGrouped = groupRulesByTarget(normalizedNewConfig.rules);

  const allTargets = [...new Set([...oldGrouped.keys(), ...newGrouped.keys()])].sort();
  const ruleDiffs: RuleDiff[] = [];

  for (const targetPath of allTargets) {
    const oldGroup = oldGrouped.get(targetPath) ?? [];
    const newGroup = newGrouped.get(targetPath) ?? [];
    const maxLength = Math.max(oldGroup.length, newGroup.length);

    for (let index = 0; index < maxLength; index += 1) {
      const oldRule = oldGroup[index];
      const newRule = newGroup[index];

      if (oldRule && !newRule) {
        ruleDiffs.push({
          type: 'removed',
          targetPath,
          oldExpression: oldRule.expression,
          oldDescription: oldRule.description,
        });
        continue;
      }

      if (!oldRule && newRule) {
        ruleDiffs.push({
          type: 'added',
          targetPath,
          newExpression: newRule.expression,
          newDescription: newRule.description,
        });
        continue;
      }

      if (!oldRule || !newRule) {
        continue;
      }

      const expressionChanged = oldRule.expression !== newRule.expression;
      const descriptionChanged = oldRule.description !== newRule.description;

      if (expressionChanged || descriptionChanged) {
        ruleDiffs.push({
          type: 'modified',
          targetPath,
          oldExpression: oldRule.expression,
          newExpression: newRule.expression,
          oldDescription: oldRule.description,
          newDescription: newRule.description,
        });
      }
    }
  }

  const configDiffs: ConfigDiff[] = [];
  const oldOptions = normalizedOldConfig.config;
  const newOptions = normalizedNewConfig.config;

  if (oldOptions.unmappedTargets !== newOptions.unmappedTargets) {
    configDiffs.push({
      field: 'unmappedTargets',
      oldValue: oldOptions.unmappedTargets,
      newValue: newOptions.unmappedTargets,
    });
  }

  addArrayConfigDiff(configDiffs, 'nullSubtrees', oldOptions.nullSubtrees, newOptions.nullSubtrees);
  addConstantsDiffs(configDiffs, oldOptions.constants, newOptions.constants);
  addArrayConfigDiff(
    configDiffs,
    'externalSources',
    oldOptions.externalSources,
    newOptions.externalSources,
  );

  const summary = {
    added: ruleDiffs.filter((diff) => diff.type === 'added').length,
    modified: ruleDiffs.filter((diff) => diff.type === 'modified').length,
    removed: ruleDiffs.filter((diff) => diff.type === 'removed').length,
  } as const;

  return {
    summary,
    ruleDiffs,
    configDiffs,
  };
}

export function generateChangeSummary(diff: VersionDiff): string {
  const { added, modified, removed } = diff.summary;

  if (added === 0 && modified === 0 && removed === 0) {
    return 'No changes';
  }

  const parts: string[] = [];

  if (added > 0) {
    parts.push(`+${added} added`);
  }

  if (modified > 0) {
    parts.push(`~${modified} modified`);
  }

  if (removed > 0) {
    parts.push(`-${removed} removed`);
  }

  return parts.join(', ');
}
