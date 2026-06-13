import {
  evaluateShadowParityGates,
  type ShadowParityGateOutcome,
  type ShadowParitySample,
} from './retrieval-parity.js';

export type SchemaSizeSegment = 'small' | 'medium' | 'large';

export interface RetrievalLatencySample {
  readonly schemaFieldCount: number;
  readonly schemaSizeSegment: SchemaSizeSegment;
  readonly retrievalMs: number;
}

export interface LatencySegmentGate {
  readonly schemaSizeSegment: SchemaSizeSegment;
  readonly targetP95Ms: number;
  readonly p95Ms: number;
  readonly samples: number;
  readonly passed: boolean;
}

export interface AcceptanceRateGate {
  readonly baselineAcceptanceRate: number;
  readonly postCutoverAcceptanceRate: number;
  readonly drop: number;
  readonly maxAllowedDrop: number;
  readonly passed: boolean;
}

export interface CutoverReadinessInput {
  readonly latencySamples: readonly RetrievalLatencySample[];
  readonly paritySamples: readonly ShadowParitySample[];
  readonly baselineAcceptanceRate?: number;
  readonly postCutoverAcceptanceRate?: number;
}

export interface CutoverReadinessOutcome {
  readonly latencyGates: readonly LatencySegmentGate[];
  readonly parityGate: ShadowParityGateOutcome;
  readonly acceptanceRateGate?: AcceptanceRateGate;
  readonly passed: boolean;
}

const LATENCY_TARGETS: Readonly<Record<SchemaSizeSegment, number>> = {
  small: 300,
  medium: 800,
  large: 1500,
};

export function percentile95(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(sorted.length * 0.95));
  return sorted[rank - 1] ?? sorted[sorted.length - 1] ?? 0;
}

export function evaluateLatencyGates(samples: readonly RetrievalLatencySample[]): LatencySegmentGate[] {
  const groups = new Map<SchemaSizeSegment, number[]>();
  groups.set('small', []);
  groups.set('medium', []);
  groups.set('large', []);

  for (const sample of samples) {
    if (!Number.isFinite(sample.retrievalMs) || sample.retrievalMs < 0) {
      continue;
    }

    const bucket = groups.get(sample.schemaSizeSegment);
    if (bucket) {
      bucket.push(sample.retrievalMs);
    }
  }

  return (['small', 'medium', 'large'] as const).map((segment) => {
    const values = groups.get(segment) ?? [];
    const p95Ms = percentile95(values);
    const targetP95Ms = LATENCY_TARGETS[segment];
    const passed = values.length > 0 && p95Ms < targetP95Ms;

    return {
      schemaSizeSegment: segment,
      targetP95Ms,
      p95Ms,
      samples: values.length,
      passed,
    };
  });
}

export function evaluateAcceptanceRateGate(
  baselineAcceptanceRate: number,
  postCutoverAcceptanceRate: number,
  maxAllowedDrop = 0.1,
): AcceptanceRateGate {
  const drop = baselineAcceptanceRate - postCutoverAcceptanceRate;
  return {
    baselineAcceptanceRate,
    postCutoverAcceptanceRate,
    drop,
    maxAllowedDrop,
    passed: drop <= maxAllowedDrop,
  };
}

export function evaluateCutoverReadiness(input: CutoverReadinessInput): CutoverReadinessOutcome {
  const latencyGates = evaluateLatencyGates(input.latencySamples);
  const parityGate = evaluateShadowParityGates(input.paritySamples, {
    minJaccardAt10: 0.7,
    minNdcgDeltaAt10: -0.1,
  });

  const acceptanceRateGate =
    typeof input.baselineAcceptanceRate === 'number' && typeof input.postCutoverAcceptanceRate === 'number'
      ? evaluateAcceptanceRateGate(input.baselineAcceptanceRate, input.postCutoverAcceptanceRate)
      : undefined;

  const latencyPassed = latencyGates.every((gate) => gate.passed);
  const acceptancePassed = acceptanceRateGate?.passed ?? true;

  return {
    latencyGates,
    parityGate,
    acceptanceRateGate,
    passed: latencyPassed && parityGate.passed && acceptancePassed,
  };
}
