// filter-sort.ts — Pure filter and sort functions for the dashboard project list (FS-014 T-04)

import type { ProjectListItem, SortDirection, SortField, StatusFilter } from '../types';

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

/**
 * Filter projects by search query and status.
 * Search is case-insensitive substring match on name or description.
 * Status 'all' passes every project through.
 */
export function filterProjects(
  projects: ProjectListItem[],
  search: string,
  statusFilter: StatusFilter,
): ProjectListItem[] {
  const needle = search.trim().toLowerCase();

  return projects.filter((p) => {
    // Search filter
    if (needle.length > 0) {
      const inName = p.name.toLowerCase().includes(needle);
      const inDesc = p.description.toLowerCase().includes(needle);
      if (!inName && !inDesc) return false;
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (p.worstStatus !== statusFilter) return false;
    }

    return true;
  });
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

/**
 * Sort projects by the given field and direction.
 * Returns a new array — does not mutate the input.
 */
export function sortProjects(
  projects: ProjectListItem[],
  sortField: SortField,
  sortDir: SortDirection,
): ProjectListItem[] {
  const sorted = [...projects].sort((a, b) => {
    let cmp = 0;

    switch (sortField) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'updatedAt':
        // ISO 8601 strings compare lexicographically correctly
        cmp = a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
        break;
      case 'mappingCount':
        cmp = a.mappingCount - b.mappingCount;
        break;
    }

    return sortDir === 'asc' ? cmp : -cmp;
  });

  return sorted;
}
