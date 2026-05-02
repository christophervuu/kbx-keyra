import { describe, expect, it } from 'vitest';

import { filterProjects, sortProjects } from '../filter-sort';
import type { ProjectListItem } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    projectId: 'p-1',
    name: 'Alpha Project',
    description: 'Order processing system',
    mappingCount: 2,
    updatedAt: '2026-04-01T00:00:00Z',
    worstStatus: 'ready',
    devDeploy: 'not-deployed',
    qaDeploy: 'not-deployed',
    prodDeploy: 'not-deployed',
    ...overrides,
  };
}

const PROJECTS: ProjectListItem[] = [
  makeProject({ projectId: 'p-1', name: 'Alpha', description: 'order system', updatedAt: '2026-04-01T00:00:00Z', mappingCount: 1, worstStatus: 'ready' }),
  makeProject({ projectId: 'p-2', name: 'Beta',  description: 'billing service', updatedAt: '2026-03-01T00:00:00Z', mappingCount: 5, worstStatus: 'draft' }),
  makeProject({ projectId: 'p-3', name: 'Gamma', description: 'customer portal', updatedAt: '2026-05-01T00:00:00Z', mappingCount: 3, worstStatus: 'has-errors' }),
];

// ---------------------------------------------------------------------------
// filterProjects
// ---------------------------------------------------------------------------

describe('filterProjects', () => {
  it('returns all projects when search is empty and status is all', () => {
    expect(filterProjects(PROJECTS, '', 'all')).toHaveLength(3);
  });

  it('filters by name case-insensitively', () => {
    const result = filterProjects(PROJECTS, 'ALPHA', 'all');
    expect(result).toHaveLength(1);
    expect(result[0].projectId).toBe('p-1');
  });

  it('filters by description case-insensitively', () => {
    const result = filterProjects(PROJECTS, 'order', 'all');
    expect(result).toHaveLength(1);
    expect(result[0].projectId).toBe('p-1');
  });

  it('returns empty array when no projects match search', () => {
    expect(filterProjects(PROJECTS, 'zzz-no-match', 'all')).toHaveLength(0);
  });

  it('trims whitespace from search query', () => {
    const result = filterProjects(PROJECTS, '  beta  ', 'all');
    expect(result).toHaveLength(1);
    expect(result[0].projectId).toBe('p-2');
  });

  it('filters by status: ready', () => {
    const result = filterProjects(PROJECTS, '', 'ready');
    expect(result).toHaveLength(1);
    expect(result[0].projectId).toBe('p-1');
  });

  it('filters by status: draft', () => {
    const result = filterProjects(PROJECTS, '', 'draft');
    expect(result).toHaveLength(1);
    expect(result[0].projectId).toBe('p-2');
  });

  it('filters by status: has-errors', () => {
    const result = filterProjects(PROJECTS, '', 'has-errors');
    expect(result).toHaveLength(1);
    expect(result[0].projectId).toBe('p-3');
  });

  it('filters by status: no-mappings returns nothing when none match', () => {
    expect(filterProjects(PROJECTS, '', 'no-mappings')).toHaveLength(0);
  });

  it('combines search and status filter', () => {
    // search matches p-1 and p-2 could match "a" but status restricts to draft
    const result = filterProjects(PROJECTS, 'a', 'draft');
    // "a" matches "Alpha"(p-1) and "Beta"(p-2) and "Gamma"(p-3), but draft = only p-2
    expect(result).toHaveLength(1);
    expect(result[0].projectId).toBe('p-2');
  });

  it('does not mutate input array', () => {
    const copy = [...PROJECTS];
    filterProjects(PROJECTS, 'alpha', 'all');
    expect(PROJECTS).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// sortProjects
// ---------------------------------------------------------------------------

describe('sortProjects', () => {
  it('sorts by name ascending', () => {
    const result = sortProjects(PROJECTS, 'name', 'asc');
    expect(result.map((p) => p.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('sorts by name descending', () => {
    const result = sortProjects(PROJECTS, 'name', 'desc');
    expect(result.map((p) => p.name)).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('sorts by updatedAt ascending (oldest first)', () => {
    const result = sortProjects(PROJECTS, 'updatedAt', 'asc');
    expect(result.map((p) => p.projectId)).toEqual(['p-2', 'p-1', 'p-3']);
  });

  it('sorts by updatedAt descending (newest first)', () => {
    const result = sortProjects(PROJECTS, 'updatedAt', 'desc');
    expect(result.map((p) => p.projectId)).toEqual(['p-3', 'p-1', 'p-2']);
  });

  it('sorts by mappingCount ascending', () => {
    const result = sortProjects(PROJECTS, 'mappingCount', 'asc');
    expect(result.map((p) => p.mappingCount)).toEqual([1, 3, 5]);
  });

  it('sorts by mappingCount descending', () => {
    const result = sortProjects(PROJECTS, 'mappingCount', 'desc');
    expect(result.map((p) => p.mappingCount)).toEqual([5, 3, 1]);
  });

  it('does not mutate input array', () => {
    const copy = [...PROJECTS];
    sortProjects(PROJECTS, 'name', 'asc');
    expect(PROJECTS).toEqual(copy);
  });

  it('handles single-item array', () => {
    const single = [makeProject()];
    expect(sortProjects(single, 'name', 'asc')).toHaveLength(1);
  });

  it('handles empty array', () => {
    expect(sortProjects([], 'name', 'asc')).toEqual([]);
  });
});
