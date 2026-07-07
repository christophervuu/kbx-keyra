import { describe, expect, it } from 'vitest';

import type { SchemaNodeIdentity } from '../../../src/lib/persistence/types.js';
import {
  deleteAndReaddWithNewIdentity,
  deriveSchemaNodeIdentitiesForVersion,
  duplicateSubtreeWithNewIdentities,
  extractSchemaIdentityPointersFromJsonSchema,
  preserveIdentityForMove,
  preserveIdentityForRename,
  restoreIdentitiesFromVersion,
} from '../../../src/lib/schema/identity.js';

function identity(
  schemaVersionId: string,
  fieldId: string,
  jsonPointer: string,
  parentFieldId?: string,
): SchemaNodeIdentity {
  return {
    schemaVersionId,
    fieldId,
    jsonPointer,
    ...(parentFieldId ? { parentFieldId } : {}),
  };
}

describe('schema identity sidecar lifecycle', () => {
  it('extracts canonical JSON Pointer targets from json schema content', () => {
    const pointers = extractSchemaIdentityPointersFromJsonSchema({
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        customer: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    });

    expect(pointers.map((entry) => entry.jsonPointer)).toEqual([
      '',
      '/properties/customer',
      '/properties/orderId',
      '/properties/customer/properties/name',
    ]);
  });

  it('preserves fieldId on rename', () => {
    const before = [
      identity('v1', 'fid-order', '/properties/order'),
      identity('v1', 'fid-id', '/properties/order/properties/id', 'fid-order'),
    ];

    const after = preserveIdentityForRename('v2', before, {
      fromPointer: '/properties/order',
      toPointer: '/properties/purchaseOrder',
    });

    expect(after.find((entry) => entry.jsonPointer === '/properties/purchaseOrder')?.fieldId).toBe('fid-order');
    expect(after.find((entry) => entry.jsonPointer === '/properties/purchaseOrder/properties/id')?.fieldId).toBe('fid-id');
  });

  it('preserves fieldId on move', () => {
    const before = [
      identity('v1', 'fid-root', ''),
      identity('v1', 'fid-contact', '/properties/contact', 'fid-root'),
      identity('v1', 'fid-email', '/properties/contact/properties/email', 'fid-contact'),
      identity('v1', 'fid-account', '/properties/account', 'fid-root'),
    ];

    const after = preserveIdentityForMove('v2', before, {
      fromPointer: '/properties/contact',
      toParentPointer: '/properties/account',
    });

    expect(after.find((entry) => entry.jsonPointer === '/properties/account/contact')?.fieldId).toBe('fid-contact');
    expect(after.find((entry) => entry.jsonPointer === '/properties/account/contact/properties/email')?.fieldId).toBe('fid-email');
  });

  it('duplicate creates new ids for duplicated subtree', () => {
    const before = [
      identity('v1', 'fid-root', ''),
      identity('v1', 'fid-item', '/properties/item', 'fid-root'),
      identity('v1', 'fid-code', '/properties/item/properties/code', 'fid-item'),
    ];

    const after = duplicateSubtreeWithNewIdentities('v2', before, {
      sourcePointer: '/properties/item',
      destinationParentPointer: '',
      destinationName: 'itemCopy',
    });

    const duplicatedRoot = after.find((entry) => entry.jsonPointer === '/itemCopy');
    const duplicatedChild = after.find((entry) => entry.jsonPointer === '/itemCopy/properties/code');

    expect(duplicatedRoot?.fieldId).toBeDefined();
    expect(duplicatedChild?.fieldId).toBeDefined();
    expect(duplicatedRoot?.fieldId).not.toBe('fid-item');
    expect(duplicatedChild?.fieldId).not.toBe('fid-code');
  });

  it('delete and re-add generates new id', () => {
    const before = [
      identity('v1', 'fid-root', ''),
      identity('v1', 'fid-status', '/properties/status', 'fid-root'),
    ];

    const after = deleteAndReaddWithNewIdentity('v2', before, '/properties/status');
    const status = after.find((entry) => entry.jsonPointer === '/properties/status');

    expect(status?.fieldId).toBeDefined();
    expect(status?.fieldId).not.toBe('fid-status');
  });

  it('restore reuses historical ids exactly', () => {
    const historical = [
      identity('v1', 'fid-root', ''),
      identity('v1', 'fid-id', '/properties/id', 'fid-root'),
      identity('v1', 'fid-name', '/properties/name', 'fid-root'),
    ];

    const restored = restoreIdentitiesFromVersion('v3', historical);
    expect(restored.map((entry) => ({ fieldId: entry.fieldId, jsonPointer: entry.jsonPointer }))).toEqual([
      { fieldId: 'fid-root', jsonPointer: '' },
      { fieldId: 'fid-id', jsonPointer: '/properties/id' },
      { fieldId: 'fid-name', jsonPointer: '/properties/name' },
    ]);
  });

  it('derive identities reuses based-on ids for unchanged pointers and creates new ids for new pointers', () => {
    const basedOn = [
      identity('v1', 'fid-root', ''),
      identity('v1', 'fid-id', '/properties/id', 'fid-root'),
    ];

    const derived = deriveSchemaNodeIdentitiesForVersion(
      'v2',
      [
        { jsonPointer: '' },
        { jsonPointer: '/properties/id', parentJsonPointer: '' },
        { jsonPointer: '/properties/newField', parentJsonPointer: '' },
      ],
      basedOn,
    );

    expect(derived.find((entry) => entry.jsonPointer === '/properties/id')?.fieldId).toBe('fid-id');
    expect(derived.find((entry) => entry.jsonPointer === '/properties/newField')?.fieldId).toBeDefined();
    expect(derived.find((entry) => entry.jsonPointer === '/properties/newField')?.fieldId).not.toBe('fid-id');
  });
});
