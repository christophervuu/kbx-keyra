import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

export interface GuardrailViolation {
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
  readonly ruleId: string;
  readonly message: string;
}

interface GuardrailPattern {
  readonly ruleId: string;
  readonly message: string;
  readonly regex: RegExp;
}

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html']);

const FORBIDDEN_PATTERNS: readonly GuardrailPattern[] = [
  {
    ruleId: 'provider-import-openai',
    message: 'Browser/client code must not import openai SDK; use backend API via ApiAdapter/HttpAdapter.',
    regex: /\bfrom\s+['"]openai(?:\/[^'"]*)?['"]/g,
  },
  {
    ruleId: 'provider-import-openai-dynamic',
    message: 'Browser/client code must not dynamically import openai SDK; use backend API via ApiAdapter/HttpAdapter.',
    regex: /\bimport\s*\(\s*['"]openai(?:\/[^'"]*)?['"]\s*\)/g,
  },
  {
    ruleId: 'provider-import-openai-require',
    message: 'Browser/client code must not require openai SDK; use backend API via ApiAdapter/HttpAdapter.',
    regex: /\brequire\s*\(\s*['"]openai(?:\/[^'"]*)?['"]\s*\)/g,
  },
  {
    ruleId: 'provider-import-azure-openai',
    message: 'Browser/client code must not import @azure/openai SDK; use backend API via ApiAdapter/HttpAdapter.',
    regex: /\bfrom\s+['"]@azure\/openai(?:\/[^'"]*)?['"]/g,
  },
  {
    ruleId: 'provider-import-azure-openai-dynamic',
    message: 'Browser/client code must not dynamically import @azure/openai SDK; use backend API via ApiAdapter/HttpAdapter.',
    regex: /\bimport\s*\(\s*['"]@azure\/openai(?:\/[^'"]*)?['"]\s*\)/g,
  },
  {
    ruleId: 'provider-import-azure-openai-require',
    message: 'Browser/client code must not require @azure/openai SDK; use backend API via ApiAdapter/HttpAdapter.',
    regex: /\brequire\s*\(\s*['"]@azure\/openai(?:\/[^'"]*)?['"]\s*\)/g,
  },
  {
    ruleId: 'provider-constructor-openai',
    message: 'Browser/client code must not instantiate OpenAI SDK clients; use backend API via ApiAdapter/HttpAdapter.',
    regex: /\bnew\s+OpenAI\s*\(/g,
  },
  {
    ruleId: 'provider-domain-github-models',
    message: 'Browser/client code must not reference GitHub Models provider domain directly.',
    regex: /models\.inference\.ai\.azure\.com/gi,
  },
  {
    ruleId: 'provider-domain-openai',
    message: 'Browser/client code must not reference OpenAI provider domain directly.',
    regex: /api\.openai\.com/gi,
  },
  {
    ruleId: 'deprecated-hybrid-adapter-import',
    message: 'HybridAdapter is deprecated-retained only; do not introduce new callsites. Use createAdapter()/HttpAdapter path.',
    regex: /\bfrom\s+['"][^'"]*hybrid-adapter(?:\.[^'"]+)?['"]/g,
  },
  {
    ruleId: 'deprecated-hybrid-adapter-dynamic-import',
    message: 'HybridAdapter is deprecated-retained only; dynamic imports are prohibited.',
    regex: /\bimport\s*\(\s*['"][^'"]*hybrid-adapter(?:\.[^'"]+)?['"]\s*\)/g,
  },
  {
    ruleId: 'deprecated-hybrid-adapter-require',
    message: 'HybridAdapter is deprecated-retained only; require() usage is prohibited.',
    regex: /\brequire\s*\(\s*['"][^'"]*hybrid-adapter(?:\.[^'"]+)?['"]\s*\)/g,
  },
  {
    ruleId: 'legacy-ai-api-client-import',
    message: 'ai-api-client is legacy-only; use ApiAdapter/HttpAdapter methods instead of direct helper imports.',
    regex: /\bfrom\s+['"][^'"]*ai-api-client(?:\.[^'"]+)?['"]/g,
  },
];

const RULE_FILE_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
  'deprecated-hybrid-adapter-import': [
    'src/lib/api/hybrid-adapter.ts',
    'src/lib/api/__tests__/hybrid-adapter.test.ts',
  ],
  'deprecated-hybrid-adapter-dynamic-import': [
    'src/lib/api/hybrid-adapter.ts',
    'src/lib/api/__tests__/hybrid-adapter.test.ts',
  ],
  'deprecated-hybrid-adapter-require': [
    'src/lib/api/hybrid-adapter.ts',
    'src/lib/api/__tests__/hybrid-adapter.test.ts',
  ],
  'legacy-ai-api-client-import': [
    'src/lib/api/hybrid-adapter.ts',
    'src/lib/api/__tests__/ai-api-client.test.ts',
    'src/lib/api/__tests__/hybrid-adapter.test.ts',
  ],
};

function getLineAndColumn(source: string, index: number): { line: number; column: number } {
  const leading = source.slice(0, index);
  const line = leading.split('\n').length;
  const lineStart = leading.lastIndexOf('\n');
  return {
    line,
    column: index - lineStart,
  };
}

function isAllowlisted(ruleId: string, filePath: string): boolean {
  const allowlistedPaths = RULE_FILE_ALLOWLIST[ruleId];
  if (!allowlistedPaths) {
    return false;
  }

  const normalizedPath = filePath.replace(/\\/g, '/');
  return allowlistedPaths.some((allowed) => normalizedPath.endsWith(allowed));
}

export function findGuardrailViolationsInText(
  source: string,
  filePath: string,
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  for (const pattern of FORBIDDEN_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(source)) !== null) {
      const startIndex = match.index;
      const { line, column } = getLineAndColumn(source, startIndex);

      if (isAllowlisted(pattern.ruleId, filePath)) {
        continue;
      }

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

async function collectFiles(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath);
  const filePaths: string[] = [];

  for (const entry of entries) {
    const absolute = join(rootPath, entry);
    const details = await stat(absolute);

    if (details.isDirectory()) {
      const nested = await collectFiles(absolute);
      filePaths.push(...nested);
      continue;
    }

    if (!SCAN_EXTENSIONS.has(extname(absolute))) {
      continue;
    }

    filePaths.push(absolute);
  }

  return filePaths;
}

export async function findUiAiGuardrailViolations(uiRootPath = resolve(process.cwd(), 'ui')): Promise<
  GuardrailViolation[]
> {
  const scanRoots = [join(uiRootPath, 'src')];
  const violations: GuardrailViolation[] = [];

  for (const rootPath of scanRoots) {
    const files = await collectFiles(rootPath);

    for (const filePath of files) {
      const source = await readFile(filePath, 'utf8');
      const relativePath = relative(process.cwd(), filePath);
      const fileViolations = findGuardrailViolationsInText(source, relativePath);
      violations.push(...fileViolations);
    }
  }

  return violations;
}

function formatViolation(violation: GuardrailViolation): string {
  return `${violation.filePath}:${violation.line}:${violation.column} [${violation.ruleId}] ${violation.message}`;
}

async function runCli(): Promise<void> {
  const violations = await findUiAiGuardrailViolations();

  if (violations.length === 0) {
    return;
  }

  console.error('UI AI guardrail violations detected. Approved path is UI → ApiAdapter/HttpAdapter → backend AI endpoints.');
  for (const violation of violations) {
    console.error(`- ${formatViolation(violation)}`);
  }

  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runCli();
}
