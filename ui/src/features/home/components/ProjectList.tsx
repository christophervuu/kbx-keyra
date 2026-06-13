// ProjectList — Projects panel with search + grid/list toggle (FS-084 T-02)

import { useMemo, useState } from 'react';

import { filterProjects } from '../lib/filter-sort';
import { useViewMode } from '../hooks/use-view-mode';
import type { ProjectListItem } from '../types';
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
  const { viewMode, setViewMode } = useViewMode();

  const displayed = useMemo(
    () => filterProjects(projects, search, 'all'),
    [projects, search],
  );

  const isFiltered = displayed.length < projects.length;

  return (
    <section
      className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"
      aria-label="Projects panel"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-100">Projects</h2>
        <ViewToggle viewMode={viewMode} onChange={setViewMode} />
      </div>

      <div className="relative mb-3">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
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
          placeholder="Search projects…"
          aria-label="Search projects"
          className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {isFiltered && (
        <p className="text-sm text-slate-400" aria-live="polite">
          Showing {displayed.length} of {projects.length} projects
        </p>
      )}

      {displayed.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500" data-testid="projects-empty-state">
          No projects match your search or filter.
        </p>
      ) : viewMode === 'grid' ? (
        <ProjectCardGrid projects={displayed} onProjectClick={onProjectClick} />
      ) : (
        <ProjectTable projects={displayed} onProjectClick={onProjectClick} />
      )}
    </section>
  );
}
