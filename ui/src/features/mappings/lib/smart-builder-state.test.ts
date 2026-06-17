import { describe, expect, it } from 'vitest';

import {
  createActionParameterDraft,
  createEmptySmartBuilderDraft,
  getValidatedActionParameters,
  hydrateSmartBuilderFromExpression,
  normalizeActionParameterValues,
  serializeActionParameterDraft,
  toSmartBuilderCompositionPatchFromParameters,
  toSmartBuilderTransformArgsFromParameters,
  undoSmartBuilderExpression,
  updateSmartBuilderExpression,
  validateActionParameterDraft,
} from './smart-builder-state';

describe('smart-builder-state', () => {
  it('AE-05: undo restores prior direct expression after direct -> composed transition', () => {
    const initial = createEmptySmartBuilderDraft({
      targetPath: 'target.fullName',
      targetType: 'string',
      isRequired: false,
    });

    const direct = updateSmartBuilderExpression(initial, 'source("firstName")');
    const composed = updateSmartBuilderExpression(
      direct,
      'concat(source("firstName"), source("lastName"))',
    );

    const undone = undoSmartBuilderExpression(composed);
    expect(undone.expression).toBe('source("firstName")');
  });

  it('tracks expression history and supports undo', () => {
    const initial = createEmptySmartBuilderDraft({
      targetPath: 'target.fullName',
      targetType: 'string',
      isRequired: true,
    });

    const withFirst = updateSmartBuilderExpression(initial, 'source("firstName")');
    const withSecond = updateSmartBuilderExpression(
      withFirst,
      'concat(source("firstName"), source("lastName"))',
    );

    const undone = undoSmartBuilderExpression(withSecond);
    expect(undone.expression).toBe('source("firstName")');
  });

  it('hydrates supported direct source expressions into guided draft', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'source("firstName")',
      targetPath: 'target.firstName',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition?.kind).toBe('direct');
    expect(result.draft.expression).toBe('source("firstName")');
  });

  it('hydrates supported direct enrichment root expressions into guided draft', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'external("carrier")',
      targetPath: 'target.carrierRef',
      targetType: 'object',
      isRequired: false,
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.expression).toBe('external("carrier")');
  });

  it('hydrates supported direct enrichment nested expressions into guided draft', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'get(external("carrier"), "rateCode")',
      targetPath: 'target.rateCode',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.expression).toBe('get(external("carrier"), "rateCode")');
  });

  it('returns advanced-mode result for non-decomposable expression', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'if(eq(lower(source("emailA")), lower(source("emailB"))), static("MATCH"), static("NO_MATCH"))',
      targetPath: 'target.match',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('advanced');
    if (result.kind !== 'advanced') return;
    expect(result.reason).toBe('complex-expression');
  });

  it('AE-16: returns parse-failed advanced fallback for invalid DSL', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'if(eq(source("a"),',
      targetPath: 'target.bad',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('advanced');
    if (result.kind !== 'advanced') return;
    expect(result.reason).toBe('parse-failed');
  });

  it('hydrates source input valueType from sourceValueTypeByPath when provided', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'lower(trim(source("email")))',
      targetPath: 'target.emailDomain',
      targetType: 'string',
      isRequired: false,
      sourceValueTypeByPath: {
        email: 'string',
      },
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.inputs[0]?.valueType).toBe('string');
  });

  it('normalizes parameter values with explicit defaults from schema', () => {
    const normalized = normalizeActionParameterValues({
      actionId: 'text.substring',
      values: {
        start: '2',
      },
    });

    expect(normalized).toEqual({
      start: 2,
    });
  });

  it('detects deterministic validation errors for missing and invalid parameter values', () => {
    const result = validateActionParameterDraft({
      actionId: 'text.substring',
      values: {
        start: -1,
      },
    });

    expect(result.isValid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: 'start',
          code: 'too-small',
        }),
      ]),
    );
  });

  it('detects missing required parameter when omitted', () => {
    const result = validateActionParameterDraft({
      actionId: 'convert.cast',
      values: {},
      includeDefaults: false,
    });

    expect(result.isValid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: 'targetType',
          code: 'missing',
        }),
      ]),
    );
  });

  it('serializes valid parameter draft payload for apply pipeline use', () => {
    const draft = createActionParameterDraft({
      actionId: 'text.replace',
      values: {
        match: ' ',
        replacement: '-',
        mode: 'all',
      },
    });

    expect(draft.validation.isValid).toBe(true);
    expect(serializeActionParameterDraft(draft)).toEqual({
      match: ' ',
      replacement: '-',
      mode: 'all',
    });
  });

  it('applies optional defaults explicitly from parameter schema', () => {
    const draft = createActionParameterDraft({
      actionId: 'text.replace',
      values: {
        match: 'x',
      },
    });

    expect(draft.values).toEqual({
      match: 'x',
      replacement: '',
      mode: 'all',
    });
    expect(draft.validation.isValid).toBe(true);
  });

  it('resolves validated action parameters from pending draft when valid', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.value',
        targetType: 'string',
        isRequired: false,
      }),
      pendingActionDraft: {
        actionId: 'text.substring',
        values: { start: 2, length: 4 },
        validation: { isValid: true, issues: [] },
      },
    };

    const resolved = getValidatedActionParameters({ draft, actionId: 'text.substring' });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.values).toEqual({ start: 2, length: 4 });
  });

  it('blocks validated action parameter resolution when pending draft is invalid', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.value',
        targetType: 'string',
        isRequired: false,
      }),
      pendingActionDraft: {
        actionId: 'text.substring',
        values: { start: -1 },
        validation: {
          isValid: false,
          issues: [{ fieldId: 'start', code: 'too-small' as const, message: 'Start index must be >= 0.' }],
        },
      },
    };

    const resolved = getValidatedActionParameters({ draft, actionId: 'text.substring' });
    expect(resolved.ok).toBe(false);
  });

  it('maps normalized parameter payload to transform args deterministically', () => {
    const args = toSmartBuilderTransformArgsFromParameters({
      actionId: 'text.substring',
      values: {
        start: 1,
        length: 2,
      },
    });

    expect(args).toEqual([
      { kind: 'static', value: 1 },
      { kind: 'static', value: 2 },
    ]);
  });

  it('normalizes date.format defaults for input and output format parameters', () => {
    const normalized = normalizeActionParameterValues({
      actionId: 'date.format',
      values: {},
    });

    expect(normalized).toEqual({
      inputFormat: 'ISO8601',
      outputFormat: 'YYYY-MM-DD',
    });
  });

  it('accepts custom typed date.format values outside preset dropdown options', () => {
    const validation = validateActionParameterDraft({
      actionId: 'date.format',
      values: {
        inputFormat: 'DD-MMM-YYYY',
        outputFormat: 'MM|DD|YYYY',
      },
    });

    expect(validation.isValid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it('maps date.format parameter payload into input/output transform args', () => {
    const args = toSmartBuilderTransformArgsFromParameters({
      actionId: 'date.format',
      values: {
        inputFormat: 'YYYY/MM/DD',
        outputFormat: 'YYYY-MM-DD',
      },
    });

    expect(args).toEqual([
      { kind: 'static', value: 'YYYY/MM/DD' },
      { kind: 'static', value: 'YYYY-MM-DD' },
    ]);
  });

  it('maps null.default parameter payload into coalesce composition patch', () => {
    const composition = toSmartBuilderCompositionPatchFromParameters({
      actionId: 'null.default',
      firstInputId: 'input-1',
      values: {
        fallbackExpression: '"N/A"',
      },
    });

    expect(composition).toEqual({
      kind: 'coalesce',
      inputIds: ['input-1'],
      fallback: { kind: 'static', value: 'N/A' },
    });
  });
});
