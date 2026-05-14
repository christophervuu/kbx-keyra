import { describe, expect, it } from 'vitest';

import { resolveBuilderTargetPath } from './MappingEditor';

import type { SchemaTreeNode } from '@/lib/types/domain';

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
