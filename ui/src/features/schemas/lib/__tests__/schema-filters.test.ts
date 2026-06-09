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
    origin: 'uploaded',
    ownership: 'user',
    dataFormat: 'JSON',
    status: 'ready',
    format: 'json-schema',
    displayFormat: 'JSON',
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
  ownerships: [],
  dataFormats: [],
  statuses: [],
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

  describe('ownership filter', () => {
    const items = [
      makeItem({ schemaId: '1', ownership: 'user' }),
      makeItem({ schemaId: '2', ownership: 'user' }),
      makeItem({ schemaId: '3', ownership: 'cdm' }),
    ];

    it('single ownership filter', () => {
      const result = filterSchemas(items, { ...EMPTY_FILTERS, ownerships: ['cdm'] });
      expect(result).toHaveLength(1);
      expect(result[0].schemaId).toBe('3');
    });

    it('multiple ownership values use OR logic', () => {
      const result = filterSchemas(items, { ...EMPTY_FILTERS, ownerships: ['user', 'cdm'] });
      expect(result).toHaveLength(3);
    });

    it('empty ownerships array returns all', () => {
      const result = filterSchemas(items, { ...EMPTY_FILTERS, ownerships: [] });
      expect(result).toHaveLength(3);
    });
  });

  describe('data format filter', () => {
    const items = [
      makeItem({ schemaId: '1', dataFormat: 'JSON' }),
      makeItem({ schemaId: '2', dataFormat: 'XML' }),
      makeItem({ schemaId: '3', dataFormat: 'JSON' }),
    ];

    it('filters by single format', () => {
      const result = filterSchemas(items, { ...EMPTY_FILTERS, dataFormats: ['XML'] });
      expect(result).toHaveLength(1);
      expect(result[0].schemaId).toBe('2');
    });

    it('empty formats array returns all', () => {
      const result = filterSchemas(items, EMPTY_FILTERS);
      expect(result).toHaveLength(3);
    });
  });

  describe('status filter', () => {
    const items = [
      makeItem({ schemaId: '1', status: 'ready' }),
      makeItem({ schemaId: '2', status: 'processing' }),
      makeItem({ schemaId: '3', status: 'needs_review' }),
    ];

    it('filters by status values', () => {
      const result = filterSchemas(items, { ...EMPTY_FILTERS, statuses: ['needs_review'] });
      expect(result).toHaveLength(1);
      expect(result[0].schemaId).toBe('3');
    });
  });

  describe('combined filters (AND between categories)', () => {
    const items = [
      makeItem({ schemaId: '1', name: 'Alpha', ownership: 'user', dataFormat: 'JSON', status: 'ready' }),
      makeItem({ schemaId: '2', name: 'Beta', ownership: 'cdm', dataFormat: 'JSON', status: 'processing' }),
      makeItem({ schemaId: '3', name: 'Gamma', ownership: 'user', dataFormat: 'XML', status: 'error' }),
    ];

    it('applies AND logic across search + ownership + format + status', () => {
      const result = filterSchemas(items, {
        search: 'alpha',
        ownerships: ['user'],
        dataFormats: ['JSON'],
        statuses: ['ready'],
      });
      expect(result).toHaveLength(1);
      expect(result[0].schemaId).toBe('1');
    });

    it('ownership + format combination', () => {
      const result = filterSchemas(items, {
        ...EMPTY_FILTERS,
        ownerships: ['user'],
        dataFormats: ['XML'],
      });
      expect(result).toHaveLength(1);
      expect(result[0].schemaId).toBe('3');
    });

    it('no match when categories conflict', () => {
      const result = filterSchemas(items, {
        ...EMPTY_FILTERS,
        ownerships: ['cdm'],
        dataFormats: ['XML'],
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

  describe('sort by projectCount', () => {
    const items = [
      makeItem({ schemaId: '1', projectCount: 5 }),
      makeItem({ schemaId: '2', projectCount: 1 }),
      makeItem({ schemaId: '3', projectCount: 3 }),
    ];

    it('ascending', () => {
      const sorted = sortSchemas(items, asc('projectCount'));
      expect(sorted.map((i) => i.projectCount)).toEqual([1, 3, 5]);
    });

    it('descending', () => {
      const sorted = sortSchemas(items, desc('projectCount'));
      expect(sorted.map((i) => i.projectCount)).toEqual([5, 3, 1]);
    });
  });

  describe('sort by dataFormat', () => {
    const items = [
      makeItem({ schemaId: '1', dataFormat: 'XML' }),
      makeItem({ schemaId: '2', dataFormat: 'JSON' }),
    ];

    it('ascending (JSON then XML)', () => {
      const sorted = sortSchemas(items, asc('dataFormat'));
      expect(sorted.map((i) => i.dataFormat)).toEqual(['JSON', 'XML']);
    });
  });

  describe('sort by status', () => {
    const items = [
      makeItem({ schemaId: '1', status: 'processing' }),
      makeItem({ schemaId: '2', status: 'ready' }),
      makeItem({ schemaId: '3', status: 'error' }),
      makeItem({ schemaId: '4', status: 'needs_review' }),
    ];

    it('ascending (ready, needs_review, processing, error)', () => {
      const sorted = sortSchemas(items, asc('status'));
      expect(sorted.map((i) => i.status)).toEqual(['ready', 'needs_review', 'processing', 'error']);
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

  describe('sort by ownership', () => {
    const items = [
      makeItem({ schemaId: '1', ownership: 'user' }),
      makeItem({ schemaId: '2', ownership: 'cdm' }),
      makeItem({ schemaId: '3', ownership: 'user' }),
    ];

    it('ascending (cdm before user)', () => {
      const sorted = sortSchemas(items, asc('ownership'));
      expect(sorted.map((i) => i.ownership)).toEqual(['cdm', 'user', 'user']);
    });

    it('descending', () => {
      const sorted = sortSchemas(items, desc('ownership'));
      expect(sorted.map((i) => i.ownership)).toEqual(['user', 'user', 'cdm']);
    });
  });
});
