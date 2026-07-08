import { describe, expect, it } from 'vitest';

import {
  EXECUTABLE_PATHS,
  findRemovedEnvironmentViolations,
  violationLines,
} from '../../scripts/check-removed-deployment-environments.js';

describe('removed deployment environment gate', () => {
  it('scopes checks to T-07 executable deployment paths only', () => {
    expect(EXECUTABLE_PATHS).toEqual([
      'src/lambda/deployment/start-deploy-operation.ts',
      'src/lambda/deployment/start-promotion-operation.ts',
      'src/lambda/deployment/start-rollback-operation.ts',
      'src/lambda/deployment/environment-config.ts',
    ]);
  });

  it('treats runtime bootstrap template as DEV/PREPROD/PROD-only contract in T-13 scope', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const template = await readFile(resolve(process.cwd(), 'template.yaml'), 'utf8');

    expect(template).toContain('AllowedValues:');
    expect(template).toContain('- dev');
    expect(template).toContain('- preprod');
    expect(template).toContain('- prod');
    expect(template).not.toContain('- sandbox');
    expect(template).not.toContain('IsSandboxRuntime');
  });

  it('flags forbidden quoted environment tokens in executable content', () => {
    const violations = findRemovedEnvironmentViolations({
      filePath: 'src/lambda/deployment/start-deploy-operation.ts',
      content: [
        'const x = "SANDBOX";',
        "const y = 'QA';",
      ].join('\n'),
    });

    expect(violations).toEqual([
      {
        filePath: 'src/lambda/deployment/start-deploy-operation.ts',
        line: 1,
        token: 'SANDBOX',
      },
      {
        filePath: 'src/lambda/deployment/start-deploy-operation.ts',
        line: 2,
        token: 'QA',
      },
    ]);
  });

  it('allows non-quoted legacy mentions in comments/docs to avoid false positives', () => {
    const violations = findRemovedEnvironmentViolations({
      filePath: 'src/lambda/deployment/start-deploy-operation.ts',
      content: '// legacy QA mention; not executable token literal',
    });

    expect(violations).toEqual([]);
    expect(violationLines('const env = "DEV";', /['"]QA['"]/g)).toEqual([]);
  });
});
