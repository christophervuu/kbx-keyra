import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import {
  execute,
  type Diagnostic,
  type ExecutionResult,
  type MappingConfig,
  type TraceEntry,
} from '../src/engine/index.js';

interface LoadedFixture {
  readonly name: string;
  readonly description: string;
  readonly sourceSchema: unknown;
  readonly targetSchema: unknown;
  readonly sourceData: unknown;
  readonly mappingConfig: MappingConfig;
  readonly expectedOutput?: unknown;
}

interface FixtureRunOutcome {
  readonly hasErrorDiagnostics: boolean;
}

interface DiagnosticCounts {
  readonly error: number;
  readonly warning: number;
  readonly info: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const fixturesRoot = path.join(repoRoot, 'tests', 'engine', 'fixtures');

const ansiEnabled = process.stdout.isTTY && process.env.NO_COLOR === undefined;

const ANSI = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  green: '\u001b[32m',
  cyan: '\u001b[36m',
  magenta: '\u001b[35m',
};

function color(text: string, code: string): string {
  if (!ansiEnabled) {
    return text;
  }

  return `${code}${text}${ANSI.reset}`;
}

function bold(text: string): string {
  return color(text, ANSI.bold);
}

function dim(text: string): string {
  return color(text, ANSI.dim);
}

function success(text: string): string {
  return color(text, ANSI.green);
}

function warning(text: string): string {
  return color(text, ANSI.yellow);
}

function error(text: string): string {
  return color(text, ANSI.red);
}

function heading(text: string): string {
  return color(text, ANSI.cyan);
}

function section(text: string): string {
  return color(text, ANSI.magenta);
}

function indent(text: string, spaces = 3): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => `${pad}${line}`)
    .join('\n');
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function abbreviateJson(value: unknown, maxChars = 900): string {
  const formatted = prettyJson(value);
  if (formatted.length <= maxChars) {
    return formatted;
  }

  return `${formatted.slice(0, maxChars)}\n... (truncated ${formatted.length - maxChars} chars)`;
}

function summarizeDiagnostics(diagnostics: readonly Diagnostic[]): DiagnosticCounts {
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === 'error') {
      errorCount += 1;
      continue;
    }

    if (diagnostic.severity === 'warning') {
      warningCount += 1;
      continue;
    }

    infoCount += 1;
  }

  return {
    error: errorCount,
    warning: warningCount,
    info: infoCount,
  };
}

