import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface MatrixCheck {
  readonly checkId: string;
  readonly description: string;
  readonly implements: readonly string[];
  readonly command: string;
}

interface MatrixFeature {
  readonly featureId: string;
  readonly featureName: string;
  readonly sourceSpec: string;
  readonly deterministicChecks: readonly MatrixCheck[];
}

interface DeterministicMatrix {
  readonly matrixId: string;
  readonly spec: string;
  readonly specRevision: number;
  readonly task: string;
  readonly updatedAt: string;
  readonly features: readonly MatrixFeature[];
  readonly globalDeterministicChecks?: readonly MatrixCheck[];
}

interface ExecutedCheck {
  readonly check: MatrixCheck;
  readonly scope: string;
  readonly code: number;
  readonly durationMs: number;
}

const matrixPath = resolve(
  process.cwd(),
  'forge/active/FS-075/deterministic-verification-matrix.json',
);

async function loadMatrix(): Promise<DeterministicMatrix> {
  const raw = await readFile(matrixPath, 'utf8');
  const parsed = JSON.parse(raw) as DeterministicMatrix;

  if (!parsed.features?.length) {
    throw new Error('Deterministic matrix has no features.');
  }

  return parsed;
}

function runShellCommand(command: string): Promise<{ code: number; durationMs: number }> {
  const started = Date.now();

  return new Promise((resolveResult, reject) => {
    const child = spawn(command, {
      cwd: process.cwd(),
      shell: true,
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      resolveResult({
        code: code ?? 1,
        durationMs: Date.now() - started,
      });
    });
  });
}

async function run(): Promise<void> {
  const matrix = await loadMatrix();
  const checks: Array<{ scope: string; check: MatrixCheck }> = [];

  for (const feature of matrix.features) {
    for (const check of feature.deterministicChecks) {
      checks.push({
        scope: `feature:${feature.featureId}`,
        check,
      });
    }
  }

  for (const check of matrix.globalDeterministicChecks ?? []) {
    checks.push({
      scope: 'global',
      check,
    });
  }

  const results: ExecutedCheck[] = [];

  console.log(
    `[FS-075 deterministic gate] Matrix=${matrix.matrixId} Spec=${matrix.spec} Rev=${matrix.specRevision} Checks=${checks.length}`,
  );

  for (const entry of checks) {
    console.log(`\n[CHECK START] ${entry.scope} :: ${entry.check.checkId}`);
    console.log(`Description: ${entry.check.description}`);
    console.log(`Implements: ${entry.check.implements.join(', ')}`);
    console.log(`Command: ${entry.check.command}`);

    const execution = await runShellCommand(entry.check.command);

    results.push({
      scope: entry.scope,
      check: entry.check,
      code: execution.code,
      durationMs: execution.durationMs,
    });

    const status = execution.code === 0 ? 'PASS' : 'FAIL';
    console.log(`[CHECK ${status}] ${entry.check.checkId} (${execution.durationMs}ms)`);

    if (execution.code !== 0) {
      break;
    }
  }

  const failed = results.filter((result) => result.code !== 0);

  console.log('\n=== FS-075 Deterministic Gate Summary ===');
  for (const result of results) {
    const status = result.code === 0 ? 'PASS' : 'FAIL';
    console.log(
      `- ${status} | ${result.scope} | ${result.check.checkId} | ${result.durationMs}ms | ${result.check.command}`,
    );
  }

  const executedCount = results.length;
  const totalCount = checks.length;
  console.log(`Executed ${executedCount}/${totalCount} checks.`);

  if (failed.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log('Deterministic gate passed.');
}

void run();
