import { describe, expect, it } from 'vitest';

import type { SchemaTreeNode } from '@/lib/types';

import {
  addArrayField,
  addField,
  addNestedObject,
  changeType,
  removeField,
  renameField,
  toggleRequired,
  updateDescription,
} from '../schema-editor-ops';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function leaf(
  overrides: Partial<SchemaTreeNode> & { fieldName: string; path: string },
): SchemaTreeNode {
  return {
    type: 'string',
    depth: 0,
    isArray: false,
    isRequired: false,
    parentPath: null,
    childCount: 0,
    children: [],
    ...overrides,
  };
}

const SIMPLE_TREE: SchemaTreeNode[] = [
  leaf({ fieldName: 'name', path: 'name', isRequired: true }),
  leaf({ fieldName: 'age', path: 'age', type: 'number' }),
];

const NESTED_TREE: SchemaTreeNode[] = [
  {
    fieldName: 'address',
    path: 'address',
    type: 'object',
    depth: 0,
    isArray: false,
    isRequired: false,
    parentPath: null,
    childCount: 2,
    children: [
      leaf({ fieldName: 'street', path: 'address.street', depth: 1, parentPath: 'address' }),
      leaf({ fieldName: 'city', path: 'address.city', depth: 1, parentPath: 'address' }),
    ],
  },
];

// ---------------------------------------------------------------------------
// toggleRequired
// ---------------------------------------------------------------------------

