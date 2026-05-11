import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { handler } from '../src/lambda/ai/suggest-expression.js';

interface FixtureAssertions {
  readonly requiresModel?: boolean;
  readonly expectedStatusCode?: number;
  readonly expectedBodyContains?: readonly string[];
}

interface LoadedFixture {
  readonly name: string;
  readonly description: string;
  readonly request: Record<string, unknown>;
  readonly assertions: FixtureAssertions;
}

interface FixtureRunOutcome {
  readonly skipped: boolean;
  readonly failed: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const fixturesRoot = path.join(repoRoot, 'tests', 'lambda', 'ai', 'fixtures', 'suggest-expression');

const defaultPromptRegistryDir = './tests/lib/ai/fixtures/local-runtime';
const defaultDslAssetPath = './tests/lib/ai/fixtures/local-runtime/dsl-reference.md';

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

function abbreviateText(value: string, maxChars = 1600): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n... (truncated ${value.length - maxChars} chars)`;
}

function usage(): string {
  return [
    'Usage:',
    '  npx tsx scripts/run-suggest-expression.ts [fixture-name | --all | --list | --examples | --env | --help]',
    '',
    'Options:',
    '  --list       List fixture names and descriptions',
    '  --all        Run all fixtures sequentially (default)',
    '  --examples   Print fixture request examples and exit',
    '  --env        Print required environment variables and example exports',
    '  --help       Show this help text',
    '',
    'No argument behaves the same as --all.',
  ].join('\n');
}

function firstDescriptionLine(markdown: string): string {
  return (
    markdown
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? 'No description provided.'
  );
}

function hasGithubToken(): boolean {
  const token = process.env.GITHUB_TOKEN;
  return typeof token === 'string' && token.trim().length > 0;
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

function normalizeAssertions(raw: unknown): FixtureAssertions {
  if (typeof raw !== 'object' || raw === null) {
    return {};
  }

  const obj = raw as Record<string, unknown>;
  const expectedBodyContainsRaw = obj.expectedBodyContains;

  return {
    requiresModel: typeof obj.requiresModel === 'boolean' ? obj.requiresModel : undefined,
    expectedStatusCode: typeof obj.expectedStatusCode === 'number' ? obj.expectedStatusCode : undefined,
    expectedBodyContains:
      Array.isArray(expectedBodyContainsRaw) && expectedBodyContainsRaw.every((item) => typeof item === 'string')
        ? (expectedBodyContainsRaw as string[])
        : undefined,
  };
}

async function loadFixture(name: string): Promise<LoadedFixture> {
  const fixtureDir = path.join(fixturesRoot, name);

  const requestPath = path.join(fixtureDir, 'request.json');
  if (!(await fileExists(requestPath))) {
    throw new Error(`Fixture "${name}" missing required file: request (${requestPath})`);
  }

  const request = await readJson<unknown>(requestPath);
  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    throw new Error(`Fixture "${name}" has invalid request.json: expected JSON object`);
  }

  const descriptionPath = path.join(fixtureDir, 'description.md');
  const description = (await fileExists(descriptionPath))
    ? (await readFile(descriptionPath, 'utf-8')).trim()
    : 'No description provided.';

  const assertionsPath = path.join(fixtureDir, 'assertions.json');
  const assertions = (await fileExists(assertionsPath))
    ? normalizeAssertions(await readJson<unknown>(assertionsPath))
    : {};

  return {
    name,
    description,
    request: request as Record<string, unknown>,
    assertions,
  };
}

function printFixtureHeader(name: string, description: string): void {
  console.log(heading('============================================================'));
  console.log(heading(`Fixture: ${name}`));
  console.log(indent(firstDescriptionLine(description)));
  console.log(dim('------------------------------------------------------------'));
}

function printEnvSummary(): void {
  const mode = process.env.AI_RUNTIME_MODE;
  const localPromptDir = process.env.PROMPT_REGISTRY_LOCAL_DIR;
  const localDslPath = process.env.DSL_ASSET_LOCAL_PATH;

  console.log(section('Environment Summary:'));
  console.log(indent(`AI_RUNTIME_MODE=${mode ?? '<unset>'}`));
  console.log(indent(`PROMPT_REGISTRY_LOCAL_DIR=${localPromptDir ?? '<unset>'}`));
  console.log(indent(`DSL_ASSET_LOCAL_PATH=${localDslPath ?? '<unset>'}`));
  console.log(indent(`GITHUB_TOKEN=${hasGithubToken() ? '<set>' : '<unset>'}`));

  if (mode !== 'local') {
    console.log(indent(warning('Tip: set AI_RUNTIME_MODE=local to use local adapters.')));
  }
}

async function runFixture(fixture: LoadedFixture): Promise<FixtureRunOutcome> {
  printFixtureHeader(fixture.name, fixture.description);

  if (fixture.assertions.requiresModel && !hasGithubToken()) {
    console.log(warning('Skipping fixture: requires GITHUB_TOKEN but token is not set.'));
    console.log(heading('============================================================'));
    console.log();
    return {
      skipped: true,
      failed: false,
    };
  }

  console.log(section('Request Body:'));
  console.log(indent(prettyJson(fixture.request)));

  const response = await handler({
    body: JSON.stringify(fixture.request),
    headers: {},
  });

  console.log();
  console.log(section('Response Status:'));
  console.log(indent(String(response.statusCode)));

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(response.body) as unknown;
  } catch {
    parsedBody = response.body;
  }

  console.log();
  console.log(section('Response Body:'));
  const printableBody = typeof parsedBody === 'string' ? parsedBody : prettyJson(parsedBody);
  console.log(indent(abbreviateText(printableBody)));

  let failed = false;

  if (fixture.assertions.expectedStatusCode !== undefined) {
    if (response.statusCode === fixture.assertions.expectedStatusCode) {
      console.log();
      console.log(success(`Status assertion: PASS (${response.statusCode})`));
    } else {
      console.log();
      console.log(
        error(
          `Status assertion: FAIL (expected ${fixture.assertions.expectedStatusCode}, got ${response.statusCode})`,
        ),
      );
      failed = true;
    }
  }

  const expectedSubstrings = fixture.assertions.expectedBodyContains;
  if (expectedSubstrings !== undefined && expectedSubstrings.length > 0) {
    for (const text of expectedSubstrings) {
      const contains = response.body.includes(text);
      if (contains) {
        console.log(success(`Body assertion: PASS contains ${JSON.stringify(text)}`));
      } else {
        console.log(error(`Body assertion: FAIL missing ${JSON.stringify(text)}`));
        failed = true;
      }
    }
  }

  console.log(heading('============================================================'));
  console.log();

  return {
    skipped: false,
    failed,
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

async function runExamples(): Promise<void> {
  const names = await listFixtureNames();

  if (names.length === 0) {
    console.log('No fixtures found.');
    return;
  }

  console.log(bold('Request examples:'));

  for (const name of names) {
    const fixture = await loadFixture(name);
    console.log();
    console.log(section(name));
    console.log(indent(prettyJson(fixture.request)));
  }
}

function runEnv(): void {
  console.log(bold('Required environment variables for local suggest-expression runs:'));
  console.log();
  console.log('1. AI_RUNTIME_MODE=local');
  console.log('2. PROMPT_REGISTRY_LOCAL_DIR=<dir with nl-to-rule.json>');
  console.log('3. DSL_ASSET_LOCAL_PATH=<path to dsl-reference.md>');
  console.log('4. GITHUB_TOKEN=<GitHub Models token>');
  console.log();
  console.log(dim('Example exports (from repo root):'));
  console.log(`export AI_RUNTIME_MODE=local`);
  console.log(`export PROMPT_REGISTRY_LOCAL_DIR="${defaultPromptRegistryDir}"`);
  console.log(`export DSL_ASSET_LOCAL_PATH="${defaultDslAssetPath}"`);
  console.log('export GITHUB_TOKEN="<your-token>"');
  console.log();
  printEnvSummary();
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

  if (args.length > 1) {
    console.error(error('Too many arguments.'));
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const selected = args[0];

  if (selected === '--help') {
    console.log(usage());
    return;
  }

  if (selected === '--env') {
    runEnv();
    return;
  }

  if (selected === '--list') {
    await runList();
    return;
  }

  if (selected === '--examples') {
    await runExamples();
    return;
  }

  const allFixtureNames = await listFixtureNames();

  if (allFixtureNames.length === 0) {
    console.error(error('No fixture directories found under tests/lambda/ai/fixtures/suggest-expression.'));
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

  printEnvSummary();
  console.log();

  let hadRunnerError = false;
  let hadFailedFixture = false;

  for (const name of namesToRun) {
    try {
      const fixture = await loadFixture(name);
      const outcome = await runFixture(fixture);
      hadFailedFixture ||= outcome.failed;
    } catch (loadOrRunError) {
      hadRunnerError = true;
      const message = loadOrRunError instanceof Error ? loadOrRunError.message : String(loadOrRunError);
      console.error(error(`Failed fixture "${name}": ${message}`));
      console.error();
    }
  }

  if (hadRunnerError || hadFailedFixture) {
    process.exitCode = 1;
    return;
  }

  process.exitCode = 0;
}

void main();
