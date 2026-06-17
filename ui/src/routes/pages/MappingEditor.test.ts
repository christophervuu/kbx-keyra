import { describe, expect, it } from 'vitest';

import {
  applySmartActionToDraft,
  applyStagedInputToSmartDraft,
  resolveBuilderTargetPath,
  resolveInitialSelectedSampleId,
  shouldUseArrayBuilderForSmartDraft,
} from './MappingEditor';

import { createEmptySmartBuilderDraft } from '@/features/mappings/lib';
import type { SchemaSamplePayloadMetadata, SchemaTreeNode } from '@/lib/types/domain';

const makeNode = (
  path: string,
  fieldName: string,
  type: SchemaTreeNode['type'],
  depth: number,
  children: SchemaTreeNode[] = [],
): SchemaTreeNode => ({
  path,
  fieldName,
  type,
  depth,
  isArray: type === 'array',
  isRequired: false,
  parentPath: depth > 0 ? path.split('.').slice(0, -1).join('.') : null,
  childCount: children.length,
  children,
});

const TARGET_NODES: SchemaTreeNode[] = (() => {
  const orderItemSku = makeNode('order.items.sku', 'sku', 'string', 2);
  const orderItemQty = makeNode('order.items.qty', 'qty', 'number', 2);
  const orderItems = makeNode('order.items', 'items', 'array', 1, [orderItemSku, orderItemQty]);
  const orderId = makeNode('order.id', 'id', 'string', 1);
  const order = makeNode('order', 'order', 'object', 0, [orderItems, orderId]);
  const customerName = makeNode('customer.name', 'name', 'string', 1);
  const customer = makeNode('customer', 'customer', 'object', 0, [customerName]);

  return [order, orderItems, orderItemSku, orderItemQty, orderId, customer, customerName];
})();

describe('resolveBuilderTargetPath', () => {
  it('returns the same path for a directly selected array node', () => {
    expect(resolveBuilderTargetPath(TARGET_NODES, 'order.items')).toBe('order.items');
  });

  it('routes array descendants to the nearest array ancestor path', () => {
    expect(resolveBuilderTargetPath(TARGET_NODES, 'order.items.sku')).toBe('order.items');
    expect(resolveBuilderTargetPath(TARGET_NODES, 'order.items.qty')).toBe('order.items');
  });

  it('keeps non-array descendants on their original path', () => {
    expect(resolveBuilderTargetPath(TARGET_NODES, 'customer.name')).toBe('customer.name');
  });

  it('returns the original path when node cannot be resolved', () => {
    expect(resolveBuilderTargetPath(TARGET_NODES, 'unknown.path')).toBe('unknown.path');
  });
});

function makeSample(
  sampleId: string,
  options?: {
    readonly usedForInference?: boolean;
  },
): SchemaSamplePayloadMetadata {
  return {
    sampleId,
    schemaId: 'schema-1',
    name: sampleId,
    dataFormat: 'json',
    contentRef: `ref:${sampleId}`,
    usedForInference: options?.usedForInference ?? false,
    source: 'added_sample',
    createdAt: '2026-06-11T00:00:00.000Z',
  };
}

describe('resolveInitialSelectedSampleId', () => {
  it('prefers user last-selected sample id when available', () => {
    const samples = [
      makeSample('sample-a'),
      makeSample('sample-b', { usedForInference: true }),
    ];

    expect(
      resolveInitialSelectedSampleId({
        samples,
        lastSelectedSampleId: 'sample-a',
        mappingDefaultSampleId: 'sample-b',
      }),
    ).toBe('sample-a');
  });

  it('falls back to mapping default sample id when user preference is missing', () => {
    const samples = [
      makeSample('sample-a'),
      makeSample('sample-b', { usedForInference: true }),
    ];

    expect(
      resolveInitialSelectedSampleId({
        samples,
        lastSelectedSampleId: null,
        mappingDefaultSampleId: 'sample-b',
      }),
    ).toBe('sample-b');
  });

  it('falls back to schema default sample when user and mapping defaults are unavailable', () => {
    const samples = [
      makeSample('sample-a', { usedForInference: true }),
      makeSample('sample-b'),
    ];

    expect(
      resolveInitialSelectedSampleId({
        samples,
        lastSelectedSampleId: null,
        mappingDefaultSampleId: null,
      }),
    ).toBe('sample-a');
  });

  it('returns null when no samples are available', () => {
    expect(
      resolveInitialSelectedSampleId({
        samples: [],
        lastSelectedSampleId: 'missing',
        mappingDefaultSampleId: 'missing',
      }),
    ).toBeNull();
  });
});

