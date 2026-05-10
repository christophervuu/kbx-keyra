import { describe, expect, it } from 'vitest';

import {
  COMPARISON_MODES,
  type ComparisonModeConfig,
  type ComparisonModeSideConfig,
} from '@/features/mappings/types';
import type {
  ComparisonMode,
  ComparisonSideMetadata,
  ComparisonSideResult,
  ComparisonSnapshot,
  ComparisonState,
  Diagnostic,
  DiffEntry,
} from '@/lib/types';

describe('FS-037 T-01: comparison domain and feature types', () => {
  it('ComparisonMode has exactly 5 members', () => {
    const modes: ComparisonMode[] = [
      'current-vs-saved',
      'current-vs-dev',
      'current-vs-qa',
      'dev-vs-qa',
      'qa-vs-prod',
    ];

    expect(modes).toHaveLength(5);
  });

  it('COMPARISON_MODES contains entries for all modes', () => {
    const modes = Object.keys(COMPARISON_MODES);

    expect(modes).toHaveLength(5);
    expect(COMPARISON_MODES['current-vs-saved']).toBeDefined();
    expect(COMPARISON_MODES['current-vs-dev']).toBeDefined();
    expect(COMPARISON_MODES['current-vs-qa']).toBeDefined();
    expect(COMPARISON_MODES['dev-vs-qa']).toBeDefined();
    expect(COMPARISON_MODES['qa-vs-prod']).toBeDefined();
  });

  it('ComparisonModeConfig and side config are structurally valid', () => {
    const left: ComparisonModeSideConfig = {
      label: 'Current',
      context: 'client',
    };
    const right: ComparisonModeSideConfig = {
      label: 'DEV',
      context: 'server',
      environment: 'DEV',
    };
    const config: ComparisonModeConfig = { left, right };

    expect(config.left.label).toBe('Current');
    expect(config.right.environment).toBe('DEV');
  });

  it('ComparisonState and ComparisonSnapshot are structurally valid', () => {
    const diagnostics: readonly Diagnostic[] = [];
    const diffEntries: readonly DiffEntry[] = [];

    const metadata: ComparisonSideMetadata = {
      executionContext: 'client',
      configVersion: 3,
      engineVersion: 'client',
      hasUnsavedChanges: true,
    };

    const side: ComparisonSideResult = {
      label: 'Current (Working)',
      output: {},
      diagnostics,
      metadata,
      status: 'success',
    };

    const state: ComparisonState = {
      mode: 'current-vs-saved',
      left: side,
      right: side,
      diffEntries,
      overallStatus: 'complete',
    };

    const snapshot: ComparisonSnapshot = {
      id: 'cmp-1',
      testCaseId: 'tc-1',
      mappingId: 'm-1',
      mode: 'current-vs-saved',
      leftResult: side,
      rightResult: side,
      diffEntries,
      capturedAt: '2026-05-10T00:00:00.000Z',
    };

    expect(state.overallStatus).toBe('complete');
    expect(snapshot.testCaseId).toBe('tc-1');
  });
});
