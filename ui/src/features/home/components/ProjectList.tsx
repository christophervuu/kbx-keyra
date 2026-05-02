// ProjectList — Search, sort, filter, and view-mode container (FS-014 T-04)
// View mode delegated to useViewMode + ViewToggle (FS-014 T-07)

import { useCallback, useState } from 'react';

import { filterProjects, sortProjects } from '../lib/filter-sort';
import { useViewMode } from '../hooks/use-view-mode';
import type { ProjectListItem, SortDirection, SortField, StatusFilter } from '../types';
import { ProjectCardGrid } from './ProjectCard';
import { ProjectTable } from './ProjectTable';
import { ViewToggle } from './ViewToggle';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProjectListProps {
  projects: ProjectListItem[];
  onProjectClick: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectList({ projects, onProjectClick }: ProjectListProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const { viewMode, setViewMode } = useViewMode();

  const toggleSortDir = useCallback(() => {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
  }, []);

  // Apply filter then sort
  const filtered = filterProjects(projects, search, statusFilter);
  const displayed = sortProjects(filtered, sortField, sortDir);
  const isFiltered = displayed.length < projects.length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            aria-label="Search projects"
            className="w-full rounded-md border border-slate-700 bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Sort field */}
        <select
          value={sortField}
          onChange={(e) => setSortField(e.target.value as SortField)}
          aria-label="Sort by"
          className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="name">Name</option>
          <option value="updatedAt">Last Modified</option>
          <option value="mappingCount">Mapping Count</option>
        </select>

        {/* Sort direction */}
        <button
          type="button"
          onClick={toggleSortDir}
          aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
          className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 hover:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="Filter by status"
          className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All</option>
          <option value="ready">Ready</option>
          <option value="draft">Draft</option>
          <option value="has-errors">Has Errors</option>
          <option value="no-mappings">No Mappings</option>
        </select>

        {/* View mode toggle */}
        <ViewToggle viewMode={viewMode} onChange={setViewMode} />
      </div>

      {/* Count indicator */}
      {isFiltered && (
        <p className="text-sm text-slate-400" aria-live="polite">
          Showing {displayed.length} of {projects.length} projects
        </p>
      )}

      {/* List or empty state */}
      {displayed.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">
          No projects match your search or filter.
        </p>
      ) : viewMode === 'grid' ? (
        <ProjectCardGrid projects={displayed} onProjectClick={onProjectClick} />
      ) : (
        <ProjectTable projects={displayed} onProjectClick={onProjectClick} />
      )}
    </div>
  );
}
