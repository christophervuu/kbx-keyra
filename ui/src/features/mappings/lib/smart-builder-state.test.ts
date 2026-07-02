import { describe, expect, it } from 'vitest';

import {
  SMART_BUILDER_UNDO_HISTORY_LIMIT,
  createActionParameterDraft,
  createEmptySmartBuilderDraft,
  isSmartBuilderDraftSaveBlocked,
  getAllowedConditionOperatorsForLeftType,
  getBuilderInputUsages,
  getConditionCompatibilityIssues,
  getValidatedActionParameters,
  hydrateSmartBuilderFromExpression,
  normalizeSmartBuilderDraft,
  normalizeActionParameterValues,
  serializeActionParameterDraft,
  toSmartBuilderCompositionPatchFromParameters,
  toSmartBuilderTransformArgsFromParameters,
  undoSmartBuilderExpression,
  updateSmartBuilderExpression,
  validateActionParameterDraft,
  pushSmartBuilderSnapshot,
} from './smart-builder-state';

describe('smart-builder-state', () => {
  it('creates canonical empty draft fields with backward-compatible aliases', () => {
    const draft = createEmptySmartBuilderDraft({
      targetPath: 'target.name',
      targetType: 'string',
      isRequired: false,
    });

    expect(draft.availableInputs).toEqual([]);
    expect(draft.inputs).toEqual([]);
    expect(draft.recipe).toBeNull();
    expect(draft.composition).toBeNull();
    expect(draft.resultSteps).toEqual([]);
    expect(draft.postSteps).toEqual([]);
    expect(draft.recipeStatus).toEqual({ status: 'incomplete', reasons: [] });
    expect(draft.validExpression).toBe('');
    expect(draft.lastValidExpression).toBe('');
    expect(draft.undoHistory).toEqual([]);
  });

  it('normalizes legacy smart draft shape into canonical fields', () => {
    const legacy = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.fullName',
        targetType: 'string',
        isRequired: false,
      }),
      availableInputs: undefined,
      recipe: undefined,
      resultSteps: undefined,
      recipeStatus: undefined,
      validExpression: undefined,
      lastValidExpression: undefined,
      undoHistory: undefined,
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'firstName',
          path: 'firstName',
          valueType: 'string' as const,
          transforms: [{ functionName: 'trim' }],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'input-1' },
      postSteps: [{ functionName: 'trim' }],
      expression: 'source("firstName")',
      validation: { status: 'valid' as const },
    };

    const normalized = normalizeSmartBuilderDraft(legacy);
    expect(normalized.availableInputs).toHaveLength(1);
    expect(normalized.inputs).toHaveLength(1);
    expect(normalized.availableInputs[0]?.transforms).toEqual([]);
    expect(normalized.recipe).toEqual({
      kind: 'direct',
      inputId: 'input-1',
      value: {
        kind: 'input',
        inputId: 'input-1',
        transforms: [{ functionName: 'trim' }],
      },
    });
    expect(normalized.composition).toEqual({
      kind: 'direct',
      inputId: 'input-1',
      value: {
        kind: 'input',
        inputId: 'input-1',
        transforms: [{ functionName: 'trim' }],
      },
    });
    expect(normalized.resultSteps).toEqual([{ functionName: 'trim' }]);
    expect(normalized.postSteps).toEqual([{ functionName: 'trim' }]);
    expect(normalized.recipeStatus).toEqual({ status: 'valid' });
    expect(normalized.validExpression).toBe('source("firstName")');
    expect(normalized.lastValidExpression).toBe('source("firstName")');
    expect(normalized.undoHistory).toEqual([]);
  });

  it('preserves last valid expression when recipe status is incomplete', () => {
    const draft = normalizeSmartBuilderDraft({
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.name',
        targetType: 'string',
        isRequired: false,
      }),
      expression: 'if(eq(source("a"), "x"), "A", "B")',
      recipeStatus: { status: 'incomplete', reasons: ['Missing THEN value'] },
      validExpression: 'source("a")',
      lastValidExpression: 'source("a")',
    });

    expect(draft.recipeStatus).toEqual({ status: 'incomplete', reasons: ['Missing THEN value'] });
    expect(draft.expression).toBe('if(eq(source("a"), "x"), "A", "B")');
    expect(draft.validExpression).toBe('source("a")');
    expect(draft.lastValidExpression).toBe('source("a")');
  });

  it('keeps current expression when recipe has no unresolved incomplete reasons', () => {
    const base = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.name',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'firstName',
          path: 'firstName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'direct' as const,
        inputId: 'input-1',
      },
      expression: 'source("firstName")',
      validation: { status: 'valid' as const },
      recipeStatus: { status: 'valid' as const },
      validExpression: 'source("firstName")',
      lastValidExpression: 'source("firstName")',
    };

    const next = updateSmartBuilderExpression(base, 'source("firstName")');
    expect(next.expression).toBe('source("firstName")');
    expect(next.recipeStatus).toEqual({ status: 'valid' });
  });

  it('reverts expression to last valid when unresolved incomplete recipe is produced', () => {
    const base = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.name',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'firstName',
          path: 'firstName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'default' as const,
        inputId: 'input-1',
        fallback: { kind: 'static' as const, value: 'UNKNOWN' },
      },
      expression: 'default(source("firstName"), "UNKNOWN")',
      validation: { status: 'valid' as const },
      recipeStatus: { status: 'valid' as const },
      validExpression: 'default(source("firstName"), "UNKNOWN")',
      lastValidExpression: 'default(source("firstName"), "UNKNOWN")',
    };

    const incomplete = {
      ...base,
      composition: {
        kind: 'default' as const,
        inputId: 'missing-input',
        fallback: { kind: 'static' as const, value: 'UNKNOWN' },
      },
    };

    const next = updateSmartBuilderExpression(incomplete, 'default(source("missing"), "UNKNOWN")');

    expect(next.expression).toBe('default(source("firstName"), "UNKNOWN")');
    expect(next.recipeStatus.status).toBe('incomplete');
    if (next.recipeStatus.status !== 'incomplete') return;
    expect(next.recipeStatus.reasons.length).toBeGreaterThan(0);
    expect(isSmartBuilderDraftSaveBlocked(next)).toBe(true);
  });

  it('migrates legacy input-owned transforms for reused conditional input into per-usage transforms', () => {
    const normalized = normalizeSmartBuilderDraft({
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.code',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'accountCode',
          path: 'accountCode',
          valueType: 'string' as const,
          transforms: [{ functionName: 'upper' }],
        },
      ],
      composition: {
        kind: 'condition' as const,
        clauses: [
          {
            predicates: [{
              left: { kind: 'input', inputId: 'input-1' },
              operator: 'eq',
              right: { kind: 'static', value: 'ABC' },
            }],
            thenOutput: { kind: 'input', inputId: 'input-1' },
          },
        ],
        elseOutput: { kind: 'input', inputId: 'input-1' },
      },
      validation: { status: 'valid' as const },
      expression: 'if(eq(source("accountCode"), "ABC"), source("accountCode"), source("accountCode"))',
    });

    expect(normalized.availableInputs[0]?.transforms).toEqual([]);
    expect(normalized.composition?.kind).toBe('condition');
    if (normalized.composition?.kind !== 'condition') return;

    const predicateLeft = normalized.composition.clauses[0]?.predicates[0]?.left;
    const thenOutput = normalized.composition.clauses[0]?.thenOutput;
    const elseOutput = normalized.composition.elseOutput;

    expect(predicateLeft?.kind).toBe('input');
    expect(predicateLeft?.transforms).toEqual([{ functionName: 'upper' }]);
    expect(thenOutput.transforms).toEqual([{ functionName: 'upper' }]);
    expect(elseOutput.transforms).toEqual([{ functionName: 'upper' }]);
  });

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

  it('does not block save for placeholder incomplete recipe state with no reasons', () => {
    const draft = createEmptySmartBuilderDraft({
      targetPath: 'target.name',
      targetType: 'string',
      isRequired: false,
    });

    expect(draft.recipeStatus).toEqual({ status: 'incomplete', reasons: [] });
    expect(isSmartBuilderDraftSaveBlocked(draft)).toBe(false);
  });

  it('pushes full-state undo snapshots and restores recipe/order/steps via undo', () => {
    const base = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.total',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'a',
        operations: [{ operator: 'add' as const, inputId: 'b' }],
      },
      postSteps: [{ functionName: 'round' as const, args: [{ kind: 'static' as const, value: 2 }] }],
      expression: 'round(add(source("subtotal"), source("tax")), 2)',
      validation: { status: 'valid' as const },
      recipeStatus: { status: 'valid' as const },
      validExpression: 'round(add(source("subtotal"), source("tax")), 2)',
      lastValidExpression: 'round(add(source("subtotal"), source("tax")), 2)',
    };

    const changed = {
      ...base,
      composition: {
        kind: 'math' as const,
        startInputId: 'a',
        operations: [{ operator: 'subtract' as const, inputId: 'b' }],
      },
      postSteps: [
        { functionName: 'abs' as const },
      ],
      expression: 'abs(subtract(source("subtotal"), source("tax")))',
      validation: { status: 'valid' as const },
      recipeStatus: { status: 'valid' as const },
      validExpression: 'abs(subtract(source("subtotal"), source("tax")))',
      lastValidExpression: 'abs(subtract(source("subtotal"), source("tax")))',
    };

    const withSnapshot = pushSmartBuilderSnapshot({ previousDraft: base, nextDraft: changed });
    expect(withSnapshot.undoHistory?.length).toBe(1);

    const undone = undoSmartBuilderExpression(withSnapshot);
    expect(undone.composition).toEqual(base.composition);
    expect(undone.postSteps).toEqual(base.postSteps);
    expect(undone.expression).toBe(base.expression);
  });

  it('bounds smart-builder undo history to configured max snapshots', () => {
    let current = createEmptySmartBuilderDraft({
      targetPath: 'target.name',
      targetType: 'string',
      isRequired: false,
    });

    for (let i = 0; i < SMART_BUILDER_UNDO_HISTORY_LIMIT + 7; i += 1) {
      const next = {
        ...current,
        expression: `source("field_${i}")`,
      };
      current = pushSmartBuilderSnapshot({ previousDraft: current, nextDraft: next });
    }

    expect(current.undoHistory?.length).toBe(SMART_BUILDER_UNDO_HISTORY_LIMIT);
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

  it('hydrates default(source("x"), "literal") into guided default composition', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'default(source("firstName"), "UNKNOWN")',
      targetPath: 'target.firstName',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition).toEqual({
      kind: 'default',
      inputId: 'input-1',
      fallback: { kind: 'static', value: 'UNKNOWN' },
    });
    expect(result.draft.expression).toBe('default(source("firstName"), "UNKNOWN")');
  });

  it('hydrates default(source("x"), source("y")) into guided default composition', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'default(source("preferredName"), source("legalName"))',
      targetPath: 'target.name',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition).toEqual({
      kind: 'default',
      inputId: 'input-1',
      fallback: { kind: 'expression', expression: 'source("legalName")' },
    });
    expect(result.draft.expression).toBe('default(source("preferredName"), source("legalName"))');
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

  it('AE-32: hydrates project value-table valueMap expressions into guided draft when metadata exists', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'valueMap(source("status"), valueTable("order-status", "oms", "cdm"), "UNKNOWN")',
      targetPath: 'target.status',
      targetType: 'string',
      isRequired: false,
      ruleValueTableRef: {
        scope: 'project',
        valueTableId: 'vt-1',
        tableKey: 'order-status',
        revision: 3,
        inputSideKey: 'oms',
        outputSideKey: 'cdm',
        inputType: 'string',
        outputType: 'string',
        resolvedEntries: [
          { in: 'OPEN', out: 'Open', rowId: 'r1' },
        ],
      },
      ruleNoMatchBehavior: { mode: 'fallback_value', fallbackValue: 'UNKNOWN' },
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition?.kind).toBe('valueMap');
    if (result.draft.composition?.kind !== 'valueMap') return;
    expect(result.draft.composition.scope).toBe('project');
    expect(result.draft.composition.project?.ref.valueTableId).toBe('vt-1');
    expect(result.draft.expression).toContain('valueTable("order-status", "oms", "cdm")');
  });

  it('AE-29: hydrates saved direct rule into guided direct composition', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'source("customer.firstName")',
      targetPath: 'target.firstName',
      targetType: 'string',
      isRequired: false,
      sourceValueTypeByPath: {
        'customer.firstName': 'string',
      },
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition).toEqual({
      kind: 'direct',
      inputId: 'input-1',
    });
    expect(result.draft.inputs[0]?.path).toBe('customer.firstName');
  });

  it('AE-19: hydrates exact inline value-map expression into guided draft', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'valueMap(source("channel"), {"web": "WEB_PORTAL", "mobile": "MOBILE_APP", "store": "RETAIL_STORE"}, "UNKNOWN")',
      targetPath: 'target.channel',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition?.kind).toBe('valueMap');
    if (result.draft.composition?.kind !== 'valueMap') return;
    expect(result.draft.composition.scope).toBe('inline');
    expect(result.draft.composition.mappings).toHaveLength(3);
    expect(result.draft.expression).toContain('valueMap(source("channel"), {');
  });

  it('AE-20: hydrates exact project value-map expression with return-input fallback into guided draft', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'valueMap(source("status"), valueTable("exercise-1-table", "side-a", "side-b"), source("status"))',
      targetPath: 'target.status',
      targetType: 'string',
      isRequired: false,
      ruleValueTableRef: {
        scope: 'project',
        valueTableId: 'vt-1',
        tableKey: 'exercise-1-table',
        revision: 3,
        inputSideKey: 'side-a',
        outputSideKey: 'side-b',
        inputType: 'string',
        outputType: 'string',
        resolvedEntries: [
          { in: 'open', out: 'OPEN', rowId: 'r1' },
        ],
      },
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition?.kind).toBe('valueMap');
    if (result.draft.composition?.kind !== 'valueMap') return;
    expect(result.draft.composition.matchMode).toBe('exact');
    expect(result.draft.composition.scope).toBe('project');
    expect(result.draft.composition.project?.ref.valueTableId).toBe('vt-1');
    expect(result.draft.composition.project?.matchMode).toBe('exact');
    expect(result.draft.composition.noMatchBehavior?.mode).toBe('return_input');
    expect(result.draft.expression).toBe('valueMap(source("status"), valueTable("exercise-1-table", "side-a", "side-b"), source("status"))');
  });

  it('hydrates project value-map with ignore-case match mode from rule metadata', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'valueMap(source("status"), valueTable("exercise-1-table", "side-a", "side-b"), "UNKNOWN")',
      targetPath: 'target.status',
      targetType: 'string',
      isRequired: false,
      ruleValueTableRef: {
        scope: 'project',
        valueTableId: 'vt-1',
        tableKey: 'exercise-1-table',
        revision: 3,
        inputSideKey: 'side-a',
        outputSideKey: 'side-b',
        inputType: 'string',
        outputType: 'string',
        matchMode: 'ignore-case',
        resolvedEntries: [
          { in: 'open', out: 'OPEN', rowId: 'r1' },
        ],
      },
      ruleNoMatchBehavior: {
        mode: 'fallback_value',
        fallbackValue: 'UNKNOWN',
      },
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition?.kind).toBe('valueMap');
    if (result.draft.composition?.kind !== 'valueMap') return;
    expect(result.draft.composition.matchMode).toBe('ignore-case');
    expect(result.draft.composition.project?.matchMode).toBe('ignore-case');
    expect(result.draft.expression).toContain(', "ignore-case")');
  });

  it('hydrates inline value-map expression with explicit ignore-case match mode argument', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'valueMap(source("status"), {"open": "OPEN", "closed": "CLOSED"}, "UNKNOWN", "ignore-case")',
      targetPath: 'target.status',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition?.kind).toBe('valueMap');
    if (result.draft.composition?.kind !== 'valueMap') return;
    expect(result.draft.composition.scope).toBe('inline');
    expect(result.draft.composition.matchMode).toBe('ignore-case');
    expect(result.draft.expression).toContain(', "ignore-case")');
  });

  it('hydrates project value-table valueMap expressions with multiline formatting into guided draft', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: `valueMap(
        source("status"),
        valueTable(
          "order-status",
          "oms",
          "cdm"
        ),
        "UNKNOWN"
      )`,
      targetPath: 'target.status',
      targetType: 'string',
      isRequired: false,
      ruleValueTableRef: {
        scope: 'project',
        valueTableId: 'vt-1',
        tableKey: 'order-status',
        revision: 3,
        inputSideKey: 'oms',
        outputSideKey: 'cdm',
        inputType: 'string',
        outputType: 'string',
        resolvedEntries: [
          { in: 'OPEN', out: 'Open', rowId: 'r1' },
        ],
      },
      ruleNoMatchBehavior: { mode: 'fallback_value', fallbackValue: 'UNKNOWN' },
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition?.kind).toBe('valueMap');
    if (result.draft.composition?.kind !== 'valueMap') return;
    expect(result.draft.composition.scope).toBe('project');
    expect(result.draft.composition.project?.ref.valueTableId).toBe('vt-1');
    expect(result.draft.expression).toContain('valueTable("order-status", "oms", "cdm")');
  });

  it('AE-31: hydrates representable conditional expression with all-match predicates', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'if(and(eq(source("transaction.priority"), "expedited"), eq(source("transaction.channel"), "web")), source("customer.accountTier"), "STANDARD")',
      targetPath: 'target.priority',
      targetType: 'string',
      isRequired: false,
      sourceValueTypeByPath: {
        'transaction.priority': 'string',
        'transaction.channel': 'string',
        'customer.accountTier': 'string',
      },
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition?.kind).toBe('condition');
    if (result.draft.composition?.kind !== 'condition') return;
    expect(result.draft.composition.matchMode).toBe('all');
    expect(result.draft.composition.clauses).toHaveLength(1);
    expect(result.draft.expression).toBe('if(and(eq(source("transaction.priority"), "expedited"), eq(source("transaction.channel"), "web")), source("customer.accountTier"), "STANDARD")');
  });

  it('hydrates representable conditional expression with any-match predicates', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'if(or(eq(source("a"), "1"), eq(source("b"), "2")), "Y", "N")',
      targetPath: 'target.flag',
      targetType: 'string',
      isRequired: false,
      sourceValueTypeByPath: {
        a: 'string',
        b: 'string',
      },
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition?.kind).toBe('condition');
    if (result.draft.composition?.kind !== 'condition') return;
    expect(result.draft.composition.matchMode).toBe('any');
    expect(result.draft.expression).toBe('if(or(eq(source("a"), "1"), eq(source("b"), "2")), "Y", "N")');
  });

  it('AE-30: hydrates representable concat expression into explicit ordered parts', () => {
    const expression = 'concat(source("customer.firstName"), " ", source("customer.lastName"))';
    const result = hydrateSmartBuilderFromExpression({
      expression,
      targetPath: 'target.fullName',
      targetType: 'string',
      isRequired: false,
      sourceValueTypeByPath: {
        'customer.firstName': 'string',
        'customer.lastName': 'string',
      },
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition).toEqual({
      kind: 'concat',
      inputIds: ['input-1', 'input-2'],
      parts: [
        { kind: 'input', inputId: 'input-1' },
        { kind: 'static', value: ' ' },
        { kind: 'input', inputId: 'input-2' },
      ],
    });
    expect(result.draft.expression).toBe(expression);
  });

  it('hydrates representable coalesce expression with explicit fallback into guided draft', () => {
    const expression = 'coalesce(source("nickname"), source("legalName"), "UNKNOWN")';
    const result = hydrateSmartBuilderFromExpression({
      expression,
      targetPath: 'target.displayName',
      targetType: 'string',
      isRequired: false,
      sourceValueTypeByPath: {
        nickname: 'string',
        legalName: 'string',
      },
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition).toEqual({
      kind: 'coalesce',
      inputIds: ['input-1', 'input-2'],
      values: [
        { kind: 'input', inputId: 'input-1' },
        { kind: 'input', inputId: 'input-2' },
      ],
      fallback: { kind: 'static', value: 'UNKNOWN' },
    });
    expect(result.draft.expression).toBe(expression);
  });

  it('hydrates representable nested math expression into calculation start+operations model', () => {
    const expression = 'add(subtract(source("subtotal"), source("discount")), source("shipping"))';
    const result = hydrateSmartBuilderFromExpression({
      expression,
      targetPath: 'target.total',
      targetType: 'number',
      isRequired: false,
      sourceValueTypeByPath: {
        subtotal: 'number',
        discount: 'number',
        shipping: 'number',
      },
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition).toEqual({
      kind: 'math',
      startInputId: 'input-1',
      operations: [
        { operator: 'subtract', inputId: 'input-2' },
        { operator: 'add', inputId: 'input-3' },
      ],
    });
    expect(result.draft.expression).toBe(expression);
  });

  it('keeps concat with transformed input in advanced mode (non-lossless part ownership)', () => {
    const expression = 'concat(upper(source("firstName")), " ", source("lastName"))';
    const result = hydrateSmartBuilderFromExpression({
      expression,
      targetPath: 'target.fullName',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('advanced');
    if (result.kind !== 'advanced') return;
    expect(result.reason).toBe('unsupported-decomposition');
    expect(result.expression).toBe(expression);
  });

  it('returns strict advanced fallback for non-lossless coalesce ownership without partial reconstruction', () => {
    const expression = 'coalesce(trim(source("nickname")), source("legalName"))';
    const result = hydrateSmartBuilderFromExpression({
      expression,
      targetPath: 'target.displayName',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('advanced');
    if (result.kind !== 'advanced') return;
    expect(result.reason).toBe('unsupported-decomposition');
    expect(result.expression).toBe(expression);
  });

  it('AE-33: returns advanced-mode result for non-decomposable expression', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'if(startsWith(source("emailA"), "A"), "MATCH", "NO_MATCH")',
      targetPath: 'target.match',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('advanced');
    if (result.kind !== 'advanced') return;
    expect(result.reason).toBe('complex-expression');
    expect(result.classification).toBe('unsupported-condition-operator');
  });

  it('classifies nested condition groups as advanced nested-condition-groups', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'if(and(eq(source("a"), "1"), or(eq(source("b"), "2"), eq(source("c"), "3"))), "Y", "N")',
      targetPath: 'target.flag',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('advanced');
    if (result.kind !== 'advanced') return;
    expect(result.reason).toBe('complex-expression');
    expect(result.classification).toBe('nested-condition-groups');
  });

  it('classifies non-lossless condition value patterns as advanced non-lossless-condition-value', () => {
    const result = hydrateSmartBuilderFromExpression({
      expression: 'if(eq(source("priority"), "expedited"), lower(source("priority")), "N")',
      targetPath: 'target.flag',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('advanced');
    if (result.kind !== 'advanced') return;
    expect(result.reason).toBe('complex-expression');
    expect(result.classification).toBe('non-lossless-condition-value');
  });

  it('AE-34: classifies transformed predicate operands as non-lossless legacy conditional shapes', () => {
    const expression = 'if(eq(lower(source("priority")), "expedited"), "Y", "N")';
    const result = hydrateSmartBuilderFromExpression({
      expression,
      targetPath: 'target.flag',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('advanced');
    if (result.kind !== 'advanced') return;
    expect(result.reason).toBe('complex-expression');
    expect(result.classification).toBe('non-lossless-condition-value');
    expect(result.expression).toBe(expression);
  });

  it('classifies transformed right operand as non-lossless legacy conditional shape', () => {
    const expression = 'if(eq(source("priority"), trim(source("priorityThreshold"))), "Y", "N")';
    const result = hydrateSmartBuilderFromExpression({
      expression,
      targetPath: 'target.flag',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('advanced');
    if (result.kind !== 'advanced') return;
    expect(result.reason).toBe('complex-expression');
    expect(result.classification).toBe('non-lossless-condition-value');
    expect(result.expression).toBe(expression);
  });

  it('classifies transformed else branch output as non-lossless legacy conditional shape', () => {
    const expression = 'if(eq(source("priority"), "expedited"), "Y", upper(source("priority")))';
    const result = hydrateSmartBuilderFromExpression({
      expression,
      targetPath: 'target.flag',
      targetType: 'string',
      isRequired: false,
    });

    expect(result.kind).toBe('advanced');
    if (result.kind !== 'advanced') return;
    expect(result.reason).toBe('complex-expression');
    expect(result.classification).toBe('non-lossless-condition-value');
    expect(result.expression).toBe(expression);
  });

  it('supports lossless legacy slot-shape equivalent with source/get/static/null values', () => {
    const expression = 'if(and(eq(source("requestedQuantity"), get(external("inventory"), "availableQuantity")), isNull(source("backorderReason"))), source("status"), null)';
    const result = hydrateSmartBuilderFromExpression({
      expression,
      targetPath: 'target.availability',
      targetType: 'string',
      isRequired: false,
      sourceValueTypeByPath: {
        requestedQuantity: 'number',
        backorderReason: 'string',
        status: 'string',
      },
    });

    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.draft.composition?.kind).toBe('condition');
    if (result.draft.composition?.kind !== 'condition') return;
    expect(result.draft.expression).toBe(expression);
    expect(result.draft.composition.matchMode).toBe('all');
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

  it('maps number.round parameter payload into output-step args with default decimals', () => {
    const defaultArgs = toSmartBuilderTransformArgsFromParameters({
      actionId: 'number.round',
      values: {},
    });
    const explicitArgs = toSmartBuilderTransformArgsFromParameters({
      actionId: 'number.round',
      values: { decimals: 2 },
    });

    expect(defaultArgs).toEqual([{ kind: 'static', value: 0 }]);
    expect(explicitArgs).toEqual([{ kind: 'static', value: 2 }]);
  });

  it('maps null.default parameter payload into default composition patch', () => {
    const composition = toSmartBuilderCompositionPatchFromParameters({
      actionId: 'null.default',
      firstInputId: 'input-1',
      values: {
        fallbackMode: 'fixed',
        fallbackFixedString: 'N/A',
      },
    });

    expect(composition).toEqual({
      kind: 'default',
      inputId: 'input-1',
      fallback: { kind: 'static', value: 'N/A' },
    });
  });

  it('maps null.default constant fallback mode into expression patch', () => {
    const composition = toSmartBuilderCompositionPatchFromParameters({
      actionId: 'null.default',
      firstInputId: 'input-1',
      values: {
        fallbackMode: 'constant',
        fallbackConstantName: 'DEFAULT_CURRENCY',
      },
    });

    expect(composition).toEqual({
      kind: 'default',
      inputId: 'input-1',
      fallback: { kind: 'expression', expression: 'constant("DEFAULT_CURRENCY")' },
    });
  });

  it('derives input usages for direct composition', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.priority',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [{
        id: 'priorityInput',
        sourceKind: 'primary' as const,
        label: 'priority',
        path: 'transaction.priority',
        valueType: 'string' as const,
        transforms: [],
      }],
      composition: {
        kind: 'direct' as const,
        inputId: 'priorityInput',
      },
    };

    expect(getBuilderInputUsages(draft)).toEqual([
      { inputId: 'priorityInput', location: 'direct' },
    ]);
  });

  it('derives recursive usage contexts for valueMap lookup/output/fallback and result-step args', () => {
    const draft = normalizeSmartBuilderDraft({
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.channel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'lookupInput',
          sourceKind: 'primary' as const,
          label: 'channel',
          path: 'channel',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'mappedOutputInput',
          sourceKind: 'primary' as const,
          label: 'channelCanonical',
          path: 'channelCanonical',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'fallbackInput',
          sourceKind: 'primary' as const,
          label: 'channelFallback',
          path: 'channelFallback',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'resultArgInput',
          sourceKind: 'primary' as const,
          label: 'suffix',
          path: 'suffix',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'valueMap' as const,
        inputId: 'lookupInput',
        scope: 'inline' as const,
        mappings: [
          {
            whenValue: 'web',
            output: { kind: 'input' as const, inputId: 'mappedOutputInput' },
          },
        ],
        fallback: { kind: 'input' as const, inputId: 'fallbackInput' },
      },
      resultSteps: [
        {
          functionName: 'concat',
          args: [{ kind: 'input' as const, inputId: 'resultArgInput' }],
        },
      ],
    });

    expect(getBuilderInputUsages(draft)).toEqual([
      { inputId: 'lookupInput', location: 'value-map-lookup' },
      { inputId: 'mappedOutputInput', location: 'value-map-output', mappingIndex: 0 },
      { inputId: 'fallbackInput', location: 'value-map-fallback' },
      { inputId: 'resultArgInput', location: 'result-step-arg', stepIndex: 0, argIndex: 0 },
    ]);
  });

  it('derives recursive usage contexts for explicit concat/coalesce/math recipes', () => {
    const concatDraft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.fullName',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        { id: 'a', sourceKind: 'primary' as const, label: 'first', path: 'first', valueType: 'string' as const, transforms: [] },
        { id: 'b', sourceKind: 'primary' as const, label: 'last', path: 'last', valueType: 'string' as const, transforms: [] },
      ],
      composition: {
        kind: 'concat' as const,
        inputIds: ['a', 'b'],
        parts: [
          { kind: 'input' as const, inputId: 'a' },
          { kind: 'static' as const, value: ' ' },
          { kind: 'input' as const, inputId: 'b' },
        ],
      },
    };

    expect(getBuilderInputUsages(concatDraft)).toEqual([
      { inputId: 'a', location: 'concat-part', valueIndex: 0 },
      { inputId: 'b', location: 'concat-part', valueIndex: 2 },
    ]);

    const coalesceDraft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.displayName',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        { id: 'a', sourceKind: 'primary' as const, label: 'nick', path: 'nick', valueType: 'string' as const, transforms: [] },
        { id: 'b', sourceKind: 'primary' as const, label: 'legal', path: 'legal', valueType: 'string' as const, transforms: [] },
        { id: 'c', sourceKind: 'primary' as const, label: 'default', path: 'default', valueType: 'string' as const, transforms: [] },
      ],
      composition: {
        kind: 'coalesce' as const,
        inputIds: ['a', 'b'],
        values: [
          { kind: 'input' as const, inputId: 'a' },
          { kind: 'input' as const, inputId: 'b' },
        ],
        fallback: { kind: 'input' as const, inputId: 'c' },
      },
    };

    expect(getBuilderInputUsages(coalesceDraft)).toEqual([
      { inputId: 'a', location: 'coalesce-operand', valueIndex: 0 },
      { inputId: 'b', location: 'coalesce-operand', valueIndex: 1 },
      { inputId: 'c', location: 'coalesce-fallback' },
    ]);

    const mathDraft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.total',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        { id: 'a', sourceKind: 'primary' as const, label: 'subtotal', path: 'subtotal', valueType: 'number' as const, transforms: [] },
        { id: 'b', sourceKind: 'primary' as const, label: 'discount', path: 'discount', valueType: 'number' as const, transforms: [] },
        { id: 'c', sourceKind: 'primary' as const, label: 'shipping', path: 'shipping', valueType: 'number' as const, transforms: [] },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'a',
        operations: [
          { operator: 'subtract' as const, inputId: 'b' },
          { operator: 'add' as const, inputId: 'c' },
        ],
      },
    };

    expect(getBuilderInputUsages(mathDraft)).toEqual([
      { inputId: 'a', location: 'math-start' },
      { inputId: 'b', location: 'math-operand', operationIndex: 0 },
      { inputId: 'c', location: 'math-operand', operationIndex: 1 },
    ]);

    const mathWithLiteralDraft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.ratio',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        { id: 'start', sourceKind: 'primary' as const, label: 'subtotal', path: 'subtotal', valueType: 'number' as const, transforms: [] },
        { id: 'tax', sourceKind: 'primary' as const, label: 'tax', path: 'tax', valueType: 'number' as const, transforms: [] },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'start',
        operations: [
          { operator: 'add' as const, inputId: 'tax' },
          { operator: 'divide' as const, operand: { kind: 'static' as const, value: 2 } },
        ],
      },
    };

    expect(getBuilderInputUsages(mathWithLiteralDraft)).toEqual([
      { inputId: 'start', location: 'math-start' },
      { inputId: 'tax', location: 'math-operand', operationIndex: 0 },
    ]);
  });

  it('derives operator options by left type for condition predicates', () => {
    expect(getAllowedConditionOperatorsForLeftType('number')).toEqual([
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isNull', 'isNotNull', 'isTruthy', 'isFalsy',
    ]);
    expect(getAllowedConditionOperatorsForLeftType('boolean')).toEqual([
      'eq', 'neq', 'isNull', 'isNotNull', 'isTruthy', 'isFalsy',
    ]);
    expect(getAllowedConditionOperatorsForLeftType('string')).toEqual([
      'eq', 'neq', 'contains', 'isNull', 'isNotNull', 'isTruthy', 'isFalsy',
    ]);
  });

  it('reports compatibility diagnostics for invalid condition comparisons', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.flag',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'leftNumber',
          sourceKind: 'primary' as const,
          label: 'requestedQuantity',
          path: 'requestedQuantity',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'rightString',
          sourceKind: 'enrichment' as const,
          label: 'availableQuantityText',
          path: 'availableQuantityText',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition' as const,
        matchMode: 'all' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'leftNumber' },
            operator: 'gt' as const,
            right: { kind: 'input' as const, inputId: 'rightString' },
          }],
          thenOutput: { kind: 'static' as const, value: 'Y' },
        }],
        elseOutput: { kind: 'static' as const, value: 'N' },
      },
    };

    const issues = getConditionCompatibilityIssues(
      draft,
      draft.composition,
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual(expect.objectContaining({
      clauseIndex: 0,
      predicateIndex: 0,
      message: expect.stringContaining('requires numeric left and comparison values'),
    }));
  });

  it('derives input usages for conditional composition locations', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.priority',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'leftInput',
          sourceKind: 'primary' as const,
          label: 'priority',
          path: 'transaction.priority',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'rightInput',
          sourceKind: 'primary' as const,
          label: 'channel',
          path: 'transaction.channel',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'thenInput',
          sourceKind: 'primary' as const,
          label: 'tier',
          path: 'customer.accountTier',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'elseInput',
          sourceKind: 'static' as const,
          label: 'fallback',
          staticValue: 'STANDARD',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition' as const,
        clauses: [
          {
            predicates: [{
              left: { kind: 'input' as const, inputId: 'leftInput' },
              operator: 'eq' as const,
              right: { kind: 'input' as const, inputId: 'rightInput' },
            }],
            thenOutput: { kind: 'input' as const, inputId: 'thenInput' },
          },
        ],
        elseOutput: { kind: 'input' as const, inputId: 'elseInput' },
      },
    };

    expect(getBuilderInputUsages(draft)).toEqual([
      { inputId: 'leftInput', location: 'condition-left', clauseIndex: 0, predicateIndex: 0 },
      { inputId: 'rightInput', location: 'condition-right', clauseIndex: 0, predicateIndex: 0 },
      { inputId: 'thenInput', location: 'then', clauseIndex: 0 },
      { inputId: 'elseInput', location: 'otherwise' },
    ]);
  });
});
