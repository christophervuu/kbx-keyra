import { describe, expect, it } from 'vitest';

import { computeSchemaIdentityDiff } from '../../../../src/lib/schema/diff/identity-diff.js';
import type { SchemaNodeIdentity } from '../../../../src/lib/persistence/types.js';

function identity(fieldId: string, jsonPointer: string): SchemaNodeIdentity {
  return {
    schemaVersionId: 'version-1',
    fieldId,
    jsonPointer,
  };
}

describe('computeSchemaIdentityDiff', () => {
  it('classifies rename when same parent, different name', () => {
    const prior = [identity('fid-1', '/properties/orderId')];
    const current = [identity('fid-1', '/properties/purchaseOrderId')];

    const diff = computeSchemaIdentityDiff(prior, current);

    expect(diff.renamed).toEqual([
      {
        fieldId: 'fid-1',
        fromJsonPointer: '/properties/orderId',
        toJsonPointer: '/properties/purchaseOrderId',
      },
    ]);
    expect(diff.moved).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('classifies move when parent changes', () => {
    const prior = [identity('fid-1', '/properties/customer/properties/email')];
    const current = [identity('fid-1', '/properties/contact/properties/email')];

    const diff = computeSchemaIdentityDiff(prior, current);

    expect(diff.moved).toEqual([
      {
        fieldId: 'fid-1',
        fromJsonPointer: '/properties/customer/properties/email',
        toJsonPointer: '/properties/contact/properties/email',
      },
    ]);
    expect(diff.renamed).toEqual([]);
  });

  it('treats duplicate/delete-readd as add/remove due to new field ids', () => {
    const prior = [identity('fid-old', '/properties/status')];
    const current = [identity('fid-new', '/properties/status')];

    const diff = computeSchemaIdentityDiff(prior, current);
    expect(diff.added).toEqual(['/properties/status']);
    expect(diff.removed).toEqual(['/properties/status']);
    expect(diff.renamed).toEqual([]);
    expect(diff.moved).toEqual([]);
  });
});