describe('toggleRequired', () => {
  it('sets isRequired from false to true', () => {
    const result = toggleRequired(SIMPLE_TREE, 'age');
    expect(result.find((n) => n.path === 'age')?.isRequired).toBe(true);
  });

  it('sets isRequired from true to false', () => {
    const result = toggleRequired(SIMPLE_TREE, 'name');
    expect(result.find((n) => n.path === 'name')?.isRequired).toBe(false);
  });

  it('returns a new array (immutable)', () => {
    const result = toggleRequired(SIMPLE_TREE, 'age');
    expect(result).not.toBe(SIMPLE_TREE);
  });

  it('does not mutate original tree', () => {
    toggleRequired(SIMPLE_TREE, 'age');
    expect(SIMPLE_TREE.find((n) => n.path === 'age')?.isRequired).toBe(false);
  });

  it('works on a nested node', () => {
    const result = toggleRequired(NESTED_TREE, 'address.street');
    const street = result[0].children.find((n) => n.path === 'address.street');
    expect(street?.isRequired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// changeType
// ---------------------------------------------------------------------------

describe('changeType', () => {
  it('changes type on the target node', () => {
    const result = changeType(SIMPLE_TREE, 'age', 'boolean');
    expect(result.find((n) => n.path === 'age')?.type).toBe('boolean');
  });

  it('clears children when changing to a scalar type', () => {
    const result = changeType(NESTED_TREE, 'address', 'string');
    const node = result.find((n) => n.path === 'address')!;
    expect(node.type).toBe('string');
    expect(node.children).toHaveLength(0);
    expect(node.childCount).toBe(0);
    expect(node.isArray).toBe(false);
  });

  it('preserves children when changing between container types', () => {
    const result = changeType(NESTED_TREE, 'address', 'array');
    const node = result.find((n) => n.path === 'address')!;
    expect(node.type).toBe('array');
    expect(node.isArray).toBe(true);
    expect(node.children).toHaveLength(2); // preserved
  });

  it('sets isArray correctly for array type', () => {
    const result = changeType(SIMPLE_TREE, 'name', 'array');
    expect(result.find((n) => n.path === 'name')?.isArray).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// renameField
// ---------------------------------------------------------------------------

describe('renameField', () => {
  it('updates fieldName and path on the renamed node', () => {
    const result = renameField(SIMPLE_TREE, 'age', 'years');
    const node = result.find((n) => n.path === 'years');
    expect(node).toBeDefined();
    expect(node?.fieldName).toBe('years');
    expect(node?.path).toBe('years');
  });

  it('removes old path from result', () => {
    const result = renameField(SIMPLE_TREE, 'age', 'years');
    expect(result.find((n) => n.path === 'age')).toBeUndefined();
  });

  it('updates descendant paths when a parent is renamed', () => {
    const result = renameField(NESTED_TREE, 'address', 'location');
    const parent = result.find((n) => n.path === 'location')!;
    expect(parent.fieldName).toBe('location');
    expect(parent.children[0].path).toBe('location.street');
    expect(parent.children[0].parentPath).toBe('location');
    expect(parent.children[1].path).toBe('location.city');
    expect(parent.children[1].parentPath).toBe('location');
  });

  it('is immutable', () => {
    const original = NESTED_TREE[0].fieldName;
    renameField(NESTED_TREE, 'address', 'location');
    expect(NESTED_TREE[0].fieldName).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// updateDescription
// ---------------------------------------------------------------------------

describe('updateDescription', () => {
  it('sets description on the target node', () => {
    const result = updateDescription(SIMPLE_TREE, 'name', 'The full name');
    expect(result.find((n) => n.path === 'name')?.description).toBe('The full name');
  });

  it('clears description when empty string passed', () => {
    const tree = [{ ...leaf({ fieldName: 'x', path: 'x' }), description: 'old' }];
    const result = updateDescription(tree, 'x', '   ');
    expect(result.find((n) => n.path === 'x')?.description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// addField
// ---------------------------------------------------------------------------

describe('addField', () => {
  it('adds a root-level field when parentPath is null', () => {
    const result = addField(SIMPLE_TREE, null, 'email', 'string');
    const node = result.find((n) => n.path === 'email');
    expect(node).toBeDefined();
    expect(node?.depth).toBe(0);
    expect(node?.parentPath).toBeNull();
    expect(node?.type).toBe('string');
    expect(node?.isRequired).toBe(false);
  });

  it('adds a child to the correct parent', () => {
    const result = addField(NESTED_TREE, 'address', 'zip', 'string');
    const parent = result.find((n) => n.path === 'address')!;
    expect(parent.childCount).toBe(3);
    expect(parent.children.find((c) => c.path === 'address.zip')).toBeDefined();
  });

  it('new field has correct depth and parentPath', () => {
    const result = addField(NESTED_TREE, 'address', 'zip', 'string');
    const zip = result[0].children.find((c) => c.path === 'address.zip')!;
    expect(zip.depth).toBe(1);
    expect(zip.parentPath).toBe('address');
  });

  it('sets isArray=true for array type', () => {
    const result = addField(SIMPLE_TREE, null, 'tags', 'array');
    expect(result.find((n) => n.path === 'tags')?.isArray).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// removeField
// ---------------------------------------------------------------------------

describe('removeField', () => {
  it('removes a root-level node', () => {
    const result = removeField(SIMPLE_TREE, 'age');
    expect(result.find((n) => n.path === 'age')).toBeUndefined();
    expect(result).toHaveLength(1);
  });

  it('removes a nested node and updates parent childCount', () => {
    const result = removeField(NESTED_TREE, 'address.street');
    const parent = result.find((n) => n.path === 'address')!;
    expect(parent.childCount).toBe(1);
    expect(parent.children.find((c) => c.path === 'address.street')).toBeUndefined();
  });

  it('removes a node and all its descendants when a parent is removed', () => {
    const result = removeField(NESTED_TREE, 'address');
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// addNestedObject
// ---------------------------------------------------------------------------

describe('addNestedObject', () => {
  it('inserts an object node with a placeholder child', () => {
    const result = addNestedObject(SIMPLE_TREE, null, 'meta');
    const obj = result.find((n) => n.path === 'meta')!;
    expect(obj.type).toBe('object');
    expect(obj.childCount).toBe(1);
    expect(obj.children[0].fieldName).toBe('newField');
    expect(obj.children[0].type).toBe('string');
    expect(obj.children[0].path).toBe('meta.newField');
  });
});

// ---------------------------------------------------------------------------
// addArrayField
// ---------------------------------------------------------------------------

describe('addArrayField', () => {
  it('inserts an array node', () => {
    const result = addArrayField(SIMPLE_TREE, null, 'tags');
    const arr = result.find((n) => n.path === 'tags')!;
    expect(arr.type).toBe('array');
    expect(arr.isArray).toBe(true);
    expect(arr.childCount).toBe(0);
  });

  it('can be added as a child of an existing object', () => {
    const result = addArrayField(NESTED_TREE, 'address', 'aliases');
    const parent = result.find((n) => n.path === 'address')!;
    const arr = parent.children.find((c) => c.path === 'address.aliases')!;
    expect(arr).toBeDefined();
    expect(arr.type).toBe('array');
  });
});
