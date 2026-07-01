import { describe, expect, it } from 'vitest';

import { planAutoMapWorkUnits } from '../../../src/lib/ai/auto-map-work-unit-planner.js';
import type { SchemaNode } from '../../../src/lib/schema/types.js';

const BASE_SCHEMA_NODES: readonly SchemaNode[] = [
  {
    schemaId: 'target-schema',
    path: 'Order',
    fieldName: 'Order',
    type: 'object',
    depth: 0,
    isArray: false,
    isRequired: true,
    childCount: 5,
    subtreeFieldCount: 12,
    embeddingText: 'Order object',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Header',
    fieldName: 'Header',
    type: 'object',
    depth: 1,
    isArray: false,
    isRequired: true,
    parentPath: 'Order',
    childCount: 3,
    subtreeFieldCount: 3,
    embeddingText: 'Order header object',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Header.DocumentType',
    fieldName: 'DocumentType',
    type: 'string',
    depth: 2,
    isArray: false,
    isRequired: true,
    parentPath: 'Order.Header',
    childCount: 0,
    subtreeFieldCount: 0,
    embeddingText: 'Order document type',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Header.Currency',
    fieldName: 'Currency',
    type: 'string',
    depth: 2,
    isArray: false,
    isRequired: true,
    parentPath: 'Order.Header',
    childCount: 0,
    subtreeFieldCount: 0,
    embeddingText: 'Order currency',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Header.CreatedAt',
    fieldName: 'CreatedAt',
    type: 'string',
    depth: 2,
    isArray: false,
    isRequired: false,
    parentPath: 'Order.Header',
    childCount: 0,
    subtreeFieldCount: 0,
    embeddingText: 'Order created timestamp',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Items',
    fieldName: 'Items',
    type: 'array',
    depth: 1,
    isArray: true,
    isRequired: true,
    parentPath: 'Order',
    childCount: 4,
    subtreeFieldCount: 7,
    embeddingText: 'Order items array',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Items.Id',
    fieldName: 'Id',
    type: 'string',
    depth: 2,
    isArray: false,
    isRequired: true,
    parentPath: 'Order.Items',
    childCount: 0,
    subtreeFieldCount: 0,
    embeddingText: 'Order item id',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Items.Quantity',
    fieldName: 'Quantity',
    type: 'number',
    depth: 2,
    isArray: false,
    isRequired: true,
    parentPath: 'Order.Items',
    childCount: 0,
    subtreeFieldCount: 0,
    embeddingText: 'Order item quantity',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Items.Price',
    fieldName: 'Price',
    type: 'number',
    depth: 2,
    isArray: false,
    isRequired: true,
    parentPath: 'Order.Items',
    childCount: 0,
    subtreeFieldCount: 0,
    embeddingText: 'Order item price',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Items.Discounts',
    fieldName: 'Discounts',
    type: 'array',
    depth: 2,
    isArray: true,
    isRequired: false,
    parentPath: 'Order.Items',
    childCount: 2,
    subtreeFieldCount: 2,
    embeddingText: 'Order item discounts array',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Items.Discounts.Type',
    fieldName: 'Type',
    type: 'string',
    depth: 3,
    isArray: false,
    isRequired: true,
    parentPath: 'Order.Items.Discounts',
    childCount: 0,
    subtreeFieldCount: 0,
    embeddingText: 'Order item discount type',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Items.Discounts.Amount',
    fieldName: 'Amount',
    type: 'number',
    depth: 3,
    isArray: false,
    isRequired: true,
    parentPath: 'Order.Items.Discounts',
    childCount: 0,
    subtreeFieldCount: 0,
    embeddingText: 'Order item discount amount',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Total',
    fieldName: 'Total',
    type: 'number',
    depth: 1,
    isArray: false,
    isRequired: true,
    parentPath: 'Order',
    childCount: 0,
    subtreeFieldCount: 0,
    embeddingText: 'Order total amount',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Shipments',
    fieldName: 'Shipments',
    type: 'array',
    depth: 1,
    isArray: true,
    isRequired: false,
    parentPath: 'Order',
    childCount: 2,
    subtreeFieldCount: 2,
    embeddingText: 'Order shipments array',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Shipments.Id',
    fieldName: 'Id',
    type: 'string',
    depth: 2,
    isArray: false,
    isRequired: true,
    parentPath: 'Order.Shipments',
    childCount: 0,
    subtreeFieldCount: 0,
    embeddingText: 'Shipment id',
  },
  {
    schemaId: 'target-schema',
    path: 'Order.Shipments.Carrier',
    fieldName: 'Carrier',
    type: 'string',
    depth: 2,
    isArray: false,
    isRequired: false,
    parentPath: 'Order.Shipments',
    childCount: 0,
    subtreeFieldCount: 0,
    embeddingText: 'Shipment carrier',
  },
];

