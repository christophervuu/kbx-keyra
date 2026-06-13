import { describe, expect, it } from 'vitest';

import {
  evaluateAcceptanceRateGate,
  evaluateCutoverReadiness,
  evaluateLatencyGates,
  percentile95,
} from '../../../src/lib/schema/cutover-readiness.js';

describe('FS-091 cutover readiness gates', () => {
  it('computes percentile95', () => {
    expect(percentile95([10, 20, 30, 40, 50])).toBe(50);
    expect(percentile95([])).toBe(0);
  });

  it('evaluates latency by schema-size segment', () => {
    const gates = evaluateLatencyGates([
      { schemaFieldCount: 100, schemaSizeSegment: 'small', retrievalMs: 200 },
      { schemaFieldCount: 1200, schemaSizeSegment: 'medium', retrievalMs: 600 },
      { schemaFieldCount: 23000, schemaSizeSegment: 'large', retrievalMs: 1200 },
    ]);

    expect(gates).toHaveLength(3);
    expect(gates.every((gate) => gate.passed)).toBe(true);
  });

  it('enforces acceptance-rate safety threshold', () => {
    const pass = evaluateAcceptanceRateGate(0.8, 0.73);
    const fail = evaluateAcceptanceRateGate(0.8, 0.69);

    expect(pass.passed).toBe(true);
    expect(fail.passed).toBe(false);
  });

  it('combines latency + parity + acceptance into go/no-go', () => {
    const outcome = evaluateCutoverReadiness({
      latencySamples: [
        { schemaFieldCount: 200, schemaSizeSegment: 'small', retrievalMs: 220 },
        { schemaFieldCount: 1700, schemaSizeSegment: 'medium', retrievalMs: 650 },
        { schemaFieldCount: 23000, schemaSizeSegment: 'large', retrievalMs: 1300 },
      ],
      paritySamples: [
        { jaccardAt10: 0.73, ndcgDeltaAt10: -0.03 },
        { jaccardAt10: 0.76, ndcgDeltaAt10: -0.02 },
      ],
      baselineAcceptanceRate: 0.82,
      postCutoverAcceptanceRate: 0.75,
    });

    expect(outcome.passed).toBe(true);
    expect(outcome.parityGate.passed).toBe(true);
    expect(outcome.latencyGates.every((gate) => gate.passed)).toBe(true);
    expect(outcome.acceptanceRateGate?.passed).toBe(true);
  });

  it('fails cutover when parity gates regress', () => {
    const outcome = evaluateCutoverReadiness({
      latencySamples: [
        { schemaFieldCount: 200, schemaSizeSegment: 'small', retrievalMs: 220 },
        { schemaFieldCount: 1700, schemaSizeSegment: 'medium', retrievalMs: 650 },
        { schemaFieldCount: 23000, schemaSizeSegment: 'large', retrievalMs: 1300 },
      ],
      paritySamples: [
        { jaccardAt10: 0.5, ndcgDeltaAt10: -0.2 },
        { jaccardAt10: 0.55, ndcgDeltaAt10: -0.15 },
      ],
    });

    expect(outcome.passed).toBe(false);
    expect(outcome.parityGate.passed).toBe(false);
  });
});
