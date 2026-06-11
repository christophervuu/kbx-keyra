import type { SchemaSearchResult } from './types.js';

export interface ShadowParitySample {
  readonly jaccardAt10?: number;
  readonly ndcgDeltaAt10?: number;
}

export interface ShadowParityGateThresholds {
  readonly minJaccardAt10: number;
  readonly minNdcgDeltaAt10: number;
}

export interface ShadowParityGateOutcome {
  readonly averageJaccardAt10: number;
  readonly averageNdcgDeltaAt10: number;
  readonly jaccardGatePassed: boolean;
  readonly ndcgGatePassed: boolean;
  readonly passed: boolean;
  readonly sampledQueries: number;
}

export function topKPaths(results: readonly SchemaSearchResult[], limit: number): string[] {
  return results.slice(0, Math.max(0, limit)).map((item) => item.path);
}

export function computeJaccardAtK(primary: readonly string[], secondary: readonly string[]): number | undefined {
  const union = new Set([...primary, ...secondary]);
  if (union.size === 0) {
    return undefined;
  }

  const secondarySet = new Set(secondary);
  let intersection = 0;
  for (const value of primary) {
    if (secondarySet.has(value)) {
      intersection += 1;
    }
  }

  return intersection / union.size;
}

export function computeNdcgDeltaAtK(primary: readonly string[], secondary: readonly string[]): number | undefined {
  if (primary.length === 0) {
    return undefined;
  }

  const gains = new Map<string, number>();
  for (let index = 0; index < primary.length; index += 1) {
    gains.set(primary[index] as string, primary.length - index);
  }

  const dcg = (ranking: readonly string[]): number => {
    let total = 0;
    for (let index = 0; index < ranking.length; index += 1) {
      const gain = gains.get(ranking[index] as string) ?? 0;
      if (gain <= 0) {
        continue;
      }

      total += gain / Math.log2(index + 2);
    }

    return total;
  };

  const ideal = dcg(primary);
  if (ideal <= 0) {
    return undefined;
  }

  const secondaryNdcg = dcg(secondary) / ideal;
  return secondaryNdcg - 1;
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((acc, value) => acc + value, 0);
  return total / values.length;
}

export function evaluateShadowParityGates(
  samples: readonly ShadowParitySample[],
  thresholds: ShadowParityGateThresholds,
): ShadowParityGateOutcome {
  const jaccardValues = samples
    .map((sample) => sample.jaccardAt10)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const ndcgValues = samples
    .map((sample) => sample.ndcgDeltaAt10)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  const sampledQueries = Math.max(jaccardValues.length, ndcgValues.length);
  const averageJaccardAt10 = average(jaccardValues);
  const averageNdcgDeltaAt10 = average(ndcgValues);
  const jaccardGatePassed = jaccardValues.length > 0 && averageJaccardAt10 >= thresholds.minJaccardAt10;
  const ndcgGatePassed = ndcgValues.length > 0 && averageNdcgDeltaAt10 >= thresholds.minNdcgDeltaAt10;

  return {
    averageJaccardAt10,
    averageNdcgDeltaAt10,
    jaccardGatePassed,
    ndcgGatePassed,
    passed: jaccardGatePassed && ndcgGatePassed,
    sampledQueries,
  };
}
