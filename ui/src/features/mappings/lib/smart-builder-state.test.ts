import { describe, expect, it } from 'vitest';

import {
  createActionParameterDraft,
  createEmptySmartBuilderDraft,
  getAllowedConditionOperatorsForLeftType,
  getBuilderInputUsages,
  getConditionCompatibilityIssues,
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

  it('hydrates project value-table valueMap expressions into guided draft when metadata exists', () => {
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

  it('hydrates exact inline value-map expression into guided draft', () => {
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

  it('hydrates exact project value-map expression with return-input fallback into guided draft', () => {
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
    expect(result.draft.composition.scope).toBe('project');
    expect(result.draft.composition.project?.ref.valueTableId).toBe('vt-1');
    expect(result.draft.composition.noMatchBehavior?.mode).toBe('return_input');
    expect(result.draft.expression).toBe('valueMap(source("status"), valueTable("exercise-1-table", "side-a", "side-b"), source("status"))');
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

  it('hydrates representable conditional expression with all-match predicates', () => {
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

  it('returns advanced-mode result for non-decomposable expression', () => {
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

  it('classifies transformed predicate operands as non-lossless legacy conditional shapes', () => {
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
        fallbackExpression: '"N/A"',
      },
    });

    expect(composition).toEqual({
      kind: 'default',
      inputId: 'input-1',
      fallback: { kind: 'static', value: 'N/A' },
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
