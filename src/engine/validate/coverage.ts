import type { MappingRule, CoverageResult } from '../types/index.js';
import type { SchemaTree } from './schema-tree.js';

export function computeCoverage(
  rules: readonly MappingRule[],
  targetSchema: SchemaTree,
): CoverageResult {
  const requiredPaths = targetSchema.getRequiredLeafPaths();
  const uniqueRuleTargets = new Set<string>(rules.map((rule) => rule.target));

  const unmappedFields: string[] = [];
  let mapped = 0;

  for (const requiredPath of requiredPaths) {
    if (uniqueRuleTargets.has(requiredPath)) {
      mapped += 1;
      continue;
    }

    unmappedFields.push(requiredPath);
  }

  const total = requiredPaths.length;
  const percentage = total === 0 ? 100 : Math.round((mapped / total) * 100);

  return {
    total,
    mapped,
    percentage,
    unmappedFields: unmappedFields.length > 0 ? unmappedFields : undefined,
  };
}
