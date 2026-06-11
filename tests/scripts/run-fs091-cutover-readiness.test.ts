import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('FS-091 cutover readiness runner outputs', () => {
  it('writes report with go/no-go and rollback triggers', async () => {
    const reportPath = join(process.cwd(), 'forge/active/FS-091/benchmarks/cutover-readiness-report.json');

    await rm(reportPath, { force: true });
    await import('../../scripts/run-fs091-cutover-readiness.js');

    const raw = await readFile(reportPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      summary: {
        goNoGo: 'go' | 'no-go';
        rollbackTriggers: string[];
      };
      cutover: {
        passed: boolean;
        parityGate: {
          averageJaccardAt10: number;
          averageNdcgDeltaAt10: number;
        };
      };
    };

    expect(parsed.summary.goNoGo).toBe('go');
    expect(Array.isArray(parsed.summary.rollbackTriggers)).toBe(true);
    expect(parsed.summary.rollbackTriggers).toHaveLength(0);
    expect(parsed.cutover.passed).toBe(true);
    expect(parsed.cutover.parityGate.averageJaccardAt10).toBeGreaterThanOrEqual(0.7);
    expect(parsed.cutover.parityGate.averageNdcgDeltaAt10).toBeGreaterThanOrEqual(-0.1);
  });
});
