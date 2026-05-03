import { describe, expect, it } from 'vitest';

import { computeVersionDiff, generateChangeSummary } from './version-diff';
import type { MappingConfig, MappingRule } from '@/lib/types/domain';

function makeConfig(
  version: number,
  rules: readonly MappingRule[] = [],
  options: MappingConfig['config'] = {},
): MappingConfig {
  return {
    id: 'mapping-1',
    projectId: 'project-1',
    name: 'Mapping',
    version,
    engineVersion: '2.0.0',
    config: options,
    rules,
  };
}

describe('computeVersionDiff', () => {
  it('computes added/modified/removed rule diffs (AE-03)', () => {
    const oldConfig = makeConfig(2, [
      { target: 'A.B', type: 'string', expression: 'source("x")' },
      { target: 'A.C', type: 'string', expression: 'static("y")' },
    ]);

    const newConfig = makeConfig(3, [
      { target: 'A.B', type: 'string', expression: 'source("x2")' },
      { target: 'A.D', type: 'string', expression: 'static("z")' },
    ]);

    const diff = computeVersionDiff(oldConfig, newConfig);

    expect(diff.summary).toEqual({ added: 1, modified: 1, removed: 1 });
    expect(diff.ruleDiffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'modified', targetPath: 'A.B' }),
        expect.objectContaining({ type: 'removed', targetPath: 'A.C' }),
        expect.objectContaining({ type: 'added', targetPath: 'A.D' }),
      ]),
    );
  });

  it('detects config diffs for unmappedTargets and constants (AE-04)', () => {
    const oldConfig = makeConfig(2, [], {
      unmappedTargets: 'null',
      constants: { TAX: 0.08 },
    });

    const newConfig = makeConfig(3, [], {
      unmappedTargets: 'error',
      constants: { TAX: 0.1 },
    });

    const diff = computeVersionDiff(oldConfig, newConfig);

    expect(diff.configDiffs).toEqual(
      expect.arrayContaining([
        { field: 'unmappedTargets', oldValue: 'null', newValue: 'error' },
        { field: 'constants.TAX', oldValue: 0.08, newValue: 0.1 },
      ]),
    );
  });

  it('returns empty diff for identical configs', () => {
    const config = makeConfig(1, [
      { target: 'A.B', type: 'string', expression: 'source("x")', description: 'desc' },
    ], {
      unmappedTargets: 'omit',
      nullSubtrees: ['A'],
      constants: { X: '1' },
      externalSources: ['pricing'],
    });

    const diff = computeVersionDiff(config, config);

    expect(diff.summary).toEqual({ added: 0, modified: 0, removed: 0 });
    expect(diff.ruleDiffs).toEqual([]);
    expect(diff.configDiffs).toEqual([]);
  });

  it('handles empty rules in one or both configs', () => {
    const oldConfig = makeConfig(1, []);
    const newConfig = makeConfig(2, [
      { target: 'A.B', type: 'string', expression: 'static("x")' },
    ]);

    const diff = computeVersionDiff(oldConfig, newConfig);
    expect(diff.summary).toEqual({ added: 1, modified: 0, removed: 0 });
  });

  it('handles duplicate target paths by positional comparison', () => {
    const oldConfig = makeConfig(1, [
      { target: 'A.B', type: 'string', expression: 'static("one")' },
      { target: 'A.B', type: 'string', expression: 'static("two")' },
    ]);

    const newConfig = makeConfig(2, [
      { target: 'A.B', type: 'string', expression: 'static("one")' },
      { target: 'A.B', type: 'string', expression: 'static("two-mod")' },
      { target: 'A.B', type: 'string', expression: 'static("three")' },
    ]);

    const diff = computeVersionDiff(oldConfig, newConfig);

    expect(diff.summary).toEqual({ added: 1, modified: 1, removed: 0 });
  });

  it('detects description-only changes as modified', () => {
    const oldConfig = makeConfig(1, [
      { target: 'A.B', type: 'string', expression: 'source("x")', description: 'before' },
    ]);
    const newConfig = makeConfig(2, [
      { target: 'A.B', type: 'string', expression: 'source("x")', description: 'after' },
    ]);

    const diff = computeVersionDiff(oldConfig, newConfig);

    expect(diff.summary).toEqual({ added: 0, modified: 1, removed: 0 });
    expect(diff.ruleDiffs[0]).toMatchObject({
      type: 'modified',
      targetPath: 'A.B',
      oldDescription: 'before',
      newDescription: 'after',
    });
  });

  it('does not report order-only rule changes as modifications', () => {
    const oldConfig = makeConfig(1, [
      { target: 'A.B', type: 'string', expression: 'static("x")' },
      { target: 'A.C', type: 'string', expression: 'static("y")' },
    ]);

    const newConfig = makeConfig(2, [
      { target: 'A.C', type: 'string', expression: 'static("y")' },
      { target: 'A.B', type: 'string', expression: 'static("x")' },
    ]);

    const diff = computeVersionDiff(oldConfig, newConfig);
    expect(diff.summary).toEqual({ added: 0, modified: 0, removed: 0 });
    expect(diff.ruleDiffs).toEqual([]);
  });

  it('compares nullSubtrees and externalSources as order-independent sets', () => {
    const oldConfig = makeConfig(1, [], {
      nullSubtrees: ['B', 'A', 'A'],
      externalSources: ['rates', 'tax'],
    });
    const newConfig = makeConfig(2, [], {
      nullSubtrees: ['A', 'B'],
      externalSources: ['tax', 'rates'],
    });

    const diff = computeVersionDiff(oldConfig, newConfig);
    expect(diff.configDiffs).toEqual([]);
  });

  it('detects added/removed/changed constants per key', () => {
    const oldConfig = makeConfig(1, [], {
      constants: { A: 1, B: 'x', C: true },
    });
    const newConfig = makeConfig(2, [], {
      constants: { A: 1, B: 'y', D: false },
    });

    const diff = computeVersionDiff(oldConfig, newConfig);

    expect(diff.configDiffs).toEqual(
      expect.arrayContaining([
        { field: 'constants.B', oldValue: 'x', newValue: 'y' },
        { field: 'constants.C', oldValue: true, newValue: undefined },
        { field: 'constants.D', oldValue: undefined, newValue: false },
      ]),
    );
  });

  it('handles undefined vs defined config fields', () => {
    const oldConfig = makeConfig(1, [], {
      unmappedTargets: undefined,
      nullSubtrees: undefined,
      constants: undefined,
      externalSources: undefined,
    });

    const newConfig = makeConfig(2, [], {
      unmappedTargets: 'null',
      nullSubtrees: ['A.B'],
      constants: { TAX: 0.1 },
      externalSources: ['pricing'],
    });

    const diff = computeVersionDiff(oldConfig, newConfig);
    expect(diff.configDiffs.length).toBeGreaterThan(0);
  });
});

describe('generateChangeSummary', () => {
  it('returns "No changes" when all summary counts are zero', () => {
    const summary = generateChangeSummary({
      summary: { added: 0, modified: 0, removed: 0 },
      ruleDiffs: [],
      configDiffs: [],
    });

    expect(summary).toBe('No changes');
  });

  it('formats non-zero categories and omits zero categories', () => {
    const summary = generateChangeSummary({
      summary: { added: 2, modified: 1, removed: 0 },
      ruleDiffs: [],
      configDiffs: [],
    });

    expect(summary).toBe('+2 added, ~1 modified');
  });

  it('formats all three categories when all are non-zero', () => {
    const summary = generateChangeSummary({
      summary: { added: 1, modified: 2, removed: 3 },
      ruleDiffs: [],
      configDiffs: [],
    });

    expect(summary).toBe('+1 added, ~2 modified, -3 removed');
  });
});