describe('applyStagedInputToSmartDraft', () => {
  it('creates direct draft on first staged input', () => {
    const draft = createEmptySmartBuilderDraft({
      targetPath: 'order.id',
      targetType: 'string',
      isRequired: false,
    });

    const result = applyStagedInputToSmartDraft({
      draft,
      staged: {
        path: 'orderId',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("orderId")',
      },
    });

    expect(result.outcome).toBe('created-direct-draft');
    expect(result.expression).toBe('source("orderId")');
    expect(result.draft.inputs).toHaveLength(1);
    expect(result.draft.composition).toEqual({
      kind: 'direct',
      inputId: result.draft.inputs[0]?.id,
    });
  });

  it('appends second staged input without implicitly switching base composition', () => {
    const base = createEmptySmartBuilderDraft({
      targetPath: 'order.fullName',
      targetType: 'string',
      isRequired: false,
    });
    const first = applyStagedInputToSmartDraft({
      draft: base,
      staged: {
        path: 'firstName',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("firstName")',
      },
    });

    const second = applyStagedInputToSmartDraft({
      draft: first.draft,
      staged: {
        path: 'lastName',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("lastName")',
      },
    });

    expect(second.outcome).toBe('appended-to-tray');
    expect(second.draft.inputs).toHaveLength(2);
    expect(second.draft.inputs.map((input) => input.path)).toEqual(['firstName', 'lastName']);
    expect(second.draft.composition).toEqual({
      kind: 'direct',
      inputId: second.draft.inputs[0]?.id,
    });
    expect(second.expression).toContain('source("firstName")');
    expect(second.expression).not.toContain('source("lastName")');
  });

  it('does not implicitly concat when two numeric inputs are staged', () => {
    const base = createEmptySmartBuilderDraft({
      targetPath: 'order.total',
      targetType: 'number',
      isRequired: false,
    });

    const first = applyStagedInputToSmartDraft({
      draft: base,
      staged: {
        path: 'subtotal',
        kind: 'primary',
        valueType: 'number',
        expression: 'source("subtotal")',
      },
    });

    const second = applyStagedInputToSmartDraft({
      draft: first.draft,
      staged: {
        path: 'tax',
        kind: 'primary',
        valueType: 'number',
        expression: 'source("tax")',
      },
    });

    expect(second.outcome).toBe('appended-to-tray');
    expect(second.draft.inputs).toHaveLength(2);
    expect(second.draft.composition).toEqual({
      kind: 'direct',
      inputId: second.draft.inputs[0]?.id,
    });
    expect(second.expression).toBe('source("subtotal")');
  });

  it('fills focused slot without appending top-level tray input', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.reviewFlag',
        targetType: 'boolean',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'existing',
          path: 'existing',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      focusedSlotId: 'condition-left',
    };

    const result = applyStagedInputToSmartDraft({
      draft,
      staged: {
        path: 'candidate',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("candidate")',
      },
    });

    expect(result.outcome).toBe('filled-focused-slot');
    expect(result.draft.inputs).toHaveLength(1);
    expect(result.draft.slotScopedInputs?.['condition-left']?.path).toBe('candidate');
  });

  it('fills focused condition right slot and generates deterministic condition expression', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.reviewFlag',
        targetType: 'boolean',
        isRequired: false,
      }),
      focusedSlotId: 'condition:right',
      composition: {
        kind: 'condition' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'expression' as const, expression: 'source("leftEmail")' },
            operator: 'eq' as const,
            right: { kind: 'static' as const, value: '' },
          }],
          thenOutput: { kind: 'static' as const, value: 'MATCH' },
        }],
        elseOutput: { kind: 'static' as const, value: 'NO_MATCH' },
      },
    };

    const result = applyStagedInputToSmartDraft({
      draft,
      staged: {
        path: 'rightEmail',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("rightEmail")',
      },
    });

    expect(result.outcome).toBe('filled-focused-slot');
    expect(result.expression).toContain('eq(source("leftEmail"), source("rightEmail"))');
    expect(result.expression).toContain('"MATCH"');
    expect(result.expression).toContain('"NO_MATCH"');
  });

  it('maps staged constant/static/expression kinds into tray inputs and DSL', () => {
    const draft = createEmptySmartBuilderDraft({
      targetPath: 'order.code',
      targetType: 'string',
      isRequired: false,
    });

    const constantResult = applyStagedInputToSmartDraft({
      draft,
      staged: {
        path: 'DEFAULT_CODE',
        kind: 'constant',
        constantName: 'DEFAULT_CODE',
        valueType: 'string',
        expression: 'constant("DEFAULT_CODE")',
      },
    });
    expect(constantResult.expression).toBe('constant("DEFAULT_CODE")');

    const staticResult = applyStagedInputToSmartDraft({
      draft,
      staged: {
        path: 'fixedValue',
        kind: 'static',
        staticValue: 123,
        valueType: 'number',
        expression: 'static(123)',
      },
    });
    expect(staticResult.expression).toBe('static(123)');

    const expressionResult = applyStagedInputToSmartDraft({
      draft,
      staged: {
        path: 'expr',
        kind: 'expression',
        rawExpression: 'source("x")',
        valueType: 'unknown',
        expression: 'source("x")',
      },
    });
    expect(expressionResult.expression).toBe('source("x")');
  });

  it('maps staged item/parent kinds into direct array-scope DSL', () => {
    const draft = createEmptySmartBuilderDraft({
      targetPath: 'order.items.value',
      targetType: 'string',
      isRequired: false,
    });

    const itemResult = applyStagedInputToSmartDraft({
      draft,
      staged: {
        path: 'sku',
        kind: 'item',
        valueType: 'string',
        expression: 'item("sku")',
      },
    });
    expect(itemResult.expression).toBe('item("sku")');

    const parentResult = applyStagedInputToSmartDraft({
      draft,
      staged: {
        path: 'orderId',
        kind: 'parent',
        valueType: 'string',
        expression: 'parent("orderId")',
      },
    });
    expect(parentResult.expression).toBe('parent("orderId")');
  });

  it('AE-04: focused-slot routing does not append to top-level tray inputs', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.reviewFlag',
        targetType: 'boolean',
        isRequired: false,
      }),
      inputs: [{
        id: 'input-1',
        sourceKind: 'primary' as const,
        label: 'existing',
        path: 'existing',
        valueType: 'string' as const,
        transforms: [],
      }],
      focusedSlotId: 'condition:left',
    };

    const result = applyStagedInputToSmartDraft({
      draft,
      staged: {
        path: 'candidate',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("candidate")',
      },
    });

    expect(result.outcome).toBe('filled-focused-slot');
    expect(result.draft.inputs).toHaveLength(1);
    expect(result.draft.slotScopedInputs?.['condition:left']?.path).toBe('candidate');
  });

  it('AE-03: preserves deterministic expression generation for appended inputs without implicit concat', () => {
    const base = createEmptySmartBuilderDraft({
      targetPath: 'order.fullName',
      targetType: 'string',
      isRequired: false,
    });

    const first = applyStagedInputToSmartDraft({
      draft: base,
      staged: {
        path: 'firstName',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("firstName")',
      },
    });

    const second = applyStagedInputToSmartDraft({
      draft: first.draft,
      staged: {
        path: 'lastName',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("lastName")',
      },
    });

    expect(second.expression).toBe('source("firstName")');
  });

  it('toggles off an already-added source field instead of duplicating it', () => {
    const base = createEmptySmartBuilderDraft({
      targetPath: 'order.fullName',
      targetType: 'string',
      isRequired: false,
    });

    const first = applyStagedInputToSmartDraft({
      draft: base,
      staged: {
        path: 'firstName',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("firstName")',
      },
    });

    const second = applyStagedInputToSmartDraft({
      draft: first.draft,
      staged: {
        path: 'firstName',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("firstName")',
      },
    });

    expect(second.draft.inputs).toHaveLength(0);
    expect(second.expression).toBe('');
  });
});

