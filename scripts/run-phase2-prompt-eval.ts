import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type GateMode = 'pr' | 'release';

interface ThresholdPolicy {
  readonly targetScore: number;
  readonly hardFloor: number;
  readonly warningBudget: number;
  readonly strictMissingRequired: boolean;
  readonly description: string;
}

interface ExpectedSignals {
  readonly requiredContains: readonly string[];
  readonly forbiddenContains: readonly string[];
}

interface GoldenCase {
  readonly caseId: string;
  readonly featureId: string;
  readonly promptId: string;
  readonly modelRuntimeTuple: string;
  readonly versionKey: string;
  readonly expectedSignals: ExpectedSignals;
  readonly referenceOutput: string;
  readonly aeCoverage: readonly string[];
}

interface GoldenCorpus {
  readonly corpusId: string;
  readonly spec: string;
  readonly specRevision: number;
  readonly updatedAt: string;
  readonly versioningPolicy: {
    readonly key: string;
    readonly description: string;
  };
  readonly thresholdPolicy: Record<GateMode, ThresholdPolicy>;
  readonly cases: readonly GoldenCase[];
}

interface CaseResult {
  readonly caseId: string;
  readonly versionKey: string;
  readonly observedOutput: string;
  readonly score: number;
  readonly requiredHits: readonly string[];
  readonly missingRequired: readonly string[];
  readonly forbiddenHits: readonly string[];
}

interface SampleResults {
  readonly sampleId: string;
  readonly generatedAt: string;
  readonly cases: readonly CaseResult[];
}

interface DriftIssue {
  readonly caseId: string;
  readonly featureId: string;
  readonly severity: 'warning' | 'error';
  readonly reason: string;
}

interface EvalReport {
  readonly mode: GateMode;
  readonly generatedAt: string;
  readonly corpusId: string;
  readonly policy: ThresholdPolicy;
  readonly summary: {
    readonly totalCases: number;
    readonly averageScore: number;
    readonly warnings: number;
    readonly errors: number;
    readonly warningBudgetUsed: number;
    readonly warningBudget: number;
  };
  readonly driftIssues: readonly DriftIssue[];
  readonly cases: readonly CaseResult[];
}

const corpusPath = resolve(process.cwd(), 'forge/active/FS-075/prompt-golden-corpus.json');
const defaultSampleResultsPath = resolve(
  process.cwd(),
  'forge/active/FS-075/prompt-eval-sample-results.json',
);
const defaultReportPath = resolve(process.cwd(), 'forge/active/FS-075/prompt-eval-report.json');

function parseModeArg(argv: readonly string[]): GateMode {
  const modeFlag = argv.find((value) => value.startsWith('--mode='));
  const modeValue = modeFlag?.split('=')[1];

  if (modeValue === 'release') {
    return 'release';
  }

  return 'pr';
}

