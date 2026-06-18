import { describe, expect, it } from 'vitest';

import { resolveSmartBuilderActions, resolveSmartBuilderActionsFromDraft } from './smart-builder-action-resolver';
import { createEmptySmartBuilderDraft } from './smart-builder-state';

describe('smart-builder-action-resolver', () => {
  it('sorts enabled actions before disabled actions', () => {
    const resolved = resolveSmartBuilderActions({
      targetType: 'string',
      isRequired: false,
      inputs: [{
        id: 'a',
        sourceKind: 'primary',
        label: 'name',
        path: 'name',
        valueType: 'string',
        transforms: [],
      }],
    });

    const firstDisabledIndex = resolved.findIndex((entry) => !entry.availability.enabled);
    if (firstDisabledIndex === -1) {
      expect(true).toBe(true);
      return;
    }
    const enabledAfterDisabled = resolved
      .slice(firstDisabledIndex + 1)
      .some((entry) => entry.availability.enabled);
    expect(enabledAfterDisabled).toBe(false);
  });

  it('disables numeric actions when no numeric input exists with actionable reason', () => {
    const resolved = resolveSmartBuilderActions({
      targetType: 'string',
      isRequired: false,
      inputs: [{
        id: 'a',
        sourceKind: 'primary',
        label: 'customerName',
        path: 'customerName',
        valueType: 'string',
        transforms: [],
      }],
    });

    const addNumbers = resolved.find((entry) => entry.action.id === 'number.add');
    expect(addNumbers).toBeDefined();
    expect(addNumbers?.availability.enabled).toBe(false);
    expect(addNumbers?.availability.reason).toContain('Convert to number first');
  });

  it('disables array actions when no array inputs are selected', () => {
    const resolved = resolveSmartBuilderActions({
      targetType: 'string',
      isRequired: false,
      inputs: [{
        id: 'a',
        sourceKind: 'primary',
        label: 'customerName',
        path: 'customerName',
        valueType: 'string',
        transforms: [],
      }],
    });

    const mergeArrays = resolved.find((entry) => entry.action.id === 'array.merge');
    expect(mergeArrays).toBeDefined();
    expect(mergeArrays?.availability.enabled).toBe(false);
    expect(mergeArrays?.availability.reason).toContain('selected inputs are arrays');
  });

  it('disables array-scope actions when array context is absent', () => {
    const resolved = resolveSmartBuilderActions({
      targetType: 'array',
      isRequired: false,
      hasArrayScope: false,
      inputs: [{
        id: 'a',
        sourceKind: 'primary',
        label: 'items',
        path: 'items',
        valueType: 'array',
        transforms: [],
      }],
    });

    const mapArray = resolved.find((entry) => entry.action.id === 'array.map');
    expect(mapArray?.availability.enabled).toBe(false);
    expect(mapArray?.availability.reason).toContain('array scope');
  });

  it('enables array-scope actions when draft has item/parent context', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.items',
        targetType: 'array',
        isRequired: false,
      }),
      inputs: [{
        id: 'i1',
        sourceKind: 'item' as const,
        label: 'item value',
        path: 'value',
        valueType: 'string' as const,
        transforms: [],
      }],
    };

    const resolved = resolveSmartBuilderActionsFromDraft(draft);
    const mapArray = resolved.find((entry) => entry.action.id === 'array.map');
    expect(mapArray?.availability.enabled).toBe(true);
  });

  it('AE-12: keeps convert.cast disabled for unsupported target types', () => {
    const resolved = resolveSmartBuilderActions({
      targetType: 'object',
      isRequired: false,
      inputs: [{
        id: 'a',
        sourceKind: 'primary',
        label: 'value',
        path: 'value',
        valueType: 'string',
        transforms: [],
      }],
    });

    const cast = resolved.find((entry) => entry.action.id === 'convert.cast');
    expect(cast).toBeDefined();
    expect(cast?.availability.enabled).toBe(false);
    expect(cast?.availability.reason).toContain('supports targets');
  });

  it('AE-11: enables null.coalesce when two nullable-compatible inputs are present', () => {
    const resolved = resolveSmartBuilderActions({
      targetType: 'string',
      isRequired: true,
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary',
          label: 'preferredName',
          path: 'preferredName',
          valueType: 'string',
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary',
          label: 'legalName',
          path: 'legalName',
          valueType: 'string',
          transforms: [],
        },
      ],
    });

    const coalesce = resolved.find((entry) => entry.action.id === 'null.coalesce');
    expect(coalesce).toBeDefined();
    expect(coalesce?.availability.enabled).toBe(true);
  });

  it('keeps parameterized action definitions discoverable in resolver output', () => {
    const resolved = resolveSmartBuilderActions({
      targetType: 'string',
      isRequired: false,
      inputs: [{
        id: 'a',
        sourceKind: 'primary',
        label: 'name',
        path: 'name',
        valueType: 'string',
        transforms: [],
      }],
    });

    const substring = resolved.find((entry) => entry.action.id === 'text.substring');
    expect(substring).toBeDefined();
    expect(substring?.action.parameters?.length).toBeGreaterThan(0);
    expect(substring?.action.parameters?.[0]?.id).toBe('start');
  });

  it('enables date.format for generic string inputs even without date-like naming', () => {
    const resolved = resolveSmartBuilderActions({
      targetType: 'string',
      isRequired: false,
      inputs: [{
        id: 'a',
        sourceKind: 'primary',
        label: 'issuedOn',
        path: 'issuedOn',
        valueType: 'string',
        transforms: [],
      }],
    });

    const formatDate = resolved.find((entry) => entry.action.id === 'date.format');
    expect(formatDate).toBeDefined();
    expect(formatDate?.availability.enabled).toBe(true);
  });

  it('keeps date.format unavailable for non-string inputs with deterministic reason', () => {
    const resolved = resolveSmartBuilderActions({
      targetType: 'string',
      isRequired: false,
      inputs: [{
        id: 'a',
        sourceKind: 'primary',
        label: 'count',
        path: 'count',
        valueType: 'number',
        transforms: [],
      }],
    });

    const formatDate = resolved.find((entry) => entry.action.id === 'date.format');
    expect(formatDate).toBeDefined();
    expect(formatDate?.availability.enabled).toBe(false);
    expect(formatDate?.availability.reason).toContain('requires string input(s)');
  });

  it('reflects invalid pending parameter draft as unavailable with deterministic reason', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.name',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [{
        id: 'a',
        sourceKind: 'primary' as const,
        label: 'name',
        path: 'name',
        valueType: 'string' as const,
        transforms: [],
      }],
      pendingActionDraft: {
        actionId: 'text.substring',
        values: {},
        validation: {
          isValid: false,
          issues: [{ fieldId: 'start', code: 'missing' as const, message: 'Start index is required.' }],
        },
      },
    };

    const resolved = resolveSmartBuilderActionsFromDraft(draft);
    const substring = resolved.find((entry) => entry.action.id === 'text.substring');
    expect(substring?.availability.enabled).toBe(false);
    expect(substring?.availability.reason).toContain('Start index is required');
  });

  it('exposes action role taxonomy for mapping method, parameter action, and output step', () => {
    const resolved = resolveSmartBuilderActions({
      targetType: 'number',
      isRequired: false,
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary',
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number',
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary',
          label: 'tax',
          path: 'tax',
          valueType: 'number',
          transforms: [],
        },
      ],
    });

    expect(resolved.find((entry) => entry.action.id === 'text.concat')?.action.role).toBe('mappingMethod');
    expect(resolved.find((entry) => entry.action.id === 'number.add')?.action.role).toBe('methodParameterAction');
    expect(resolved.find((entry) => entry.action.id === 'number.round')?.action.role).toBe('outputStep');
  });
});
