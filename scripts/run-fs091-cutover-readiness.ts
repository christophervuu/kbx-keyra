import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  evaluateCutoverReadiness,
  type RetrievalLatencySample,
} from '../src/lib/schema/cutover-readiness.js';
import type { ShadowParitySample } from '../src/lib/schema/retrieval-parity.js';

interface ReadinessInput {
  readonly generatedAt?: string;
  readonly baselineAcceptanceRate?: number;
  readonly postCutoverAcceptanceRate?: number;
  readonly latencySamples: readonly RetrievalLatencySample[];
  readonly paritySamples: readonly ShadowParitySample[];
}

interface ReadinessReport {
  readonly generatedAt: string;
  readonly sourceInputPath: string;
  readonly summary: {
    readonly goNoGo: 'go' | 'no-go';
    readonly rollbackTriggers: readonly string[];
  };
  readonly cutover: ReturnType<typeof evaluateCutoverReadiness>;
}

function parsePathArg(argv: readonly string[], name: 'input' | 'report', fallback: string): string {
  const flag = argv.find((value) => value.startsWith(`--${name}=`));
  const value = flag?.split('=')[1];
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  return resolve(process.cwd(), value);
}

async function readJson<T>(path: string): Promise<T> {
  const content = await readFile(path, 'utf8');
  return JSON.parse(content) as T;
}

function toRollbackTriggers(result: ReturnType<typeof evaluateCutoverReadiness>): string[] {
  const reasons: string[] = [];

  for (const gate of result.latencyGates) {
    if (!gate.passed) {
      reasons.push(
        `${gate.schemaSizeSegment} p95 ${gate.p95Ms.toFixed(2)}ms exceeds target ${gate.targetP95Ms}ms`,
      );
    }
  }

  if (!result.parityGate.jaccardGatePassed) {
    reasons.push(
      `Top-K Jaccard@10 ${result.parityGate.averageJaccardAt10.toFixed(4)} below 0.7000 cutover gate`,
    );
  }

  if (!result.parityGate.ndcgGatePassed) {
    reasons.push(
      `NDCG@10 delta ${result.parityGate.averageNdcgDeltaAt10.toFixed(4)} below -0.1000 safety gate`,
    );
  }

  if (result.acceptanceRateGate && !result.acceptanceRateGate.passed) {
    reasons.push(
      `Acceptance-rate drop ${result.acceptanceRateGate.drop.toFixed(4)} exceeds ${result.acceptanceRateGate.maxAllowedDrop.toFixed(4)}`,
    );
  }

  return reasons;
}

async function run(): Promise<void> {
  const defaultInputPath = resolve(process.cwd(), 'forge/active/FS-091/benchmarks/cutover-input.json');
  const defaultReportPath = resolve(process.cwd(), 'forge/active/FS-091/benchmarks/cutover-readiness-report.json');

  const args = process.argv.slice(2);
  const inputPath = parsePathArg(args, 'input', defaultInputPath);
  const reportPath = parsePathArg(args, 'report', defaultReportPath);

  const input = await readJson<ReadinessInput>(inputPath);
  const cutover = evaluateCutoverReadiness({
    latencySamples: input.latencySamples,
    paritySamples: input.paritySamples,
    baselineAcceptanceRate: input.baselineAcceptanceRate,
    postCutoverAcceptanceRate: input.postCutoverAcceptanceRate,
  });

  const rollbackTriggers = toRollbackTriggers(cutover);
  const report: ReadinessReport = {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceInputPath: inputPath,
    summary: {
      goNoGo: cutover.passed ? 'go' : 'no-go',
      rollbackTriggers,
    },
    cutover,
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[FS-091 cutover] input=${inputPath}`);
  console.log(`[FS-091 cutover] report=${reportPath}`);
  console.log(`[FS-091 cutover] decision=${report.summary.goNoGo}`);
  if (rollbackTriggers.length > 0) {
    console.log(`[FS-091 cutover] rollback-triggers=${rollbackTriggers.length}`);
    for (const trigger of rollbackTriggers) {
      console.log(`  - ${trigger}`);
    }
  } else {
    console.log('[FS-091 cutover] rollback-triggers=none');
  }
}

await run();
