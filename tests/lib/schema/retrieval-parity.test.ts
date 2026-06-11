import { describe, expect, it } from 'vitest';

import {
  computeJaccardAtK,
  computeNdcgDeltaAtK,
  evaluateShadowParityGates,
  topKPaths,
} from '../../../src/lib/schema/retrieval-parity.js';

describe('schema retrieval parity helpers', () => {
  it('computes topK paths deterministically', () => {
    const paths = topKPaths(
      [
        { path: 'A', fieldName: 'A', type: 'string', depth: 1, isArray: false, score: 1, embeddingText: 'A' },
        { path: 'B', fieldName: 'B', type: 'string', depth: 1, isArray: false, score: 0.8, embeddingText: 'B' },
      ],
      1,
    );

    expect(paths).toEqual(['A']);
  });

  it('computes Jaccard at K and handles empty unions', () => {
    expect(computeJaccardAtK(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 6);
    expect(computeJaccardAtK([], [])).toBeUndefined();
  });

  it('computes NDCG delta at K and handles empty primary ranking', () => {
    const primary = ['a', 'b', 'c'];
    const secondary = ['a', 'c', 'x'];

    const delta = computeNdcgDeltaAtK(primary, secondary);
    expect(typeof delta).toBe('number');
    expect(delta).toBeGreaterThan(-1);
    expect(delta).toBeLessThanOrEqual(0);
    expect(computeNdcgDeltaAtK([], secondary)).toBeUndefined();
  });

  it('evaluates parity gates with FS-091 thresholds', () => {
    const outcome = evaluateShadowParityGates(
      [
        { jaccardAt10: 0.71, ndcgDeltaAt10: -0.03 },
        { jaccardAt10: 0.76, ndcgDeltaAt10: -0.01 },
      ],
      { minJaccardAt10: 0.7, minNdcgDeltaAt10: -0.1 },
    );

    expect(outcome.averageJaccardAt10).toBeGreaterThanOrEqual(0.7);
    expect(outcome.averageNdcgDeltaAt10).toBeGreaterThanOrEqual(-0.1);
    expect(outcome.passed).toBe(true);
  });
});