describe('auto-map structural work-unit planner', () => {
  it('never emits orphaned array-child-only groups', () => {
    const plan = planAutoMapWorkUnits({
      targetSchemaNodes: BASE_SCHEMA_NODES,
      scope: {
        mode: 'selected',
        targetPaths: ['Order.Items.Id', 'Order.Items.Quantity'],
      },
      maxTargetsPerUnit: 10,
    });

    expect(plan.workUnits).toHaveLength(1);
    const unit = plan.workUnits[0];
    expect(unit?.rootPath).toBe('Order.Items');
    expect(unit?.targetPaths).toEqual(['Order.Items.Id', 'Order.Items.Quantity']);
    expect(unit?.contextPaths).toEqual(['Order.Items']);
  });

  it('produces deterministic stable ordering and IDs for repeated input', () => {
    const input = {
      targetSchemaNodes: BASE_SCHEMA_NODES,
      scope: {
        mode: 'whole' as const,
      },
      maxTargetsPerUnit: 4,
    };

    const first = planAutoMapWorkUnits(input);
    const second = planAutoMapWorkUnits(input);

    expect(second).toEqual(first);
    expect(first.workUnits.map((unit) => unit.workUnitOrder)).toEqual(
      first.workUnits.map((_, index) => index),
    );
  });

  it('splits oversized groups deterministically while preserving array parent context', () => {
    const plan = planAutoMapWorkUnits({
      targetSchemaNodes: BASE_SCHEMA_NODES,
      scope: {
        mode: 'selected',
        targetPaths: ['Order.Items', 'Order.Items.Id', 'Order.Items.Quantity', 'Order.Items.Price'],
      },
      maxTargetsPerUnit: 2,
    });

    expect(plan.workUnits).toHaveLength(3);
    for (const unit of plan.workUnits) {
      expect(unit.rootPath).toBe('Order.Items');
      expect(unit.targetPaths[0]).toBe('Order.Items');
      expect(unit.contextPaths).toEqual([]);
    }

    expect(plan.workUnits.map((unit) => unit.split)).toEqual([
      { index: 0, total: 3 },
      { index: 1, total: 3 },
      { index: 2, total: 3 },
    ]);
  });

  it('enforces in-scope-only planning for section mode', () => {
    const plan = planAutoMapWorkUnits({
      targetSchemaNodes: BASE_SCHEMA_NODES,
      scope: {
        mode: 'section',
        sectionPath: 'Order.Header',
      },
      maxTargetsPerUnit: 10,
    });

    expect(plan.normalizedTargetPaths).toEqual([
      'Order.Header.CreatedAt',
      'Order.Header.Currency',
      'Order.Header.DocumentType',
    ]);
    expect(plan.workUnits).toHaveLength(1);
    expect(plan.workUnits[0]?.targetPaths).toEqual([
      'Order.Header.CreatedAt',
      'Order.Header.Currency',
      'Order.Header.DocumentType',
    ]);
  });

  it('normalizes explicit target paths for visible/selected/refresh/retry-failed modes', () => {
    const modes = ['visible', 'selected', 'refresh', 'retry-failed'] as const;

    for (const mode of modes) {
      const plan = planAutoMapWorkUnits({
        targetSchemaNodes: BASE_SCHEMA_NODES,
        scope: {
          mode,
          targetPaths: [
            'Order.Items.Quantity',
            'Order.Items.Quantity',
            'Order.Header.Currency',
            'Order.Unknown.Path',
            '  Order.Total ',
          ],
        },
      });

      expect(plan.normalizedTargetPaths).toEqual([
        'Order.Header.Currency',
        'Order.Items.Quantity',
        'Order.Total',
      ]);

      const allTargets = plan.workUnits.flatMap((unit) => unit.targetPaths);
      expect(new Set(allTargets)).toEqual(new Set(plan.normalizedTargetPaths));
      expect(allTargets).not.toContain('Order.Unknown.Path');
    }
  });
});
