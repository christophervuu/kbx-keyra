import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const reportPath = join(process.cwd(), 'forge/active/FS-075/prompt-eval-report.json');

describe('FS-075 prompt eval runner outputs', () => {
  it('writes report with required summary fields', async () => {
    const raw = await readFile(reportPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      mode: string;
      summary: {
        totalCases: number;
        averageScore: number;
        warnings: number;
        errors: number;
      };
      driftIssues: Array<{ severity: string }>;
    };

    expect(['pr', 'release']).toContain(parsed.mode);
    expect(parsed.summary.totalCases).toBeGreaterThan(0);
    expect(parsed.summary.averageScore).toBeGreaterThan(0);
    expect(parsed.summary.averageScore).toBeLessThanOrEqual(1);
    expect(Array.isArray(parsed.driftIssues)).toBe(true);
  });
});