function parsePathArg(argv: readonly string[], name: 'sample' | 'report', fallback: string): string {
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

function assertTupleCoverage(corpus: GoldenCorpus, sample: SampleResults): DriftIssue[] {
  const sampleByCase = new Map(sample.cases.map((item) => [item.caseId, item]));
  const issues: DriftIssue[] = [];

  for (const golden of corpus.cases) {
    const observed = sampleByCase.get(golden.caseId);
    if (!observed) {
      issues.push({
        caseId: golden.caseId,
        featureId: golden.featureId,
        severity: 'error',
        reason: `Missing sample result for case ${golden.caseId}`,
      });
      continue;
    }

    if (observed.versionKey !== golden.versionKey) {
      issues.push({
        caseId: golden.caseId,
        featureId: golden.featureId,
        severity: 'error',
        reason: `Version key mismatch. expected=${golden.versionKey} actual=${observed.versionKey}`,
      });
    }
  }

  return issues;
}

function evaluateCase(
  golden: GoldenCase,
  observed: CaseResult,
  policy: ThresholdPolicy,
): DriftIssue[] {
  const issues: DriftIssue[] = [];

  if (observed.score < policy.hardFloor) {
    issues.push({
      caseId: golden.caseId,
      featureId: golden.featureId,
      severity: 'error',
      reason: `Score ${observed.score.toFixed(2)} below hard floor ${policy.hardFloor.toFixed(2)}`,
    });
  } else if (observed.score < policy.targetScore) {
    issues.push({
      caseId: golden.caseId,
      featureId: golden.featureId,
      severity: 'warning',
      reason: `Score ${observed.score.toFixed(2)} below target ${policy.targetScore.toFixed(2)}`,
    });
  }

  if (observed.forbiddenHits.length > 0) {
    issues.push({
      caseId: golden.caseId,
      featureId: golden.featureId,
      severity: 'error',
      reason: `Forbidden signals present: ${observed.forbiddenHits.join(', ')}`,
    });
  }

  if (policy.strictMissingRequired && observed.missingRequired.length > 0) {
    issues.push({
      caseId: golden.caseId,
      featureId: golden.featureId,
      severity: 'error',
      reason: `Missing required signals in strict mode: ${observed.missingRequired.join(', ')}`,
    });
  }

  return issues;
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = parseModeArg(args);
  const sampleResultsPath = parsePathArg(args, 'sample', defaultSampleResultsPath);
  const reportPath = parsePathArg(args, 'report', defaultReportPath);
  const corpus = await readJson<GoldenCorpus>(corpusPath);
  const sample = await readJson<SampleResults>(sampleResultsPath);

  const policy = corpus.thresholdPolicy[mode];
  if (!policy) {
    throw new Error(`Threshold policy missing for mode=${mode}`);
  }

  const issues: DriftIssue[] = [];
  issues.push(...assertTupleCoverage(corpus, sample));

  const sampleByCase = new Map(sample.cases.map((item) => [item.caseId, item]));

  for (const goldenCase of corpus.cases) {
    const observed = sampleByCase.get(goldenCase.caseId);
    if (!observed) {
      continue;
    }

    issues.push(...evaluateCase(goldenCase, observed, policy));
  }

  const warnings = issues.filter((item) => item.severity === 'warning').length;
  const errors = issues.filter((item) => item.severity === 'error').length;
  const scoreSum = sample.cases.reduce((acc, item) => acc + item.score, 0);
  const averageScore = sample.cases.length > 0 ? scoreSum / sample.cases.length : 0;

  const warningBudgetExceeded = warnings > policy.warningBudget;
  if (warningBudgetExceeded) {
    issues.push({
      caseId: 'GLOBAL',
      featureId: 'global',
      severity: 'error',
      reason: `Warning budget exceeded: ${warnings}/${policy.warningBudget}`,
    });
  }

  const finalErrors = issues.filter((item) => item.severity === 'error').length;

  const report: EvalReport = {
    mode,
    generatedAt: new Date().toISOString(),
    corpusId: corpus.corpusId,
    policy,
    summary: {
      totalCases: corpus.cases.length,
      averageScore: Number(averageScore.toFixed(4)),
      warnings,
      errors: finalErrors,
      warningBudgetUsed: warnings,
      warningBudget: policy.warningBudget,
    },
    driftIssues: issues,
    cases: sample.cases,
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[FS-075 prompt-eval] mode=${mode}`);
  console.log(`[FS-075 prompt-eval] sample=${sampleResultsPath}`);
  console.log(`[FS-075 prompt-eval] policy=${policy.description}`);
  console.log(
    `[FS-075 prompt-eval] summary total=${report.summary.totalCases} avg=${report.summary.averageScore} warnings=${report.summary.warnings} errors=${report.summary.errors}`,
  );
  console.log(`[FS-075 prompt-eval] report=${reportPath}`);

  if (report.driftIssues.length > 0) {
    console.log('[FS-075 prompt-eval] drift issues:');
    for (const issue of report.driftIssues) {
      console.log(`- [${issue.severity}] ${issue.featureId}/${issue.caseId}: ${issue.reason}`);
    }
  }

  if (finalErrors > 0) {
    process.exitCode = 1;
  }
}

void run();