describe('shouldUseArrayBuilderForSmartDraft', () => {
  it('returns true for array targets and item/parent scoped inputs', () => {
    const base = createEmptySmartBuilderDraft({
      targetPath: 'order.items',
      targetType: 'array',
      isRequired: false,
    });

    expect(shouldUseArrayBuilderForSmartDraft(base)).toBe(true);

    const itemScoped = {
      ...base,
      targetType: 'string' as const,
      inputs: [{
        id: 'i1',
        sourceKind: 'item' as const,
        label: 'item',
        path: 'value',
        valueType: 'string' as const,
        transforms: [],
      }],
    };

    expect(shouldUseArrayBuilderForSmartDraft(itemScoped)).toBe(true);
  });

  it('returns false for non-array drafts without array context', () => {
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
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    expect(shouldUseArrayBuilderForSmartDraft(draft)).toBe(false);
  });
});

describe('applySmartActionToDraft', () => {
  it('applies text.concat to existing tray inputs', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.fullName',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'firstName',
          path: 'firstName',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'lastName',
          path: 'lastName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    const next = applySmartActionToDraft(draft, 'text.concat');
    expect(next.composition?.kind).toBe('concat');
    expect(next.expression).toBe('concat(source("firstName"), " ", source("lastName"))');
  });

  it('applies text.upper as an input transform and updates expression', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.tierUpper',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'loyaltyTier',
          path: 'loyaltyTier',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    const next = applySmartActionToDraft(draft, 'text.upper');
    expect(next.inputs[0]?.transforms).toEqual([{ functionName: 'upper' }]);
    expect(next.expression).toBe('upper(source("loyaltyTier"))');
  });

  it('applies text.lower and text.trim as stacked input transforms', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.normalizedTier',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'loyaltyTier',
          path: 'loyaltyTier',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    const lowered = applySmartActionToDraft(draft, 'text.lower');
    expect(lowered.expression).toBe('lower(source("loyaltyTier"))');

    const trimmedAfterLower = applySmartActionToDraft(lowered, 'text.trim');
    expect(trimmedAfterLower.expression).toBe('trim(lower(source("loyaltyTier")))');
  });

  it('applies text.phoneDigits as a guided multi-step normalization chain', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.phoneDigits',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'phone',
          path: 'phone',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    const next = applySmartActionToDraft(draft, 'text.phoneDigits');
    expect(next.expression).toBe(
      'replaceAll(replaceAll(replaceAll(replaceAll(trim(source("phone")), "(", ""), ")", ""), "-", ""), " ", "")',
    );
  });

  it('applies text.substring as an input transform with default start index', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.emailDomain',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'email',
          path: 'email',
          valueType: 'string' as const,
          transforms: [
            { functionName: 'trim' as const },
            { functionName: 'lower' as const },
          ],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    const next = applySmartActionToDraft(draft, 'text.substring');
    expect(next.expression).toBe('substring(lower(trim(source("email"))), 0)');
  });

  it('applies parameterized text.substring using pending normalized parameter draft', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.initials',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'name',
          path: 'name',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
      pendingActionDraft: {
        actionId: 'text.substring',
        values: { start: 1, length: 3 },
        validation: { isValid: true, issues: [] },
      },
    };

    const next = applySmartActionToDraft(draft, 'text.substring');
    expect(next.expression).toBe('substring(source("name"), 1, 3)');
  });

  it('applies parameterized text.replace mode=first using replace()', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.normalized',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'raw',
          path: 'raw',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
      pendingActionDraft: {
        actionId: 'text.replace',
        values: { match: ' ', replacement: '-', mode: 'first' },
        validation: { isValid: true, issues: [] },
      },
    };

    const next = applySmartActionToDraft(draft, 'text.replace');
    expect(next.expression).toBe('replace(source("raw"), " ", "-")');
  });

  it('applies null.default fallback from normalized parameter payload', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.name',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'preferredName',
          path: 'preferredName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
      pendingActionDraft: {
        actionId: 'null.default',
        values: { fallbackExpression: '"UNKNOWN"' },
        validation: { isValid: true, issues: [] },
      },
    };

    const next = applySmartActionToDraft(draft, 'null.default');
    expect(next.expression).toBe('coalesce(source("preferredName"), "UNKNOWN")');
  });

  it('applies date.format with explicit input/output format parameters', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.issuedDate',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'issuedOn',
          path: 'issuedOn',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
      pendingActionDraft: {
        actionId: 'date.format',
        values: {
          inputFormat: 'YYYY/MM/DD',
          outputFormat: 'YYYY-MM-DD',
        },
        validation: { isValid: true, issues: [] },
      },
    };

    const next = applySmartActionToDraft(draft, 'date.format');
    expect(next.expression).toBe('formatDate(source("issuedOn"), "YYYY/MM/DD", "YYYY-MM-DD")');
  });

  it('blocks apply when pending action parameter validation is invalid', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.initials',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'name',
          path: 'name',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
      expression: 'source("name")',
      pendingActionDraft: {
        actionId: 'text.substring',
        values: { start: -1 },
        validation: {
          isValid: false,
          issues: [{ fieldId: 'start', code: 'too-small' as const, message: 'Start index must be >= 0.' }],
        },
      },
    };

    const next = applySmartActionToDraft(draft, 'text.substring');
    expect(next).toBe(draft);
    expect(next.expression).toBe('source("name")');
  });

  it('supports base.direct action to reset base mapping explicitly', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.fullName',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'firstName',
          path: 'firstName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'concat' as const, inputIds: ['a'], separator: ' ' },
    };

    const next = applySmartActionToDraft(draft, 'base.direct');
    expect(next.composition).toEqual({ kind: 'direct', inputId: 'a' });
    expect(next.expression).toBe('source("firstName")');
  });
});
