import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface ForbiddenTokenRule {
  readonly token: 'SANDBOX' | 'QA' | 'STAGING';
  readonly disallowedValuePattern: RegExp;
}

export interface RemovedEnvironmentViolation {
  readonly filePath: string;
  readonly line: number;
  readonly token: ForbiddenTokenRule['token'];
}

/**
 * FS-106 T-07 executable-path gate scope.
 * Limited to active deployment API/config contracts.
 */
export const EXECUTABLE_PATHS = [
  'src/lambda/deployment/start-deploy-operation.ts',
  'src/lambda/deployment/start-promotion-operation.ts',
  'src/lambda/deployment/start-rollback-operation.ts',
  'src/lambda/deployment/environment-config.ts',
] as const;

export const FORBIDDEN_RULES: readonly ForbiddenTokenRule[] = [
  { token: 'SANDBOX', disallowedValuePattern: /['"]SANDBOX['"]/g },
  { token: 'QA', disallowedValuePattern: /['"]QA['"]/g },
  { token: 'STAGING', disallowedValuePattern: /['"]STAGING['"]/g },
];

export function violationLines(content: string, pattern: RegExp): number[] {
  const lines: number[] = [];
  const sourceLines = content.split('\n');

  for (let i = 0; i < sourceLines.length; i += 1) {
    const line = sourceLines[i];
    if (!line) {
      continue;
    }

    pattern.lastIndex = 0;
    if (pattern.test(line)) {
      lines.push(i + 1);
    }
  }

  return lines;
}

export function findRemovedEnvironmentViolations(input: {
  readonly filePath: string;
  readonly content: string;
}): RemovedEnvironmentViolation[] {
  const violations: RemovedEnvironmentViolation[] = [];

  for (const rule of FORBIDDEN_RULES) {
    const lines = violationLines(input.content, rule.disallowedValuePattern);
    for (const line of lines) {
      violations.push({
        filePath: input.filePath,
        line,
        token: rule.token,
      });
    }
  }

  return violations;
}

async function run(): Promise<void> {
  const violations: RemovedEnvironmentViolation[] = [];

  for (const filePath of EXECUTABLE_PATHS) {
    const absolutePath = resolve(process.cwd(), filePath);
    const content = await readFile(absolutePath, 'utf8');
    violations.push(...findRemovedEnvironmentViolations({ filePath, content }));
  }

  if (violations.length === 0) {
    return;
  }

  console.error('Removed deployment environment gate failed:');
  for (const violation of violations) {
    console.error(`- ${violation.filePath}:${violation.line} contains forbidden token '${violation.token}'`);
  }

  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void run();
}
