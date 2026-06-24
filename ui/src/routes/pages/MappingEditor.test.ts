import { describe, expect, it } from 'vitest';

import {
  buildSmartTargetSessionKey,
  buildSampleOutputByTargetPath,
  applySmartActionToDraft,
  applyStagedInputToSmartDraft,
  normalizeLegacySmartSlotId,
  removeInputFromSmartDraftWithUsageCleanup,
  resolveBuilderTargetPath,
  resolveInitialSelectedSampleId,
  shouldConfirmConditionalMethodSwitch,
  shouldHandoffArrayActionFromSmartBuilder,
  shouldUseArrayBuilderForSmartDraft,
} from './MappingEditor';

import {
  createEmptySmartBuilderDraft,
  pushSmartBuilderSnapshot,
  undoSmartBuilderExpression,
} from '@/features/mappings/lib';
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

describe('buildSmartTargetSessionKey', () => {
  it('builds deterministic mapping-scoped target keys', () => {
    expect(buildSmartTargetSessionKey('mapping-a', 'customer.name')).toBe('mapping-a::customer.name');
    expect(buildSmartTargetSessionKey('mapping-b', 'customer.name')).not.toBe(buildSmartTargetSessionKey('mapping-a', 'customer.name'));
  });
});

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

describe('buildSampleOutputByTargetPath', () => {
  it('includes nested child paths when schema node list is root-only hierarchical', () => {
    const transactionChildren = [
      makeNode('transaction.id', 'id', 'string', 1),
      makeNode('transaction.createdDate', 'createdDate', 'string', 1),
    ];
    const transactionRoot = makeNode('transaction', 'transaction', 'object', 0, transactionChildren);
    const rootOnlyNodes: SchemaTreeNode[] = [transactionRoot];

    const output = {
      transaction: {
        id: 'tx-1001',
        createdDate: '2026-06-19',
      },
    };

    const sampleOutput = buildSampleOutputByTargetPath(rootOnlyNodes, output);

    expect(sampleOutput['transaction']).toContain('{"id":"tx-1001"');
    expect(sampleOutput['transaction.id']).toBe('"tx-1001"');
    expect(sampleOutput['transaction.createdDate']).toBe('"2026-06-19"');
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
  it('discovery: legacy slot-based focusedSlotId aliases map to deterministic conditional slot writes', () => {
    const legacySlotAliases: readonly { readonly slot: string }[] = [
      { slot: 'condition:left' },
      { slot: 'condition:right' },
      { slot: 'condition:then' },
      { slot: 'condition:else' },
    ];

    for (const entry of legacySlotAliases) {
      const draft = {
        ...createEmptySmartBuilderDraft({
          targetPath: 'order.reviewFlag',
          targetType: 'boolean',
          isRequired: false,
        }),
        focusedSlotId: entry.slot,
        composition: {
          kind: 'condition' as const,
          clauses: [{
            predicates: [{
              left: { kind: 'static' as const, value: '' },
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
          path: 'candidate',
          kind: 'primary',
          valueType: 'string',
          expression: 'source("candidate")',
        },
      });

      expect(result.outcome).toBe('filled-focused-slot');
      expect(result.draft.slotScopedInputs?.[entry.slot]?.path).toBe('candidate');
      expect(result.expression).toBe('');
    }
  });

  it('migrates legacy condition-left slot id to canonical left-slot behavior', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.reviewFlag',
        targetType: 'boolean',
        isRequired: false,
      }),
      focusedSlotId: 'condition-left',
      composition: {
        kind: 'condition' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'static' as const, value: '' },
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
        path: 'candidate',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("candidate")',
      },
    });

    expect(result.outcome).toBe('filled-focused-slot');
    expect(result.draft.slotScopedInputs?.['condition:left']?.path).toBe('candidate');
    expect(result.expression).toBe('');
  });

  it('normalizes known legacy focused-slot aliases to canonical slot ids', () => {
    expect(normalizeLegacySmartSlotId('condition-left')).toBe('condition:left');
    expect(normalizeLegacySmartSlotId('condition-right')).toBe('condition:right');
    expect(normalizeLegacySmartSlotId('condition-then')).toBe('condition:then');
    expect(normalizeLegacySmartSlotId('condition-else')).toBe('condition:else');
    expect(normalizeLegacySmartSlotId('fallback-default')).toBe('fallback:default');
    expect(normalizeLegacySmartSlotId('condition:left')).toBe('condition:left');
    expect(normalizeLegacySmartSlotId(null)).toBeNull();
  });

  it('AE-02: creates direct draft on first staged input', () => {
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
      inputId: first.draft.inputs[0]?.id,
    });
    expect(second.expression).toBe('source("firstName")');
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
      inputId: first.draft.inputs[0]?.id,
    });
    expect(second.expression).toBe('source("subtotal")');
  });

  it('fills focused slot and auto-adds selected field to tray when missing', () => {
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
    expect(result.draft.inputs).toHaveLength(2);
    expect(result.draft.inputs.some((input) => input.path === 'candidate')).toBe(true);
    expect(result.draft.slotScopedInputs?.['condition:left']?.path).toBe('candidate');
  });

  it('AE-24: fills focused condition right slot and generates deterministic condition expression', () => {
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

  it('preserves existing per-usage transforms when replacing focused conditional slots', () => {
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
            left: {
              kind: 'input' as const,
              inputId: 'input-left',
              transforms: [{ functionName: 'trim' as const }],
            },
            operator: 'eq' as const,
            right: {
              kind: 'expression' as const,
              expression: 'source("before")',
              transforms: [{ functionName: 'upper' as const }],
            },
          }],
          thenOutput: {
            kind: 'expression' as const,
            expression: 'source("thenBefore")',
            transforms: [{ functionName: 'lower' as const }],
          },
        }],
        elseOutput: {
          kind: 'expression' as const,
          expression: 'source("elseBefore")',
          transforms: [{ functionName: 'length' as const }],
        },
      },
      inputs: [
        {
          id: 'input-left',
          sourceKind: 'primary' as const,
          label: 'left',
          path: 'left',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
    };

    const rightResult = applyStagedInputToSmartDraft({
      draft,
      staged: {
        path: 'afterRight',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("afterRight")',
      },
    });

    const rightTransforms = ((rightResult.draft.composition?.kind === 'condition'
      ? rightResult.draft.composition.clauses[0]?.predicates[0]?.right
      : null) as { readonly transforms?: readonly { readonly functionName: string }[] } | null)?.transforms ?? [];
    expect(rightTransforms).toEqual([{ functionName: 'upper' }]);

    const thenResult = applyStagedInputToSmartDraft({
      draft: { ...rightResult.draft, focusedSlotId: 'condition:then' },
      staged: {
        path: 'afterThen',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("afterThen")',
      },
    });

    const thenTransforms = ((thenResult.draft.composition?.kind === 'condition'
      ? thenResult.draft.composition.clauses[0]?.thenOutput
      : null) as { readonly transforms?: readonly { readonly functionName: string }[] } | null)?.transforms ?? [];
    expect(thenTransforms).toEqual([{ functionName: 'lower' }]);

    const elseResult = applyStagedInputToSmartDraft({
      draft: { ...thenResult.draft, focusedSlotId: 'condition:else' },
      staged: {
        path: 'afterElse',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("afterElse")',
      },
    });

    const elseTransforms = ((elseResult.draft.composition?.kind === 'condition'
      ? elseResult.draft.composition.elseOutput
      : null) as { readonly transforms?: readonly { readonly functionName: string }[] } | null)?.transforms ?? [];
    expect(elseTransforms).toEqual([{ functionName: 'length' }]);
  });

  it('routes focused fallback:default staged input into default fallback slot', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.name',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'preferredName',
          path: 'preferredName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      focusedSlotId: 'fallback:default',
      composition: {
        kind: 'default' as const,
        inputId: 'input-1',
        fallback: { kind: 'static' as const, value: 'UNKNOWN' },
      },
    };

    const result = applyStagedInputToSmartDraft({
      draft,
      staged: {
        path: 'legalName',
        kind: 'primary',
        valueType: 'string',
        expression: 'source("legalName")',
      },
    });

    expect(result.outcome).toBe('filled-focused-slot');
    expect(result.draft.inputs).toHaveLength(2);
    expect(result.draft.inputs.some((input) => input.path === 'legalName')).toBe(true);
    expect(result.draft.slotScopedInputs?.['fallback:default']?.path).toBe('legalName');
    expect(result.draft.composition).toEqual({
      kind: 'default',
      inputId: 'input-1',
      fallback: { kind: 'expression', expression: 'source("legalName")' },
    });
    expect(result.expression).toBe('default(source("preferredName"), source("legalName"))');
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

  it('AE-04: focused-slot routing appends selected source to top-level tray inputs', () => {
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
    expect(result.draft.inputs).toHaveLength(2);
    expect(result.draft.inputs.some((input) => input.path === 'candidate')).toBe(true);
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

  it('AE-04: keeps direct recipe stable with five available tray inputs', () => {
    const base = createEmptySmartBuilderDraft({
      targetPath: 'customer.fullName',
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

    const stagedPaths = ['lastName', 'middleName', 'nickname', 'displayName'] as const;
    const finalResult = stagedPaths.reduce((current, path) => applyStagedInputToSmartDraft({
      draft: current.draft,
      staged: {
        path,
        kind: 'primary',
        valueType: 'string',
        expression: `source("${path}")`,
      },
    }), first);

    expect(finalResult.draft.inputs).toHaveLength(5);
    expect(finalResult.draft.composition).toEqual({
      kind: 'direct',
      inputId: finalResult.draft.inputs[0]?.id,
    });
    expect(finalResult.expression).toBe('source("firstName")');
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
    expect(second.expression).toBe('source("firstName")');
  });

  it('AE-25: supports explicit Add-to-Tray mode by ignoring duplicate clicks', () => {
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
      selectionBehavior: 'ignore-existing',
    });

    expect(second.draft.inputs).toHaveLength(1);
    expect(second.expression).toBe('source("firstName")');
  });
});

