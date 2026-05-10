/**
 * useUnsavedDiff hook unit tests (FS-040 T-05).
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useUnsavedDiff } from './use-unsaved-diff';
import type { MappingRule } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRule(target: string, expression: string): MappingRule {
  return { target, expression, type: 'direct', description: '' };
}

const SAVED_RULES: readonly MappingRule[] = [
  makeRule('patient.firstName', 'source("firstName")'),
  makeRule('patient.lastName', 'source("lastName")'),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useUnsavedDiff', () => {
  it('returns no-mapping when no saved rule and no current expression', () => {
    const { result } = renderHook(() =>
      useUnsavedDiff({
        targetPath: 'patient.age',
        currentExpression: '',
        savedRules: SAVED_RULES,
      }),
    );
    expect(result.current.status).toBe('no-mapping');
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(result.current.savedExpression).toBeNull();
  });

  it('returns new when no saved rule but current expression exists', () => {
    const { result } = renderHook(() =>
      useUnsavedDiff({
        targetPath: 'patient.age',
        currentExpression: 'source("age")',
        savedRules: SAVED_RULES,
      }),
    );
    expect(result.current.status).toBe('new');
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(result.current.savedExpression).toBeNull();
  });

  it('returns unchanged when saved and current expressions are identical', () => {
    const { result } = renderHook(() =>
      useUnsavedDiff({
        targetPath: 'patient.firstName',
        currentExpression: 'source("firstName")',
        savedRules: SAVED_RULES,
      }),
    );
    expect(result.current.status).toBe('unchanged');
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(result.current.savedExpression).toBe('source("firstName")');
  });

  it('returns modified when saved rule exists and expressions differ', () => {
    const { result } = renderHook(() =>
      useUnsavedDiff({
        targetPath: 'patient.firstName',
        currentExpression: 'upper(source("firstName"))',
        savedRules: SAVED_RULES,
      }),
    );
    expect(result.current.status).toBe('modified');
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(result.current.savedExpression).toBe('source("firstName")');
  });

  it('returns removed when saved rule exists but current expression is empty', () => {
    const { result } = renderHook(() =>
      useUnsavedDiff({
        targetPath: 'patient.firstName',
        currentExpression: '',
        savedRules: SAVED_RULES,
      }),
    );
    expect(result.current.status).toBe('removed');
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(result.current.savedExpression).toBe('source("firstName")');
  });

  it('returns no-mapping when savedRules is empty and expression is empty', () => {
    const { result } = renderHook(() =>
      useUnsavedDiff({
        targetPath: 'patient.firstName',
        currentExpression: '',
        savedRules: [],
      }),
    );
    expect(result.current.status).toBe('no-mapping');
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it('trims whitespace when comparing expressions', () => {
    const { result } = renderHook(() =>
      useUnsavedDiff({
        targetPath: 'patient.firstName',
        currentExpression: '  source("firstName")  ',
        savedRules: SAVED_RULES,
      }),
    );
    expect(result.current.status).toBe('unchanged');
  });

  it('exposes currentExpression in the returned state', () => {
    const { result } = renderHook(() =>
      useUnsavedDiff({
        targetPath: 'patient.firstName',
        currentExpression: 'upper(source("firstName"))',
        savedRules: SAVED_RULES,
      }),
    );
    expect(result.current.currentExpression).toBe('upper(source("firstName"))');
  });
});
