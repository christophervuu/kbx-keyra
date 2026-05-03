import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useTargetStatus } from './use-target-status';

import type { ValidationResult } from '@/lib/engine';
import type { MappingRule, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeNode = (
  path: string,
  fieldName: string,
  type: SchemaTreeNode['type'] = 'string',
  depth = 0,
  children: SchemaTreeNode[] = [],
): SchemaTreeNode => ({
  path,
  fieldName,
  type,
  depth,
  isArray: type === 'array',
  isRequired: false,
  parentPath: null,
  childCount: children.length,
  children,
});

const FLAT_NODES: SchemaTreeNode[] = [
  makeNode('firstName', 'firstName'),
  makeNode('lastName', 'lastName'),
  makeNode('age', 'age', 'number'),
];

const NESTED_NODES: SchemaTreeNode[] = (() => {
  const nameNode = makeNode('name', 'name', 'object', 0, [
    makeNode('name.first', 'first', 'string', 1),
    makeNode('name.last', 'last', 'string', 1),
  ]);
  return [
    nameNode,
    makeNode('name.first', 'first', 'string', 1),
    makeNode('name.last', 'last', 'string', 1),
    makeNode('age', 'age', 'number', 0),
  ];
})();

const makeRule = (target: string): MappingRule => ({
  target,
  type: 'string',
  expression: `source("${target}")`,
});

const makeValidationResult = (diagnostics: ValidationResult['diagnostics']): ValidationResult => ({
  valid: diagnostics.length === 0,
  diagnostics,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTargetStatus', () => {
  it('marks all fields unmapped when no rules exist', () => {
    const { result } = renderHook(() => useTargetStatus([], null, FLAT_NODES));
    expect(result.current.statusMap.get('firstName')).toBe('unmapped');
    expect(result.current.statusMap.get('lastName')).toBe('unmapped');
    expect(result.current.statusMap.get('age')).toBe('unmapped');
  });

  it('marks field as mapped when a matching rule exists', () => {
    const rules = [makeRule('firstName')];
    const { result } = renderHook(() => useTargetStatus(rules, null, FLAT_NODES));
    expect(result.current.statusMap.get('firstName')).toBe('mapped');
    expect(result.current.statusMap.get('lastName')).toBe('unmapped');
  });

  it('marks field as warning when validation has a warning diagnostic', () => {
    const rules = [makeRule('firstName')];
    const validation = makeValidationResult([
      {
        code: 'W001',
        severity: 'warning',
        message: 'Type mismatch',
        targetPath: 'firstName',
      },
    ]);
    const { result } = renderHook(() => useTargetStatus(rules, validation, FLAT_NODES));
    expect(result.current.statusMap.get('firstName')).toBe('warning');
  });

  it('marks field as error when validation has an error diagnostic', () => {
    const rules = [makeRule('firstName')];
    const validation = makeValidationResult([
      {
        code: 'E001',
        severity: 'error',
        message: 'Invalid expression',
        targetPath: 'firstName',
      },
    ]);
    const { result } = renderHook(() => useTargetStatus(rules, validation, FLAT_NODES));
    expect(result.current.statusMap.get('firstName')).toBe('error');
  });

  it('error beats warning for same path', () => {
    const rules = [makeRule('firstName')];
    const validation = makeValidationResult([
      { code: 'W001', severity: 'warning', message: 'warn', targetPath: 'firstName' },
      { code: 'E001', severity: 'error', message: 'err', targetPath: 'firstName' },
    ]);
    const { result } = renderHook(() => useTargetStatus(rules, validation, FLAT_NODES));
    expect(result.current.statusMap.get('firstName')).toBe('error');
  });

  it('resolves diagnostic target path via ruleIndex when targetPath absent', () => {
    const rules = [makeRule('firstName'), makeRule('lastName')];
    const validation = makeValidationResult([
      { code: 'W001', severity: 'warning', message: 'warn', ruleIndex: 1 },
    ]);
    const { result } = renderHook(() => useTargetStatus(rules, validation, FLAT_NODES));
    expect(result.current.statusMap.get('lastName')).toBe('warning');
    expect(result.current.statusMap.get('firstName')).toBe('mapped');
  });

  it('returns empty maps when nodes array is empty', () => {
    const { result } = renderHook(() => useTargetStatus([], null, []));
    expect(result.current.statusMap.size).toBe(0);
    expect(result.current.coverageMap.size).toBe(0);
  });

  it('computes coverage for object nodes', () => {
    const rules = [makeRule('name.first')]; // only first child mapped
    const { result } = renderHook(() => useTargetStatus(rules, null, NESTED_NODES));
    const coverage = result.current.coverageMap.get('name');
    expect(coverage).toEqual({ mapped: 1, total: 2 });
  });

  it('coverage counts warning/error children as mapped', () => {
    const rules = [makeRule('name.first'), makeRule('name.last')];
    const validation = makeValidationResult([
      { code: 'W001', severity: 'warning', message: 'warn', targetPath: 'name.last' },
    ]);
    const { result } = renderHook(() => useTargetStatus(rules, validation, NESTED_NODES));
    const coverage = result.current.coverageMap.get('name');
    expect(coverage).toEqual({ mapped: 2, total: 2 });
  });

  it('does not add coverage entry for leaf nodes', () => {
    const { result } = renderHook(() => useTargetStatus([], null, FLAT_NODES));
    expect(result.current.coverageMap.has('firstName')).toBe(false);
  });
});