describe('removeInputFromSmartDraftWithUsageCleanup', () => {
  it('clears referenced condition usages atomically when removing an input', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.priorityLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'priority',
          path: 'priority',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'input-2',
          sourceKind: 'primary' as const,
          label: 'channel',
          path: 'channel',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'input-1' },
            operator: 'eq' as const,
            right: { kind: 'input' as const, inputId: 'input-2' },
          }],
          thenOutput: { kind: 'input' as const, inputId: 'input-1' },
        }],
        elseOutput: { kind: 'input' as const, inputId: 'input-1' },
      },
    };

    const next = removeInputFromSmartDraftWithUsageCleanup(draft, 'input-1');
    expect(next.inputs.map((input) => input.id)).toEqual(['input-2']);
    expect(next.composition?.kind).toBe('condition');

    if (next.composition?.kind !== 'condition') {
      throw new Error('Expected condition composition after usage cleanup removal');
    }

    const predicate = next.composition.clauses[0]?.predicates[0];
    expect(predicate?.left).toEqual({ kind: 'static', value: '' });
    expect(next.composition.clauses[0]?.thenOutput).toEqual({ kind: 'static', value: '' });
    expect(next.composition.elseOutput).toEqual({ kind: 'static', value: '' });
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

describe('shouldHandoffArrayActionFromSmartBuilder', () => {
  it('AE-35: returns true for array handoff action IDs', () => {
    expect(shouldHandoffArrayActionFromSmartBuilder('array.map')).toBe(true);
    expect(shouldHandoffArrayActionFromSmartBuilder('array.filter')).toBe(true);
    expect(shouldHandoffArrayActionFromSmartBuilder('array.find')).toBe(true);
    expect(shouldHandoffArrayActionFromSmartBuilder('array.array')).toBe(true);
    expect(shouldHandoffArrayActionFromSmartBuilder('array.merge')).toBe(true);
  });

  it('returns false for non-array actions and unknown IDs', () => {
    expect(shouldHandoffArrayActionFromSmartBuilder('text.concat')).toBe(false);
    expect(shouldHandoffArrayActionFromSmartBuilder('lookup.valueMap')).toBe(false);
    expect(shouldHandoffArrayActionFromSmartBuilder('not-a-real-action')).toBe(false);
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

  it('applies text.upper as a direct value-step and updates expression', () => {
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

    const next = applySmartActionToDraft(draft, 'text.upper', {
      editingStepScope: 'value-step',
      valueStepTarget: { kind: 'direct' },
    });
    expect(next.composition?.kind).toBe('direct');
    expect(next.composition?.value?.transforms).toEqual([{ functionName: 'upper' }]);
    expect(next.expression).toBe('upper(source("loyaltyTier"))');
  });

  it('applies text.lower and text.trim as stacked direct value-steps', () => {
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

    const lowered = applySmartActionToDraft(draft, 'text.lower', {
      editingStepScope: 'value-step',
      valueStepTarget: { kind: 'direct' },
    });
    expect(lowered.expression).toBe('lower(source("loyaltyTier"))');

    const trimmedAfterLower = applySmartActionToDraft(lowered, 'text.trim', {
      editingStepScope: 'value-step',
      valueStepTarget: { kind: 'direct' },
    });
    expect(trimmedAfterLower.expression).toBe('trim(lower(source("loyaltyTier")))');
  });

  it('applies text.phoneDigits as a direct value-step alias', () => {
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

    const next = applySmartActionToDraft(draft, 'text.phoneDigits', {
      editingStepScope: 'value-step',
      valueStepTarget: { kind: 'direct' },
    });
    expect(next.expression).toBe('trim(source("phone"))');
  });

  it('applies text.substring as a direct value-step with default start index', () => {
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
      composition: {
        kind: 'direct' as const,
        inputId: 'a',
        value: {
          kind: 'input' as const,
          inputId: 'a',
          transforms: [
            { functionName: 'trim' as const },
            { functionName: 'lower' as const },
          ],
        },
      },
    };

    const next = applySmartActionToDraft(draft, 'text.substring', {
      editingStepScope: 'value-step',
      valueStepTarget: { kind: 'direct' },
    });
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

    const next = applySmartActionToDraft(draft, 'text.substring', {
      editingStepScope: 'value-step',
      valueStepTarget: { kind: 'direct' },
    });
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

    const next = applySmartActionToDraft(draft, 'text.replace', {
      editingStepScope: 'value-step',
      valueStepTarget: { kind: 'direct' },
    });
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
        values: {
          fallbackMode: 'fixed',
          fallbackFixedString: 'UNKNOWN',
        },
        validation: { isValid: true, issues: [] },
      },
    };

    const next = applySmartActionToDraft(draft, 'null.default');
    expect(next.expression).toBe('default(source("preferredName"), "UNKNOWN")');
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

    const next = applySmartActionToDraft(draft, 'date.format', {
      editingStepScope: 'value-step',
      valueStepTarget: { kind: 'direct' },
    });
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
      composition: { kind: 'concat' as const, inputIds: ['a'] },
    };

    const next = applySmartActionToDraft(draft, 'base.direct');
    expect(next.composition).toEqual({ kind: 'direct', inputId: 'a' });
    expect(next.expression).toBe('source("firstName")');
  });

  it('supports base.direct.select to switch direct source without changing tray membership', () => {
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

    const next = applySmartActionToDraft(draft, 'base.direct.select', { directInputId: 'b' });
    expect(next.composition).toEqual({ kind: 'direct', inputId: 'b' });
    expect(next.inputs.map((input) => input.id)).toEqual(['a', 'b']);
    expect(next.expression).toBe('source("lastName")');
  });

  it('supports base.fixed as direct static recipe-local value (no tray dependency)', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.status',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'status',
          path: 'status',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    const next = applySmartActionToDraft(draft, 'base.fixed', { fixedValue: 'ACTIVE' });
    expect(next.composition).toEqual({
      kind: 'direct',
      inputId: 'a',
      value: { kind: 'static', value: 'ACTIVE' },
    });
    expect(next.expression).toBe('"ACTIVE"');
    expect(next.inputs).toHaveLength(1);
  });

  it('supports base.constant as direct expression-backed recipe-local value', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.status',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'status',
          path: 'status',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    const next = applySmartActionToDraft(draft, 'base.constant', { constantName: 'DEFAULT_STATUS' });
    expect(next.composition).toEqual({
      kind: 'direct',
      inputId: 'a',
      value: { kind: 'expression', expression: 'constant("DEFAULT_STATUS")' },
    });
    expect(next.expression).toBe('constant("DEFAULT_STATUS")');
    expect(next.inputs).toHaveLength(1);
  });

  it('AE-09: supports text.concat part reordering and literal parts without tray-order inference', () => {
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

    const reordered = applySmartActionToDraft(draft, 'text.concat', {
      concatMove: { fromIndex: 2, toIndex: 0 },
    });

    expect(reordered.composition).toEqual({
      kind: 'concat',
      inputIds: ['b', 'a'],
      parts: [
        { kind: 'input', inputId: 'b' },
        { kind: 'input', inputId: 'a' },
        { kind: 'static', value: ' ' },
      ],
    });
    expect(reordered.expression).toBe('concat(source("lastName"), source("firstName"), " ")');

    const explicitParts = applySmartActionToDraft(draft, 'text.concat', {
      concatParts: [
        { kind: 'input', inputId: 'b' },
        { kind: 'static', value: ', ' },
        { kind: 'input', inputId: 'a' },
      ],
    });

    expect(explicitParts.expression).toBe('concat(source("lastName"), ", ", source("firstName"))');
    expect(explicitParts.composition?.kind).toBe('concat');
    if (explicitParts.composition?.kind !== 'concat') return;
    expect(explicitParts.composition.inputIds).toEqual(['b', 'a']);
  });

  it('supports null.coalesce explicit value ordering and fixed fallback independent of tray extras', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.displayName',
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
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'legalName',
          path: 'legalName',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'c',
          sourceKind: 'primary' as const,
          label: 'legacyName',
          path: 'legacyName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'coalesce' as const,
        inputIds: ['a', 'b'],
        values: [
          { kind: 'input' as const, inputId: 'a' },
          { kind: 'input' as const, inputId: 'b' },
        ],
      },
    };

    const reordered = applySmartActionToDraft(draft, 'null.coalesce', {
      coalesceMove: { fromIndex: 0, toIndex: 1 },
    });
    expect(reordered.expression).toBe('coalesce(source("legalName"), source("preferredName"))');

    const explicit = applySmartActionToDraft(draft, 'null.coalesce', {
      coalesceValues: [
        { kind: 'input', inputId: 'b' },
        { kind: 'input', inputId: 'a' },
      ],
      coalesceFallbackValue: 'UNKNOWN',
    });

    expect(explicit.expression).toBe('coalesce(source("legalName"), source("preferredName"), "UNKNOWN")');
    expect(explicit.composition).toEqual({
      kind: 'coalesce',
      inputIds: ['b', 'a'],
      values: [
        { kind: 'input', inputId: 'b' },
        { kind: 'input', inputId: 'a' },
      ],
      fallback: { kind: 'static', value: 'UNKNOWN' },
    });
  });

  it('keeps tray inputs when switching conditional to direct', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.priorityFlag',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'priority',
          path: 'priority',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'channel',
          path: 'channel',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition' as const,
        matchMode: 'all' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'a' },
            operator: 'eq' as const,
            right: { kind: 'static' as const, value: 'HIGH' },
          }],
          thenOutput: { kind: 'static' as const, value: 'yes' },
        }],
        elseOutput: { kind: 'static' as const, value: 'no' },
      },
    };

    const next = applySmartActionToDraft(draft, 'base.direct');
    expect(next.composition).toEqual({ kind: 'direct', inputId: 'a' });
    expect(next.inputs.map((input) => input.id)).toEqual(['a', 'b']);
  });

  it('AE-26: identifies conditional-to-non-conditional actions that require confirmation', () => {
    const conditionDraft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.priorityFlag',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [{
        id: 'a',
        sourceKind: 'primary' as const,
        label: 'priority',
        path: 'priority',
        valueType: 'string' as const,
        transforms: [],
      }],
      composition: {
        kind: 'condition' as const,
        matchMode: 'all' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'a' },
            operator: 'eq' as const,
            right: { kind: 'static' as const, value: 'HIGH' },
          }],
          thenOutput: { kind: 'static' as const, value: 'yes' },
        }],
        elseOutput: { kind: 'static' as const, value: 'no' },
      },
    };

    expect(shouldConfirmConditionalMethodSwitch(conditionDraft, 'base.direct')).toBe(true);
    expect(shouldConfirmConditionalMethodSwitch(conditionDraft, 'condition.compare')).toBe(false);
    expect(shouldConfirmConditionalMethodSwitch(conditionDraft, 'text.upper')).toBe(false);
    expect(shouldConfirmConditionalMethodSwitch(conditionDraft, 'lookup.valueMap')).toBe(true);
  });

  it('seeds condition.compare from direct composition input and defaults matchMode to all', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.priorityFlag',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'priority',
          path: 'priority',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'channel',
          path: 'channel',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'b' },
    };

    const next = applySmartActionToDraft(draft, 'condition.compare');

    expect(next.composition?.kind).toBe('condition');
    if (next.composition?.kind !== 'condition') return;
    expect(next.composition.matchMode).toBe('all');
    expect(next.composition.clauses[0]?.predicates[0]?.left).toEqual({ kind: 'input', inputId: 'b' });
    expect(next.composition.clauses[0]?.predicates[0]?.right).toEqual({ kind: 'static', value: '' });
  });

  it('allows condition.compare with empty tray and uses static placeholders', () => {
    const draft = createEmptySmartBuilderDraft({
      targetPath: 'customer.priorityFlag',
      targetType: 'string',
      isRequired: false,
    });

    const next = applySmartActionToDraft(draft, 'condition.compare');

    expect(next.composition?.kind).toBe('condition');
    if (next.composition?.kind !== 'condition') return;
    expect(next.composition.matchMode).toBe('all');
    expect(next.composition.clauses[0]?.predicates[0]?.left).toEqual({ kind: 'static', value: '' });
    expect(next.composition.clauses[0]?.predicates[0]?.right).toEqual({ kind: 'static', value: '' });
  });

  it('does not reinitialize existing condition when condition.compare is re-applied', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.priorityFlag',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'priority',
          path: 'priority',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition' as const,
        matchMode: 'any' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'a' },
            operator: 'contains' as const,
            right: { kind: 'static' as const, value: 'VIP' },
          }],
          thenOutput: { kind: 'static' as const, value: 'yes' },
        }],
        elseOutput: { kind: 'static' as const, value: 'no' },
      },
    };

    const next = applySmartActionToDraft(draft, 'condition.compare');
    expect(next).toBe(draft);
  });

  it('adds subtract operand to existing calculation without replacing calculation base', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.net',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'tax',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'discount',
          sourceKind: 'primary' as const,
          label: 'discount',
          path: 'discount',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'subtotal',
        operations: [{ operator: 'add' as const, inputId: 'tax' }],
      },
    };

    const next = applySmartActionToDraft(draft, 'number.subtract', {
      calculationInputId: 'discount',
    });

    expect(next.composition?.kind).toBe('math');
    if (next.composition?.kind !== 'math') return;
    expect(next.composition.startInputId).toBe('subtotal');
    expect(next.composition.operations).toEqual([
      { operator: 'add', inputId: 'tax' },
      { operator: 'subtract', inputId: 'discount' },
    ]);
    expect(next.expression).toBe(
      'subtract(add(source("subtotal"), source("tax")), source("discount"))',
    );
  });

  it('supports expressing a-b and b-a by setting calculation start input', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.delta',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'a',
          path: 'a',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'b',
          path: 'b',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'a',
        operations: [{ operator: 'subtract' as const, inputId: 'b' }],
      },
    };

    expect(draft.expression).toBe('');
    const aMinusB = applySmartActionToDraft(draft, 'number.subtract', {
      calculationInputId: 'b',
    });
    expect(aMinusB.expression).toBe('subtract(source("a"), source("b"))');

    const bMinusA = applySmartActionToDraft(aMinusB, 'number.add', {
      setAsStartInputId: 'b',
    });
    const normalized = applySmartActionToDraft(bMinusA, 'number.subtract', {
      calculationInputId: 'a',
    });
    expect(normalized.expression).toBe('subtract(source("b"), source("a"))');
  });

  it('reorders explicit math operations deterministically', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.total',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'tax',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'fee',
          sourceKind: 'primary' as const,
          label: 'fee',
          path: 'fee',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'subtotal',
        operations: [
          { operator: 'add' as const, inputId: 'tax' },
          { operator: 'subtract' as const, inputId: 'fee' },
        ],
      },
    };

    const next = applySmartActionToDraft(draft, 'number.add', {
      calculationMoveOperation: { fromIndex: 1, toIndex: 0 },
    });

    expect(next.composition?.kind).toBe('math');
    if (next.composition?.kind !== 'math') return;
    expect(next.composition.operations).toEqual([
      { operator: 'subtract', inputId: 'fee' },
      { operator: 'add', inputId: 'tax' },
    ]);
    expect(next.expression).toBe('add(subtract(source("subtotal"), source("fee")), source("tax"))');
  });

  it('sets a literal math operand at index and applies selected operator', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.ratio',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'tax',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'subtotal',
        operations: [{ operator: 'add' as const, inputId: 'tax' }],
      },
    };

    const next = applySmartActionToDraft(draft, 'number.divide', {
      calculationSetLiteralOperandAtIndex: 0,
      calculationLiteralOperand: 2,
    });

    expect(next.composition?.kind).toBe('math');
    if (next.composition?.kind !== 'math') return;
    expect(next.composition.operations).toEqual([
      { operator: 'divide', operand: { kind: 'static', value: 2 } },
    ]);
    expect(next.expression).toBe('divide(source("subtotal"), 2)');
  });

  it('applies output-step actions as post steps instead of replacing composition', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.netLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'tax',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'subtotal',
        operations: [{ operator: 'add' as const, inputId: 'tax' }],
      },
      expression: 'add(source("subtotal"), source("tax"))',
    };

    const rounded = applySmartActionToDraft(draft, 'number.round');
    expect(rounded.composition?.kind).toBe('math');
    expect(rounded.postSteps).toEqual([{ functionName: 'round', args: [{ kind: 'static', value: 0 }] }]);
    expect(rounded.expression).toBe('round(add(source("subtotal"), source("tax")), 0)');

    const roundedTwoDecimals = applySmartActionToDraft({
      ...draft,
      pendingActionDraft: {
        actionId: 'number.round',
        values: { decimals: 2 },
        validation: { isValid: true, issues: [] },
      },
    }, 'number.round');
    expect(roundedTwoDecimals.expression).toBe('round(add(source("subtotal"), source("tax")), 2)');

    const casted = applySmartActionToDraft(roundedTwoDecimals, 'convert.cast');
    expect(casted.composition?.kind).toBe('math');
    expect(casted.expression).toBe('cast(round(add(source("subtotal"), source("tax")), 2), "string")');
  });

  it('AE-07: supports explicit Refine Result step reorder and remove actions', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.total',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'subtotal' },
      postSteps: [
        { functionName: 'round' as const, args: [{ kind: 'static' as const, value: 0 }] },
        { functionName: 'abs' as const },
      ],
    };

    const moved = applySmartActionToDraft(draft, 'base.resultStep.move', {
      outputStepMove: { fromIndex: 1, toIndex: 0 },
    });
    expect(moved.postSteps).toEqual([
      { functionName: 'abs' },
      { functionName: 'round', args: [{ kind: 'static', value: 0 }] },
    ]);

    const removed = applySmartActionToDraft(moved, 'base.resultStep.remove', {
      outputStepRemoveIndex: 0,
    });
    expect(removed.postSteps).toEqual([
      { functionName: 'round', args: [{ kind: 'static', value: 0 }] },
    ]);
  });

  it('AE-27: restores full smart-draft state from snapshot undo after method replacement and step reorder', () => {
    const before = {
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
      composition: {
        kind: 'concat' as const,
        parts: [
          { kind: 'input' as const, inputId: 'a' },
          { kind: 'static' as const, value: ' ' },
          { kind: 'input' as const, inputId: 'b' },
        ],
      },
      postSteps: [{ functionName: 'trim' as const }],
      expression: 'trim(concat(source("firstName"), " ", source("lastName")))',
      validation: { status: 'valid' as const },
      recipeStatus: { status: 'valid' as const },
      validExpression: 'trim(concat(source("firstName"), " ", source("lastName")))',
      lastValidExpression: 'trim(concat(source("firstName"), " ", source("lastName")))',
    };

    const replaced = applySmartActionToDraft(before, 'base.direct.select', { directInputId: 'b' });
    const moved = applySmartActionToDraft(
      {
        ...replaced,
        postSteps: [
          { functionName: 'upper' as const },
          { functionName: 'trim' as const },
        ],
      },
      'base.resultStep.move',
      { outputStepMove: { fromIndex: 1, toIndex: 0 } },
    );

    const withSnapshot = pushSmartBuilderSnapshot({ previousDraft: before, nextDraft: moved });
    const undone = undoSmartBuilderExpression(withSnapshot);

    expect(undone.composition).toEqual(before.composition);
    expect(undone.postSteps).toEqual(before.postSteps);
    expect(undone.expression).toBe(before.expression);
  });

  it('maps null.default to default composition, not output-step wrapping', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.name',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'name',
          sourceKind: 'primary' as const,
          label: 'name',
          path: 'name',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'name' },
      pendingActionDraft: {
        actionId: 'null.default',
        values: {
          fallbackMode: 'fixed',
          fallbackFixedString: 'UNKNOWN',
        },
        validation: { isValid: true, issues: [] },
      },
    };

    const next = applySmartActionToDraft(draft, 'null.default');
    expect(next.composition).toEqual({
      kind: 'default',
      inputId: 'name',
      fallback: { kind: 'static', value: 'UNKNOWN' },
    });
    expect(next.expression).toBe('default(source("name"), "UNKNOWN")');
  });

  it('adds null.default as result step when apply scope is result-step', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'payment.currency',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'currency',
          sourceKind: 'primary' as const,
          label: 'payment.currency',
          path: 'payment.currency',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'currency' },
      pendingActionDraft: {
        actionId: 'null.default',
        values: {
          fallbackMode: 'fixed',
          fallbackFixedString: 'USD',
        },
        validation: { isValid: true, issues: [] },
      },
    };

    const next = applySmartActionToDraft(draft, 'null.default', {
      editingStepScope: 'result-step',
    });

    expect(next.composition).toEqual({ kind: 'direct', inputId: 'currency' });
    expect(next.postSteps).toEqual([
      {
        functionName: 'default',
        args: [{ kind: 'static', value: 'USD' }],
      },
    ]);
    expect(next.expression).toBe('default(source("payment.currency"), "USD")');
  });

  it('builds project-scoped value map with explicit no-match modes', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.statusLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'status',
          sourceKind: 'primary' as const,
          label: 'status',
          path: 'status',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'status' },
    };

    const projectSelection = {
      ref: {
        scope: 'project' as const,
        valueTableId: 'vt-1',
        tableKey: 'status_codes',
        revision: 3,
        inputSideKey: 'code',
        outputSideKey: 'label',
      },
      tableName: 'Status Codes',
      tableStatus: 'active' as const,
      currentRevision: 4,
      directionSupport: { aToB: true, bToA: true },
    };

    const withReturnInput = applySmartActionToDraft(draft, 'lookup.valueMap', {
      valueMapScope: 'project',
      valueMapProjectSelection: projectSelection,
      valueMapNoMatchMode: 'return_input',
    });

    expect(withReturnInput.composition?.kind).toBe('valueMap');
    if (withReturnInput.composition?.kind !== 'valueMap') return;
    expect(withReturnInput.composition.scope).toBe('project');
    expect(withReturnInput.composition.project?.ref.valueTableId).toBe('vt-1');
    expect(withReturnInput.composition.noMatchBehavior).toEqual({ mode: 'return_input' });

    const withFallbackValue = applySmartActionToDraft(draft, 'lookup.valueMap', {
      valueMapScope: 'project',
      valueMapProjectSelection: projectSelection,
      valueMapNoMatchMode: 'fallback_value',
      valueMapFallbackValue: 'UNKNOWN',
    });

    expect(withFallbackValue.composition?.kind).toBe('valueMap');
    if (withFallbackValue.composition?.kind !== 'valueMap') return;
    expect(withFallbackValue.composition.noMatchBehavior).toEqual({
      mode: 'fallback_value',
      fallbackValue: 'UNKNOWN',
    });
    expect(withFallbackValue.expression).toContain('valueTable(');
  });

  it('AE-21: supports value-map explicit lookup input selection with extra tray inputs', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.statusLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'status',
          sourceKind: 'primary' as const,
          label: 'status',
          path: 'status',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'legacyStatus',
          sourceKind: 'primary' as const,
          label: 'legacyStatus',
          path: 'legacyStatus',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'valueMap' as const,
        inputId: 'status',
        scope: 'inline' as const,
        project: null,
        mappings: [{ whenValue: 'A', output: { kind: 'static' as const, value: 'Alpha' } }],
        fallback: { kind: 'static' as const, value: 'UNKNOWN' },
        noMatchBehavior: { mode: 'fallback_value' as const, fallbackValue: 'UNKNOWN' },
      },
    };

    const next = applySmartActionToDraft(draft, 'lookup.valueMap', {
      directInputId: 'legacyStatus',
      valueMapScope: 'inline',
    });

    expect(next.composition?.kind).toBe('valueMap');
    if (next.composition?.kind !== 'valueMap') return;
    expect(next.composition.inputId).toBe('legacyStatus');
    expect(next.composition.mappings).toEqual([
      { whenValue: 'A', output: { kind: 'static', value: 'Alpha' } },
    ]);
    expect(next.expression).toContain('source("legacyStatus")');
    expect(next.expression).not.toContain('source("status")');
  });

  it('keeps project value-map pinning metadata intact when changing explicit lookup input', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.statusLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'status',
          sourceKind: 'primary' as const,
          label: 'status',
          path: 'status',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'alt',
          sourceKind: 'primary' as const,
          label: 'alt',
          path: 'alt',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'valueMap' as const,
        inputId: 'status',
        scope: 'project' as const,
        project: {
          ref: {
            scope: 'project' as const,
            valueTableId: 'vt-1',
            tableKey: 'status_codes',
            revision: 7,
            inputSideKey: 'code',
            outputSideKey: 'label',
          },
          tableName: 'Status Codes',
          tableStatus: 'active' as const,
          currentRevision: 8,
          directionSupport: { aToB: true, bToA: false },
        },
        mappings: [],
        fallback: { kind: 'static' as const, value: 'UNKNOWN' },
        noMatchBehavior: { mode: 'fallback_value' as const, fallbackValue: 'UNKNOWN' },
      },
    };

    const next = applySmartActionToDraft(draft, 'lookup.valueMap', {
      directInputId: 'alt',
      valueMapScope: 'project',
    });

    expect(next.composition?.kind).toBe('valueMap');
    if (next.composition?.kind !== 'valueMap') return;
    expect(next.composition.inputId).toBe('alt');
    expect(next.composition.scope).toBe('project');
    expect(next.composition.project).toEqual(draft.composition.project);
  });

  it('normalizes value-map fallback value by numeric target type', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.statusCode',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'status',
          sourceKind: 'primary' as const,
          label: 'status',
          path: 'status',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'status' },
    };

    const withNumericString = applySmartActionToDraft(draft, 'lookup.valueMap', {
      valueMapScope: 'inline',
      valueMapNoMatchMode: 'fallback_value',
      valueMapFallbackValue: '42',
    });

    expect(withNumericString.composition?.kind).toBe('valueMap');
    if (withNumericString.composition?.kind !== 'valueMap') return;
    expect(withNumericString.composition.noMatchBehavior).toEqual({
      mode: 'fallback_value',
      fallbackValue: 42,
    });
    expect(withNumericString.composition.fallback).toEqual({ kind: 'static', value: 42 });

    const withInvalidNumeric = applySmartActionToDraft(draft, 'lookup.valueMap', {
      valueMapScope: 'inline',
      valueMapNoMatchMode: 'fallback_value',
      valueMapFallbackValue: 'not-a-number',
    });
    expect(withInvalidNumeric.composition?.kind).toBe('valueMap');
    if (withInvalidNumeric.composition?.kind !== 'valueMap') return;
    expect(withInvalidNumeric.composition.noMatchBehavior).toEqual({
      mode: 'fallback_value',
      fallbackValue: 0,
    });
  });

  it('preserves existing inline mappings when re-applying value-map action', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.statusLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'status',
          sourceKind: 'primary' as const,
          label: 'status',
          path: 'status',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'valueMap' as const,
        inputId: 'status',
        scope: 'inline' as const,
        project: null,
        mappings: [{ whenValue: 'A', output: { kind: 'static' as const, value: 'Alpha' } }],
        fallback: { kind: 'static' as const, value: 'UNKNOWN' },
        noMatchBehavior: { mode: 'fallback_value' as const, fallbackValue: 'UNKNOWN' },
      },
    };

    const next = applySmartActionToDraft(draft, 'lookup.valueMap', {
      valueMapScope: 'inline',
    });

    expect(next.composition?.kind).toBe('valueMap');
    if (next.composition?.kind !== 'valueMap') return;
    expect(next.composition.scope).toBe('inline');
    expect(next.composition.project).toBeNull();
    expect(next.composition.mappings).toEqual([
      { whenValue: 'A', output: { kind: 'static', value: 'Alpha' } },
    ]);
    expect(next.expression).toContain('"A": "Alpha"');
  });
});
