// Pure filter and sort utilities for the Schema Library (FS-016 T-01).
// These functions are side-effect free and independently unit testable.

import type {
  FilterDataFormat,
  SchemaLibraryFilters,
  SchemaLibraryItem,
  SchemaLibrarySort,
} from '../types';

// ---------------------------------------------------------------------------
// filterSchemas
// ---------------------------------------------------------------------------

/**
 * Filters a list of SchemaLibraryItems based on search, ownership, data format, and status criteria.
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
  const {
    search,
    ownerships,
    dataFormats,
    statuses,
    lifecycles = [],
  } = filters;
  const term = search.trim().toLowerCase();

  return items.filter((item) => {
    // Search filter
    if (term.length > 0) {
      const nameMatch = item.name.toLowerCase().includes(term);
      const descMatch = item.description != null && item.description.toLowerCase().includes(term);
      if (!nameMatch && !descMatch) return false;
    }

    // Ownership filter (OR within, skip if empty)
    if (ownerships.length > 0 && !ownerships.includes(item.ownership)) return false;

    // Data format filter (OR within, skip if empty)
    if (dataFormats.length > 0 && !dataFormats.includes(item.dataFormat)) return false;

    // Status filter (OR within, skip if empty)
    if (statuses.length > 0 && !statuses.includes(item.status)) return false;

    // Lifecycle filter (OR within, skip if empty)
    if (lifecycles.length > 0 && !lifecycles.includes(item.lifecycle)) return false;

    return true;
  });
}

// ---------------------------------------------------------------------------
// sortSchemas
// ---------------------------------------------------------------------------

const OWNERSHIP_ORDER: Record<SchemaLibraryItem['ownership'], number> = {
  cdm: 0,
  user: 1,
};

const STATUS_ORDER: Record<SchemaLibraryItem['status'], number> = {
  ready: 0,
  needs_review: 1,
  processing: 2,
  error: 3,
};

const FORMAT_ORDER: Record<FilterDataFormat, number> = {
  JSON: 0,
  XML: 1,
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
      case 'projectCount':
        cmp = a.projectCount - b.projectCount;
        break;
      case 'dataFormat': {
        const aOrder = FORMAT_ORDER[a.dataFormat] ?? 99;
        const bOrder = FORMAT_ORDER[b.dataFormat] ?? 99;
        cmp = aOrder - bOrder;
        break;
      }
      case 'status': {
        const aOrder = STATUS_ORDER[a.status] ?? 99;
        const bOrder = STATUS_ORDER[b.status] ?? 99;
        cmp = aOrder - bOrder;
        break;
      }
      case 'updatedAt':
        cmp = a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
        break;
      case 'ownership': {
        const aOrder = OWNERSHIP_ORDER[a.ownership] ?? 99;
        const bOrder = OWNERSHIP_ORDER[b.ownership] ?? 99;
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
