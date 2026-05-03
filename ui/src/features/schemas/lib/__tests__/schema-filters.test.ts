import { describe, expect, it } from 'vitest';

import type { SchemaLibraryFilters, SchemaLibraryItem, SchemaLibrarySort } from '../../types';
import { filterSchemas, sortSchemas } from '../schema-filters';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<SchemaLibraryItem>): SchemaLibraryItem {
  return {
    schemaId: 'schema-1',
    name: 'Test Schema',
    description: undefined,
    origin: 'local',
    scope: 'project',
    format: 'json-schema',
    displayFormat: 'JSON Schema',
    fieldCount: 10,
    syncStatus: 'local',
    projectCount: 0,
    projectNames: [],
    updatedAt: '2024-01-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

const EMPTY_FILTERS: SchemaLibraryFilters = {
  search: '',
  origins: [],
  formats: [],
  scopes: [],
};

// ---------------------------------------------------------------------------
// filterSchemas
// ---------------------------------------------------------------------------

describe('filterSchemas', () => {
  describe('search', () => {
    it('matches name case-insensitively', () => {
      const items = [makeItem({ name: 'Customer Schema' }), makeItem({ name: 'Order Schema' })];
      const result = filterSchemas(items, { ...EMPTY_FILTERS, search: 'customer' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Customer Schema');
    });

    it('matches description case-insensitively', () => {
      const items = [
        makeItem({ name: 'Schema A', description: 'Contains invoice data' }),
        makeItem({ name: 'Schema B', description: 'Order details' }),
      ];
      const result = filterSchemas(items, { ...EMPTY_FILTERS, search: 'INVOICE' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Schema A');
    });

    it('empty search returns all items', () => {
      const items = [makeItem({ name: 'A' }), makeItem({ name: 'B' }), makeItem({ name: 'C' })];
      const result = filterSchemas(items, EMPTY_FILTERS);
      expect(result).toHaveLength(3);
    });

    it('trims whitespace before comparing', () => {
      const items = [makeItem({ name: 'Customer' })];
      const result = filterSchemas(items, { ...EMPTY_FILTERS, search: '  customer  ' });
      expect(result).toHaveLength(1);
    });

    it('returns empty array when no match', () => {
      const items = [makeItem({ name: 'Schema A' })];
      const result = filterSchemas(items, { ...EMPTY_FILTERS, search: 'xyz' });
      expect(result).toHaveLength(0);
    });
  });

  describe('origin filter', () => {
    const items = [
      makeItem({ schemaId: '1', origin: 'local' }),
      makeItem({ schemaId: '2', origin: 'published' }),
      makeItem({ schemaId: '3', origin: 'cdm' }),
    ];

    it('single origin filter', () => {
      const result = filterSchemas(items, { ...EMPTY_FILTERS, origins: ['local'] });
      expect(result).toHaveLength(1);
      expect(result[0].schemaId).toBe('1');
    });

    it('multiple origins use OR logic', () => {
      const result = filterSchemas(items, { ...EMPTY_FILTERS, origins: ['local', 'cdm'] });
      expect(result).toHaveLength(2);
      const ids = result.map((r) => r.schemaId);
      expect(ids).toContain('1');
      expect(ids).toContain('3');
    });

    it('empty origins array returns all', () => {
      const result = filterSchemas(items, { ...EMPTY_FILTERS, origins: [] });
      expect(result).toHaveLength(3);
    });
  });

  describe('format filter', () => {
    const items = [
      makeItem({ schemaId: '1', displayFormat: 'JSON Schema' }),
      makeItem({ schemaId: '2', displayFormat: 'XSD' }),
      makeItem({ schemaId: '3', displayFormat: 'Inferred' }),
    ];

    it('filters by single format', () => {
      const result = filterSchemas(items, { ...EMPTY_FILTERS, formats: ['XSD'] });
      expect(result).toHaveLength(1);
      expect(result[0].schemaId).toBe('2');
    });

    it('empty formats array returns all', () => {
      const result = filterSchemas(items, EMPTY_FILTERS);
      expect(result).toHaveLength(3);
    });
  });

  describe('scope filter', () => {
    const items = [
      makeItem({ schemaId: '1', scope: 'global' }),
      makeItem({ schemaId: '2', scope: 'project' }),
    ];

    it('filters by scope', () => {
      const result = filterSchemas(items, { ...EMPTY_FILTERS, scopes: ['global'] });
      expect(result).toHaveLength(1);
      expect(result[0].schemaId).toBe('1');
    });

    it('empty scopes array returns all', () => {
      const result = filterSchemas(items, EMPTY_FILTERS);
      expect(result).toHaveLength(2);
    });
  });

  describe('combined filters (AND between categories)', () => {
    const items = [
      makeItem({ schemaId: '1', name: 'Alpha', origin: 'local', displayFormat: 'JSON Schema', scope: 'global' }),
      makeItem({ schemaId: '2', name: 'Beta', origin: 'published', displayFormat: 'JSON Schema', scope: 'global' }),
      makeItem({ schemaId: '3', name: 'Gamma', origin: 'local', displayFormat: 'XSD', scope: 'project' }),
    ];

    it('applies AND logic across search + origin + format', () => {
      const result = filterSchemas(items, {
        search: 'alpha',
        origins: ['local'],
        formats: ['JSON Schema'],
        scopes: [],
      });
      expect(result).toHaveLength(1);
      expect(result[0].schemaId).toBe('1');
    });

    it('origin + scope combination', () => {
      const result = filterSchemas(items, {
        ...EMPTY_FILTERS,
        origins: ['local'],
        scopes: ['project'],
      });
      expect(result).toHaveLength(1);
      expect(result[0].schemaId).toBe('3');
    });

    it('no match when categories conflict', () => {
      const result = filterSchemas(items, {
        ...EMPTY_FILTERS,
        origins: ['cdm'],
        formats: ['XSD'],
      });
      expect(result).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// sortSchemas
// ---------------------------------------------------------------------------

describe('sortSchemas', () => {
  const asc = (field: SchemaLibrarySort['field']): SchemaLibrarySort => ({ field, direction: 'asc' });
  const desc = (field: SchemaLibrarySort['field']): SchemaLibrarySort => ({ field, direction: 'desc' });

  it('returns empty array when given empty input', () => {
    expect(sortSchemas([], asc('name'))).toEqual([]);
  });

  it('returns single item unchanged', () => {
    const items = [makeItem({ name: 'Only' })];
    expect(sortSchemas(items, asc('name'))).toHaveLength(1);
  });

  it('does not mutate the original array', () => {
    const items = [makeItem({ schemaId: '1', name: 'B' }), makeItem({ schemaId: '2', name: 'A' })];
    const sorted = sortSchemas(items, asc('name'));
    expect(items[0].schemaId).toBe('1'); // original unchanged
    expect(sorted[0].schemaId).toBe('2'); // sorted
  });

  describe('sort by name', () => {
    const items = [
      makeItem({ schemaId: '1', name: 'Zeta' }),
      makeItem({ schemaId: '2', name: 'Alpha' }),
      makeItem({ schemaId: '3', name: 'Mu' }),
    ];

    it('ascending', () => {
      const sorted = sortSchemas(items, asc('name'));
      expect(sorted.map((i) => i.name)).toEqual(['Alpha', 'Mu', 'Zeta']);
    });

    it('descending', () => {
      const sorted = sortSchemas(items, desc('name'));
      expect(sorted.map((i) => i.name)).toEqual(['Zeta', 'Mu', 'Alpha']);
    });
  });

  describe('sort by fieldCount', () => {
    const items = [
      makeItem({ schemaId: '1', fieldCount: 50 }),
      makeItem({ schemaId: '2', fieldCount: 10 }),
      makeItem({ schemaId: '3', fieldCount: 30 }),
    ];

    it('ascending', () => {
      const sorted = sortSchemas(items, asc('fieldCount'));
      expect(sorted.map((i) => i.fieldCount)).toEqual([10, 30, 50]);
    });

    it('descending', () => {
      const sorted = sortSchemas(items, desc('fieldCount'));
      expect(sorted.map((i) => i.fieldCount)).toEqual([50, 30, 10]);
    });
  });

  describe('sort by updatedAt', () => {
    const items = [
      makeItem({ schemaId: '1', updatedAt: '2024-03-01T00:00:00Z' }),
      makeItem({ schemaId: '2', updatedAt: '2024-01-01T00:00:00Z' }),
      makeItem({ schemaId: '3', updatedAt: '2024-06-01T00:00:00Z' }),
    ];

    it('ascending (oldest first)', () => {
      const sorted = sortSchemas(items, asc('updatedAt'));
      expect(sorted.map((i) => i.schemaId)).toEqual(['2', '1', '3']);
    });

    it('descending (newest first)', () => {
      const sorted = sortSchemas(items, desc('updatedAt'));
      expect(sorted.map((i) => i.schemaId)).toEqual(['3', '1', '2']);
    });
  });

  describe('sort by origin', () => {
    const items = [
      makeItem({ schemaId: '1', origin: 'local' }),
      makeItem({ schemaId: '2', origin: 'cdm' }),
      makeItem({ schemaId: '3', origin: 'published' }),
    ];

    it('ascending (cdm=0, published=1, local=2)', () => {
      const sorted = sortSchemas(items, asc('origin'));
      expect(sorted.map((i) => i.origin)).toEqual(['cdm', 'published', 'local']);
    });

    it('descending', () => {
      const sorted = sortSchemas(items, desc('origin'));
      expect(sorted.map((i) => i.origin)).toEqual(['local', 'published', 'cdm']);
    });
  });
});
