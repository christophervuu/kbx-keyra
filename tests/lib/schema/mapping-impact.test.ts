import { describe, expect, it } from 'vitest';

import {
  computeRoleImpactSummary,
  extractRuleUsageFromExpression,
} from '../../../src/lib/schema/mapping-impact.js';

describe('mapping-impact utilities', () => {
  it('extracts source/get paths from AST and ignores string literals that only look like paths', () => {
    const usage = extractRuleUsageFromExpression(
      'concat("source(Customer.Id)", source("Invoice.Id"), get(source("Invoice"), "Total"))',
    );

    expect(usage.sourcePaths).toEqual(['Invoice', 'Invoice.Id', 'Invoice.Total']);
  });

  it('extracts external alias paths from AST get(external(...), ...)', () => {
    const usage = extractRuleUsageFromExpression(
      'default(get(external("customerProfile"), "status"), "unknown")',
    );

    expect(usage.externalPaths).toEqual([
      { alias: 'customerProfile', path: '' },
      { alias: 'customerProfile', path: 'status' },
    ]);
  });

  it('computes role-aware impact classification for source role', () => {
    const summary = computeRoleImpactSummary({
      mapping: {
        name: 'Map',
        version: 1,
        engineVersion: '1.0.0',
        sourceSchemaRef: {
          schemaId: 'schema-source',
          type: 'local',
          schemaVersion: 1,
          schemaVersionId: 'sv-source-1',
          contentHash: 'hash-source-1',
        },
        targetSchemaRef: {
          schemaId: 'schema-target',
          type: 'local',
          schemaVersion: 1,
          schemaVersionId: 'sv-target-1',
          contentHash: 'hash-target-1',
        },
        config: {
          externalSources: [],
        },
        rules: [
          {
            target: 'Output.CustomerId',
            type: 'string',
            expression: 'source("Customer.Id")',
          },
          {
            target: 'Output.Total',
            type: 'number',
            expression: 'get(source("Invoice"), "Total")',
          },
        ],
      },
      role: 'source',
      identityDiff: {
        added: [],
        removed: ['/Customer/Id'],
        renamed: [],
        moved: [],
      },
    });

    expect(summary.role).toBe('source');
    expect(summary.breakingCount).toBe(1);
    expect(summary.nonBreakingCount).toBe(0);
    expect(summary.affectedRules[0]?.target).toBe('Output.CustomerId');
  });
});
