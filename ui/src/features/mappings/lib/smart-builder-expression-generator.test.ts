import { describe, expect, it } from 'vitest';

import { generateSmartBuilderExpression } from './smart-builder-expression-generator';
import type { SmartBuilderDraft } from './smart-builder-state';
import { createEmptySmartBuilderDraft } from './smart-builder-state';

function makeBaseDraft(): SmartBuilderDraft {
  return createEmptySmartBuilderDraft({
    targetPath: 'target.name',
    targetType: 'string',
    isRequired: false,
  });
}

describe('generateSmartBuilderExpression', () => {
  it('generates direct source expression', () => {
    const draft: SmartBuilderDraft = {
      ...makeBaseDraft(),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary',
          label: 'firstName',
          path: 'firstName',
          valueType: 'string',
          transforms: [],
        },
      ],
      composition: { kind: 'direct', inputId: 'a' },
    };

    expect(generateSmartBuilderExpression(draft)).toBe('source("firstName")');
  });

  it('uses insertion order for concat when inputIds are omitted', () => {
    const draft: SmartBuilderDraft = {
      ...makeBaseDraft(),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary',
          label: 'firstName',
          path: 'firstName',
          valueType: 'string',
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary',
          label: 'lastName',
          path: 'lastName',
          valueType: 'string',
          transforms: [],
        },
      ],
      composition: { kind: 'concat' },
    };

    expect(generateSmartBuilderExpression(draft)).toBe(
      'concat(source("firstName"), source("lastName"))',
    );
  });

  it('uses insertion order for coalesce when inputIds are omitted', () => {
    const draft: SmartBuilderDraft = {
      ...makeBaseDraft(),
      inputs: [
        {
          id: 'preferred',
          sourceKind: 'primary',
          label: 'preferredName',
          path: 'preferredName',
          valueType: 'string',
          transforms: [],
        },
        {
          id: 'legal',
          sourceKind: 'primary',
          label: 'legalName',
          path: 'legalName',
          valueType: 'string',
          transforms: [],
        },
      ],
      composition: { kind: 'coalesce' },
    };

    expect(generateSmartBuilderExpression(draft)).toBe(
      'coalesce(source("preferredName"), source("legalName"))',
    );
  });

  it('uses insertion order for math composition by default', () => {
    const draft: SmartBuilderDraft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.total',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary',
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number',
          transforms: [],
        },
        {
          id: 'tax',
          sourceKind: 'primary',
          label: 'tax',
          path: 'tax',
          valueType: 'number',
          transforms: [],
        },
      ],
      composition: { kind: 'math', operator: 'add' },
    };

    expect(generateSmartBuilderExpression(draft)).toBe('add(source("subtotal"), source("tax"))');
  });

  it('generates enrichment root alias as external("alias")', () => {
    const draft: SmartBuilderDraft = {
      ...makeBaseDraft(),
      inputs: [
        {
          id: 'e1',
          sourceKind: 'enrichment',
          label: 'carrier',
          externalName: 'carrier',
          valueType: 'object',
          transforms: [],
        },
      ],
      composition: { kind: 'direct', inputId: 'e1' },
    };

    expect(generateSmartBuilderExpression(draft)).toBe('external("carrier")');
  });

  it('generates enrichment nested field as get(external("alias"), "path")', () => {
    const draft: SmartBuilderDraft = {
      ...makeBaseDraft(),
      inputs: [
        {
          id: 'e1',
          sourceKind: 'enrichment',
          label: 'carrier.rateCode',
          externalName: 'carrier',
          path: 'rateCode',
          valueType: 'string',
          transforms: [],
        },
      ],
      composition: { kind: 'direct', inputId: 'e1' },
    };

    expect(generateSmartBuilderExpression(draft)).toBe('get(external("carrier"), "rateCode")');
  });

  it('compiles isTruthy/isFalsy to valid registered DSL patterns', () => {
    const draft: SmartBuilderDraft = {
      ...makeBaseDraft(),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary',
          label: 'emailA',
          path: 'emailA',
          valueType: 'string',
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition',
        clauses: [{
          predicates: [{
            left: { kind: 'input', inputId: 'a' },
            operator: 'isTruthy',
          }],
          thenOutput: { kind: 'static', value: 'Y' },
        }],
        elseOutput: { kind: 'static', value: 'N' },
      },
    };

    expect(generateSmartBuilderExpression(draft)).toBe(
      'if(not(isNull(source("emailA"))), "Y", "N")',
    );

    const falsyDraft: SmartBuilderDraft = {
      ...draft,
      composition: {
        kind: 'condition',
        clauses: [{
          predicates: [{
            left: { kind: 'input', inputId: 'a' },
            operator: 'isFalsy',
          }],
          thenOutput: { kind: 'static', value: 'N' },
        }],
        elseOutput: { kind: 'static', value: 'Y' },
      },
    };

    expect(generateSmartBuilderExpression(falsyDraft)).toBe(
      'if(isNull(source("emailA")), "N", "Y")',
    );
  });

  it('generates static input as static(...) in direct composition', () => {
    const draft: SmartBuilderDraft = {
      ...makeBaseDraft(),
      inputs: [
        {
          id: 's1',
          sourceKind: 'static',
          label: 'Fixed value',
          staticValue: 'HELLO',
          valueType: 'string',
          transforms: [],
        },
      ],
      composition: { kind: 'direct', inputId: 's1' },
    };

    expect(generateSmartBuilderExpression(draft)).toBe('static("HELLO")');
  });

  it('generates direct constant/item/parent expressions', () => {
    const constantDraft: SmartBuilderDraft = {
      ...makeBaseDraft(),
      inputs: [{
        id: 'c1',
        sourceKind: 'constant',
        label: 'Tax rate',
        constantName: 'TAX_RATE',
        valueType: 'number',
        transforms: [],
      }],
      composition: { kind: 'direct', inputId: 'c1' },
    };
    expect(generateSmartBuilderExpression(constantDraft)).toBe('constant("TAX_RATE")');

    const itemDraft: SmartBuilderDraft = {
      ...makeBaseDraft(),
      inputs: [{
        id: 'i1',
        sourceKind: 'item',
        label: 'line.sku',
        path: 'line.sku',
        valueType: 'string',
        transforms: [],
      }],
      composition: { kind: 'direct', inputId: 'i1' },
    };
    expect(generateSmartBuilderExpression(itemDraft)).toBe('item("line.sku")');

    const parentDraft: SmartBuilderDraft = {
      ...makeBaseDraft(),
      inputs: [{
        id: 'p1',
        sourceKind: 'parent',
        label: 'order.id',
        path: 'order.id',
        valueType: 'string',
        transforms: [],
      }],
      composition: { kind: 'direct', inputId: 'p1' },
    };
    expect(generateSmartBuilderExpression(parentDraft)).toBe('parent("order.id")');
  });

  it('resolves input references in condition then/else outputs', () => {
    const draft: SmartBuilderDraft = {
      ...makeBaseDraft(),
      inputs: [
        {
          id: 'left',
          sourceKind: 'primary',
          label: 'left',
          path: 'left',
          valueType: 'string',
          transforms: [],
        },
        {
          id: 'thenOut',
          sourceKind: 'constant',
          label: 'Match',
          constantName: 'MATCH_FLAG',
          valueType: 'string',
          transforms: [],
        },
        {
          id: 'elseOut',
          sourceKind: 'static',
          label: 'No match',
          staticValue: 'NO_MATCH',
          valueType: 'string',
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition',
        clauses: [{
          predicates: [{
            left: { kind: 'input', inputId: 'left' },
            operator: 'isTruthy',
          }],
          thenOutput: { kind: 'input', inputId: 'thenOut' },
        }],
        elseOutput: { kind: 'input', inputId: 'elseOut' },
      },
    };

    expect(generateSmartBuilderExpression(draft)).toBe(
      'if(not(isNull(source("left"))), constant("MATCH_FLAG"), static("NO_MATCH"))',
    );
  });
});