function usage(): string {
  return [
    'Usage:',
    '  npx tsx scripts/run-engine.ts [test-name | --all | --list]',
    '',
    'Options:',
    '  --list      List available fixture names and exit',
    '  --all       Run all fixtures sequentially',
    '  test-name   Run one fixture by fixture directory name',
    '',
    'No argument behaves the same as --all.',
  ].join('\n');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

async function listFixtureNames(): Promise<string[]> {
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function firstDescriptionLine(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? 'No description provided.';
}

async function loadFixture(name: string): Promise<LoadedFixture> {
  const fixtureDir = path.join(fixturesRoot, name);

  const requiredFiles = {
    sourceSchema: path.join(fixtureDir, 'source-schema.json'),
    targetSchema: path.join(fixtureDir, 'target-schema.json'),
    sourceData: path.join(fixtureDir, 'source-data.json'),
    mappingConfig: path.join(fixtureDir, 'mapping-config.json'),
    description: path.join(fixtureDir, 'description.md'),
  } as const;

  for (const [label, filePath] of Object.entries(requiredFiles)) {
    if (!(await fileExists(filePath))) {
      throw new Error(`Fixture "${name}" missing required file: ${label} (${filePath})`);
    }
  }

  const expectedOutputPath = path.join(fixtureDir, 'expected-output.json');
  const hasExpectedOutput = await fileExists(expectedOutputPath);

  return {
    name,
    description: (await readFile(requiredFiles.description, 'utf-8')).trim(),
    sourceSchema: await readJson(requiredFiles.sourceSchema),
    targetSchema: await readJson(requiredFiles.targetSchema),
    sourceData: await readJson(requiredFiles.sourceData),
    mappingConfig: await readJson<MappingConfig>(requiredFiles.mappingConfig),
    expectedOutput: hasExpectedOutput ? await readJson(expectedOutputPath) : undefined,
  };
}

function printDiagnostics(diagnostics: readonly Diagnostic[]): void {
  const counts = summarizeDiagnostics(diagnostics);
  const summary =
    counts.error > 0
      ? error(`Diagnostics: ${counts.error} errors, ${counts.warning} warnings, ${counts.info} info`)
      : counts.warning > 0
        ? warning(`Diagnostics: ${counts.error} errors, ${counts.warning} warnings, ${counts.info} info`)
        : success(`Diagnostics: ${counts.error} errors, ${counts.warning} warnings, ${counts.info} info`);

  console.log(summary);

  if (diagnostics.length === 0) {
    return;
  }

  for (const diagnostic of diagnostics) {
    const severityLabel =
      diagnostic.severity === 'error'
        ? error('error')
        : diagnostic.severity === 'warning'
          ? warning('warning')
          : dim('info');

    const ruleSuffix = diagnostic.ruleIndex === undefined ? 'n/a' : String(diagnostic.ruleIndex);
    const line = `${severityLabel} ${diagnostic.code} [rule ${ruleSuffix}] ${diagnostic.message}`;
    console.log(indent(line));
  }
}

function printTrace(trace: readonly TraceEntry[] | undefined): void {
  if (trace === undefined) {
    console.log(dim('Trace: not collected (trace mode disabled).'));
    return;
  }

  console.log(section(`Trace Entries: ${trace.length}`));

  if (trace.length === 0) {
    return;
  }

  for (const entry of trace) {
    const headerText = `Rule ${entry.ruleIndex} -> ${entry.targetPath}`;
    console.log(indent(bold(headerText)));
    console.log(indent(`expression: ${entry.expression}`, 5));
    console.log(indent(`output: ${abbreviateJson(entry.outputValue, 240).replace(/\n/g, '\n     ')}`, 5));

    if (entry.diagnostics !== undefined && entry.diagnostics.length > 0) {
      const diagLine = entry.diagnostics
        .map((diagnostic) => `${diagnostic.code}(${diagnostic.severity})`)
        .join(', ');
      console.log(indent(`diagnostics: ${diagLine}`, 5));
    }

    if (entry.durationMs !== undefined) {
      console.log(indent(`durationMs: ${entry.durationMs}`, 5));
    }
  }
}

function printStats(result: ExecutionResult): void {
  if (result.stats === undefined) {
    console.log(dim('Stats: not available.'));
    return;
  }

  const { rulesEvaluated, rulesSucceeded, rulesFailed, durationMs } = result.stats;
  const text = `Stats: ${rulesSucceeded}/${rulesEvaluated} succeeded, ${rulesFailed} failed (${durationMs}ms)`;

  if (rulesFailed > 0) {
    console.log(warning(text));
    return;
  }

  console.log(success(text));
}

function printExpectedComparison(actual: unknown, expectedOutput: unknown | undefined): void {
  if (expectedOutput === undefined) {
    console.log(dim('Expected output comparison: skipped (no expected-output.json).'));
    return;
  }

  if (isDeepStrictEqual(actual, expectedOutput)) {
    console.log(success('Expected output comparison: PASS'));
    return;
  }

  console.log(error('Expected output comparison: FAIL'));
  console.log(indent('Expected:'));
  console.log(indent(prettyJson(expectedOutput), 5));
}

function printFixtureHeader(name: string, description: string): void {
  console.log(heading('============================================================'));
  console.log(heading(`Test: ${name}`));
  console.log(indent(firstDescriptionLine(description)));
  console.log(dim('------------------------------------------------------------'));
}

async function runFixture(fixture: LoadedFixture): Promise<FixtureRunOutcome> {
  printFixtureHeader(fixture.name, fixture.description);

  console.log(section('Source Data:'));
  console.log(indent(abbreviateJson(fixture.sourceData)));

  console.log();
  console.log(section(`Executing ${fixture.mappingConfig.rules.length} rules...`));

  const result = execute(
    fixture.mappingConfig,
    fixture.sourceData,
    fixture.sourceSchema,
    fixture.targetSchema,
    { trace: true },
  );

  console.log();
  console.log(section('Output:'));
  console.log(indent(prettyJson(result.output)));

  console.log();
  printDiagnostics(result.diagnostics);

  console.log();
  printTrace(result.trace);

  console.log();
  printStats(result);

  console.log();
  printExpectedComparison(result.output, fixture.expectedOutput);

  console.log(heading('============================================================'));
  console.log();

  return {
    hasErrorDiagnostics: result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
  };
}

async function runList(): Promise<void> {
  const names = await listFixtureNames();

  if (names.length === 0) {
    console.log('No fixtures found.');
    return;
  }

  console.log(bold('Available fixtures:'));

  for (const name of names) {
    const descriptionPath = path.join(fixturesRoot, name, 'description.md');
    const description = (await fileExists(descriptionPath))
      ? firstDescriptionLine(await readFile(descriptionPath, 'utf-8'))
      : 'No description provided.';
    console.log(`- ${name}: ${description}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length > 1) {
    console.error(error('Too many arguments.'));
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const selected = args[0];

  if (selected === '--list') {
    await runList();
    return;
  }

  const allFixtureNames = await listFixtureNames();

  if (allFixtureNames.length === 0) {
    console.error(error('No fixture directories found under tests/engine/fixtures.'));
    process.exitCode = 1;
    return;
  }

  let namesToRun: string[];

  if (selected === undefined || selected === '--all') {
    namesToRun = allFixtureNames;
  } else if (selected.startsWith('--')) {
    console.error(error(`Unknown option: ${selected}`));
    console.error(usage());
    process.exitCode = 1;
    return;
  } else {
    if (!allFixtureNames.includes(selected)) {
      console.error(error(`Fixture not found: ${selected}`));
      console.error('Use --list to see available fixtures.');
      process.exitCode = 1;
      return;
    }

    namesToRun = [selected];
  }

  let hadRunnerError = false;
  let hadErrorDiagnostics = false;

  for (const name of namesToRun) {
    try {
      const fixture = await loadFixture(name);
      const outcome = await runFixture(fixture);
      hadErrorDiagnostics ||= outcome.hasErrorDiagnostics;
    } catch (loadOrRunError) {
      hadRunnerError = true;
      const message = loadOrRunError instanceof Error ? loadOrRunError.message : String(loadOrRunError);
      console.error(error(`Failed fixture "${name}": ${message}`));
      console.error();
    }
  }

  if (hadRunnerError || hadErrorDiagnostics) {
    process.exitCode = 1;
    return;
  }

  process.exitCode = 0;
}

void main();
