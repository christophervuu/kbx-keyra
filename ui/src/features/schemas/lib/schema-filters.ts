// Pure filter and sort utilities for the Schema Library (FS-016 T-01).
// These functions are side-effect free and independently unit testable.

import type { SchemaOrigin } from '@/lib/types';

import type {
  DisplayFormat,
  SchemaLibraryFilters,
  SchemaLibraryItem,
  SchemaLibrarySort,
} from '../types';

// ---------------------------------------------------------------------------
// filterSchemas
// ---------------------------------------------------------------------------

/**
 * Filters a list of SchemaLibraryItems based on search, origin, format and scope criteria.
 *
 * Logic:
 *  - Within each category: OR  (any match = pass for that category)
 *  - Between categories:   AND (must pass every active category)
 *  - Empty array for a category = all items pass that category
 *  - Search matches case-insensitively on `name` or `description`
 */
export function filterSchemas(
  items: SchemaLibraryItem[],
  filters: SchemaLibraryFilters,
): SchemaLibraryItem[] {
  const { search, origins, formats, scopes } = filters;
  const term = search.trim().toLowerCase();

  return items.filter((item) => {
    // Search filter
    if (term.length > 0) {
      const nameMatch = item.name.toLowerCase().includes(term);
      const descMatch = item.description != null && item.description.toLowerCase().includes(term);
      if (!nameMatch && !descMatch) return false;
    }

    // Origin filter (OR within, skip if empty)
    if (origins.length > 0 && !origins.includes(item.origin)) return false;

    // Format filter (OR within, skip if empty)
    if (formats.length > 0 && !formats.includes(item.displayFormat)) return false;

    // Scope filter (OR within, skip if empty)
    if (scopes.length > 0 && !scopes.includes(item.scope)) return false;

    return true;
  });
}

// ---------------------------------------------------------------------------
// sortSchemas
// ---------------------------------------------------------------------------

const ORIGIN_ORDER: Record<SchemaOrigin, number> = {
  cdm: 0,
  published: 1,
  local: 2,
};

const FORMAT_ORDER: Record<DisplayFormat, number> = {
  'JSON Schema': 0,
  XSD: 1,
  Inferred: 2,
};

/**
 * Returns a new sorted array of SchemaLibraryItems. Does not mutate the input.
 */
export function sortSchemas(
  items: SchemaLibraryItem[],
  sort: SchemaLibrarySort,
): SchemaLibraryItem[] {
  const { field, direction } = sort;
  const multiplier = direction === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    let cmp = 0;

    switch (field) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'fieldCount':
        cmp = a.fieldCount - b.fieldCount;
        break;
      case 'updatedAt':
        cmp = a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
        break;
      case 'origin': {
        const aOrder = ORIGIN_ORDER[a.origin] ?? 99;
        const bOrder = ORIGIN_ORDER[b.origin] ?? 99;
        cmp = aOrder - bOrder;
        break;
      }
      default:
        cmp = 0;
    }

    return cmp * multiplier;
  });
}

// Re-export format order for use in UI display if needed
export { FORMAT_ORDER };
