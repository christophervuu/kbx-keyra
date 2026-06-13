import { describe, expect, it } from 'vitest';

import { computeSchemaDiff } from '../../../../src/lib/schema/diff/diff-summary.js';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

interface NodeInput {
  path: string;
  type: string;
  isArray: boolean;
  depth: number;
}

function n(path: string, type = 'string', isArray = false, depth = 1): NodeInput {
  return { path, type, isArray, depth };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeSchemaDiff', () => {
  it('returns empty diff when both sets are empty', () => {
    const result = computeSchemaDiff([], []);
    expect(result).toEqual({ added: [], removed: [], modified: [] });
  });

  it('all fields reported as added when prior is empty', () => {
    const current = [n('id'), n('name'), n('email')];
    const result = computeSchemaDiff([], current);
    expect(result).toEqual({
      added: ['email', 'id', 'name'],
      removed: [],
      modified: [],
    });
  });

  it('all fields reported as removed when current is empty', () => {
    const prior = [n('id'), n('name')];
    const result = computeSchemaDiff(prior, []);
    expect(result).toEqual({
      added: [],
      removed: ['id', 'name'],
      modified: [],
    });
  });

  it('classifies unchanged fields correctly', () => {
    const prior = [n('id'), n('name')];
    const current = [n('id'), n('name')];
    const result = computeSchemaDiff(prior, current);
    expect(result).toEqual({
      added: [],
      removed: [],
      modified: [],
    });
  });

  it('detects added fields', () => {
    const prior = [n('id')];
    const current = [n('id'), n('name'), n('email')];
    const result = computeSchemaDiff(prior, current);
    expect(result).toEqual({
      added: ['email', 'name'],
      removed: [],
      modified: [],
    });
  });

  it('detects removed fields', () => {
    const prior = [n('id'), n('name'), n('email')];
    const current = [n('id')];
    const result = computeSchemaDiff(prior, current);
    expect(result).toEqual({
      added: [],
      removed: ['email', 'name'],
      modified: [],
    });
  });

  it('detects modified fields via type change', () => {
    const prior = [n('id'), n('name', 'string')];
    const current = [n('id'), n('name', 'integer')]; // type changed
    const result = computeSchemaDiff(prior, current);
    expect(result).toEqual({
      added: [],
      removed: [],
      modified: ['name'],
    });
  });

  it('detects modified fields via isArray change', () => {
    const prior = [n('tags', 'string', false)];
    const current = [n('tags', 'string', true)]; // array changed
    const result = computeSchemaDiff(prior, current);
    expect(result).toEqual({
      added: [],
      removed: [],
      modified: ['tags'],
    });
  });

  it('detects modified fields via depth change', () => {
    const prior = [n('nested.field', 'string', false, 2)];
    const current = [n('nested.field', 'string', false, 3)]; // depth changed
    const result = computeSchemaDiff(prior, current);
    expect(result).toEqual({
      added: [],
      removed: [],
      modified: ['nested.field'],
    });
  });

  it('handles mixed added, removed, and modified', () => {
    const prior = [
      n('id'),
      n('name', 'string'),
      n('email'),
      n ('deprecatedField'),
    ];
    const current = [
      n('id'),
      n('name', 'object'),    // modified (type change)
      n('email'),
      n('newField'),           // added
    ];
    const result = computeSchemaDiff(prior, current);
    expect(result).toEqual({
      added: ['newField'],
      removed: ['deprecatedField'],
      modified: ['name'],
    });
  });

  it('output is deterministically sorted regardless of input order', () => {
    const prior = [n('z'), n('a'), n('m')];
    const current = [n('a'), n('z'), n('m'), n('b')];
    const result = computeSchemaDiff(prior, current);
    expect(result.added).toEqual(['b']);
    expect(result.removed).toEqual([]);
    expect(result.modified).toEqual([]);
    // verify deterministic
    const result2 = computeSchemaDiff(prior, current);
    expect(result2).toEqual(result);
  });

  it('unchanged fields with identical fingerprint are not reported', () => {
    const prior = [n('id', 'string', false, 1), n('name', 'string', false, 1)];
    const same = prior.map((p) => ({ ...p }));
    const result = computeSchemaDiff(prior, same);
    expect(result).toEqual({ added: [], removed: [], modified: [] });
  });

  it('handles large number of fields deterministically', () => {
    const prior: NodeInput[] = [];
    for (let i = 0; i < 1000; i++) {
      prior.push(n(`field${String(i).padStart(4, '0')}`, 'string', false, 1));
    }

    const current: NodeInput[] = [];
    // Remove fields 0900-0999 (100 removed), add fields 1000-1099 (100 added), modify fields 0000-0049 (50 modified)
    for (let i = 0; i < 900; i++) {
      if (i < 50) {
        current.push(n(`field${String(i).padStart(4, '0')}`, 'integer', false, 1)); // modified
      } else {
        current.push(n(`field${String(i).padStart(4, '0')}`, 'string', false, 1)); // unchanged
      }
    }
    for (let i = 1000; i < 1100; i++) {
      current.push(n(`field${String(i).padStart(4, '0')}`, 'string', false, 1)); // added
    }

    const result = computeSchemaDiff(prior, current);

    expect(result.added).toHaveLength(100);
    expect(result.added[0]).toBe('field1000');
    expect(result.added[99]).toBe('field1099');
    expect(result.removed).toHaveLength(100);
    expect(result.removed[0]).toBe('field0900');
    expect(result.removed[99]).toBe('field0999');
    expect(result.modified).toHaveLength(50);
    expect(result.modified[0]).toBe('field0000');
    expect(result.modified[49]).toBe('field0049');
  });

  it('mutually exclusive changes do not cross-contaminate', () => {
    // Prior and current share NO common paths
    const prior = [n('a'), n('b'), n('c')];
    const current = [n('x'), n('y'), n('z')];
    const result = computeSchemaDiff(prior, current);
    expect(result.added).toEqual(['x', 'y', 'z']);
    expect(result.removed).toEqual(['a', 'b', 'c']);
    expect(result.modified).toEqual([]);
  });
});
