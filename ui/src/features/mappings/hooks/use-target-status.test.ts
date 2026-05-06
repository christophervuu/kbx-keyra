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

// ---------------------------------------------------------------------------
// T-12: Leaf-field coverage tests (AE-13)
// ---------------------------------------------------------------------------

describe('useTargetStatus — leaf-field coverage (AE-13)', () => {
  // address
  //   street (string)          ← leaf
  //   location (object)
  //     lat (number)           ← leaf
  //     lng (number)           ← leaf
  // Total leaf descendants of address = 3

  const latNode = makeNode('address.location.lat', 'lat', 'number', 2);
  const lngNode = makeNode('address.location.lng', 'lng', 'number', 2);
  const locationNode = makeNode('address.location', 'location', 'object', 1, [latNode, lngNode]);
  const streetNode = makeNode('address.street', 'street', 'string', 1);
  const addressNode = makeNode('address', 'address', 'object', 0, [streetNode, locationNode]);

  const DEEP_NODES: SchemaTreeNode[] = [
    addressNode,
    streetNode,
    locationNode,
    latNode,
    lngNode,
  ];

  it('AE-13: counts 3 leaf descendants for address with nested location object', () => {
    const { result } = renderHook(() => useTargetStatus([], null, DEEP_NODES));
    const coverage = result.current.coverageMap.get('address');
    expect(coverage).toEqual({ mapped: 0, total: 3 });
  });

  it('AE-13: with one rule for address.street, coverage is { mapped: 1, total: 3 }', () => {
    const rules = [makeRule('address.street')];
    const { result } = renderHook(() => useTargetStatus(rules, null, DEEP_NODES));
    const coverage = result.current.coverageMap.get('address');
    expect(coverage).toEqual({ mapped: 1, total: 3 });
  });

  it('AE-13: adding rule for address.location.lat updates to { mapped: 2, total: 3 }', () => {
    const rules = [makeRule('address.street'), makeRule('address.location.lat')];
    const { result } = renderHook(() => useTargetStatus(rules, null, DEEP_NODES));
    const coverage = result.current.coverageMap.get('address');
    expect(coverage).toEqual({ mapped: 2, total: 3 });
  });

  it('AE-13: removing a rule decrements mapped count', () => {
    const rules = [makeRule('address.street'), makeRule('address.location.lat'), makeRule('address.location.lng')];
    const { result: fullResult } = renderHook(() => useTargetStatus(rules, null, DEEP_NODES));
    expect(fullResult.current.coverageMap.get('address')).toEqual({ mapped: 3, total: 3 });

    const rulesAfterRemoval = [makeRule('address.street')];
    const { result: reducedResult } = renderHook(() => useTargetStatus(rulesAfterRemoval, null, DEEP_NODES));
    expect(reducedResult.current.coverageMap.get('address')).toEqual({ mapped: 1, total: 3 });
  });

  it('AE-13: location object also gets its own leaf coverage entry', () => {
    const rules = [makeRule('address.location.lat')];
    const { result } = renderHook(() => useTargetStatus(rules, null, DEEP_NODES));
    const locationCoverage = result.current.coverageMap.get('address.location');
    expect(locationCoverage).toEqual({ mapped: 1, total: 2 });
  });
});
