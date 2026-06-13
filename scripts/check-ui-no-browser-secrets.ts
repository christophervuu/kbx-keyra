import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

export interface SecretViolation {
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
  readonly ruleId: string;
  readonly message: string;
}

interface SecretPattern {
  readonly ruleId: string;
  readonly message: string;
  readonly regex: RegExp;
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html']);
const DIST_EXTENSIONS = new Set(['.js', '.css', '.html', '.map']);

const FORBIDDEN_SOURCE_PATTERNS: readonly SecretPattern[] = [
  {
    ruleId: 'forbidden-env-github-token',
    message: 'UI/browser code must not reference GITHUB_TOKEN.',
    regex: /(?:import\.meta\.env|process\.env)\.GITHUB_TOKEN\b/g,
  },
  {
    ruleId: 'forbidden-env-openai-api-key',
    message: 'UI/browser code must not reference OPENAI_API_KEY.',
    regex: /(?:import\.meta\.env|process\.env)\.OPENAI_API_KEY\b/g,
  },
  {
    ruleId: 'forbidden-env-azure-openai-api-key',
    message: 'UI/browser code must not reference AZURE_OPENAI_API_KEY.',
    regex: /(?:import\.meta\.env|process\.env)\.AZURE_OPENAI_API_KEY\b/g,
  },
  {
    ruleId: 'forbidden-env-generic-secret',
    message: 'UI/browser code must not reference secret-like env names directly.',
    regex: /(?:import\.meta\.env|process\.env)\.(?:.*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY).*)\b/g,
  },
  {
    ruleId: 'forbidden-provider-token-literal',
    message: 'UI/browser code must not contain provider token literals (ghp_/sk- style).',
    regex: /\b(?:ghp_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{10,})\b/g,
  },
  {
    ruleId: 'forbidden-provider-domain-openai',
    message: 'UI/browser code must not reference api.openai.com directly.',
    regex: /api\.openai\.com/gi,
  },
  {
    ruleId: 'forbidden-provider-domain-github-models',
    message: 'UI/browser code must not reference models.inference.ai.azure.com directly.',
    regex: /models\.inference\.ai\.azure\.com/gi,
  },
];

const FORBIDDEN_DIST_PATTERNS: readonly SecretPattern[] = [
  {
    ruleId: 'dist-token-literal',
    message: 'Built artifact appears to include provider token literal (ghp_/sk- style).',
    regex: /\b(?:ghp_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{10,})\b/g,
  },
  {
    ruleId: 'dist-forbidden-env-name',
    message: 'Built artifact contains forbidden env name reference.',
    regex: /\b(?:GITHUB_TOKEN|OPENAI_API_KEY|AZURE_OPENAI_API_KEY)\b/g,
  },
];

function getLineAndColumn(source: string, index: number): { line: number; column: number } {
  const leading = source.slice(0, index);
  const line = leading.split('\n').length;
  const lineStart = leading.lastIndexOf('\n');
  return {
    line,
    column: index - lineStart,
  };
}

function isTestFile(path: string): boolean {
  return /(?:\.test\.|\.spec\.|__tests__)/.test(path);
}

function findViolationsByPatterns(
  source: string,
  filePath: string,
  patterns: readonly SecretPattern[],
): SecretViolation[] {
  const violations: SecretViolation[] = [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(source)) !== null) {
      const { line, column } = getLineAndColumn(source, match.index);
      violations.push({
        filePath,
        line,
        column,
        ruleId: pattern.ruleId,
        message: pattern.message,
      });
    }
  }

  return violations;
}

export function findSecretViolationsInText(source: string, filePath: string): SecretViolation[] {
  return findViolationsByPatterns(source, filePath, FORBIDDEN_SOURCE_PATTERNS);
}

async function collectFiles(
  rootPath: string,
  extensions: ReadonlySet<string>,
  includeTestFiles: boolean,
): Promise<string[]> {
  const entries = await readdir(rootPath);
  const filePaths: string[] = [];

  for (const entry of entries) {
    const absolute = join(rootPath, entry);
    const details = await stat(absolute);

    if (details.isDirectory()) {
      const nested = await collectFiles(absolute, extensions, includeTestFiles);
      filePaths.push(...nested);
      continue;
    }

    if (!extensions.has(extname(absolute))) {
      continue;
    }

    if (!includeTestFiles && isTestFile(absolute)) {
      continue;
    }

    filePaths.push(absolute);
  }

  return filePaths;
}

export async function findUiBrowserSecretViolations(
  uiRootPath = resolve(process.cwd(), 'ui'),
): Promise<SecretViolation[]> {
  const sourceRoot = join(uiRootPath, 'src');
  const sourceFiles = await collectFiles(sourceRoot, SOURCE_EXTENSIONS, false);

  const violations: SecretViolation[] = [];

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, 'utf8');
    const relativePath = relative(process.cwd(), filePath);
    violations.push(...findSecretViolationsInText(source, relativePath));
  }

  return violations;
}

export async function findBuiltArtifactSecretViolations(
  uiRootPath = resolve(process.cwd(), 'ui'),
): Promise<SecretViolation[]> {
  const distRoot = join(uiRootPath, 'dist');

  try {
    const distFiles = await collectFiles(distRoot, DIST_EXTENSIONS, true);
    const violations: SecretViolation[] = [];

    for (const filePath of distFiles) {
      const source = await readFile(filePath, 'utf8');
      const relativePath = relative(process.cwd(), filePath);
      violations.push(...findViolationsByPatterns(source, relativePath, FORBIDDEN_DIST_PATTERNS));
    }

    return violations;
  } catch {
    return [];
  }
}

function formatViolation(violation: SecretViolation): string {
  return `${violation.filePath}:${violation.line}:${violation.column} [${violation.ruleId}] ${violation.message}`;
}

async function runCli(): Promise<void> {
  const sourceViolations = await findUiBrowserSecretViolations();
  const distViolations = await findBuiltArtifactSecretViolations();
  const allViolations = [...sourceViolations, ...distViolations];

  if (allViolations.length === 0) {
    return;
  }

  console.error('UI browser-secret policy violations detected. Client surfaces must not expose AI/provider secrets.');
  for (const violation of allViolations) {
    console.error(`- ${formatViolation(violation)}`);
  }

  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runCli();
}
