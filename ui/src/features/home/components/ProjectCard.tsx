// ProjectCard — Grid card for a single project (FS-014 T-05, FS-049 T-06)

import { StatusBadge } from '@/components/StatusBadge';

import type { ProjectListItem, ProjectWorstStatus } from '../types';

// ---------------------------------------------------------------------------
// Date helper
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  }).format(date);
}

// ---------------------------------------------------------------------------
// Worst-status badge (FS-049 T-06: filled backgrounds for ready/has-errors)
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  ProjectWorstStatus,
  { label: string; dotClass: string; textClass: string; bgClass: string } | null
> = {
  ready: {
    label: 'Ready',
    dotClass: 'bg-green-500',
    textClass: 'text-green-400',
    bgClass: 'bg-green-500/15',
  },
  draft: {
    label: 'Draft',
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-300',
    bgClass: 'bg-slate-800',
  },
  'has-errors': {
    label: 'Has Errors',
    dotClass: 'bg-red-500',
    textClass: 'text-red-400',
    bgClass: 'bg-red-500/15',
  },
  'no-mappings': null, // hidden per spec
};

interface WorstStatusBadgeProps {
  status: ProjectWorstStatus;
}

function WorstStatusBadge({ status }: WorstStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${config.textClass} ${config.bgClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`} aria-hidden="true" />
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ProjectCard
// ---------------------------------------------------------------------------

export interface ProjectCardProps {
  project: ProjectListItem;
  onClick: (id: string) => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const mappingLabel =
    project.mappingCount === 1 ? '1 mapping' : `${project.mappingCount} mappings`;

  const allNotDeployed =
    project.devDeploy === 'not-deployed' &&
    project.qaDeploy === 'not-deployed' &&
    project.prodDeploy === 'not-deployed';

  const hasErrors = project.worstStatus === 'has-errors';

  return (
    <div
      role="article"
      aria-label={project.name}
      onClick={() => onClick(project.projectId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(project.projectId);
        }
      }}
      tabIndex={0}
      className={`flex cursor-pointer flex-col gap-3 rounded-lg border bg-slate-900 p-5 shadow-sm transition-shadow hover:border-blue-500 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
        hasErrors
          ? 'border-l-2 border-l-red-500 border-slate-700'
          : 'border-slate-700'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="truncate text-base font-semibold text-slate-100">{project.name}</h3>
        <WorstStatusBadge status={project.worstStatus} />
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1.5">
        {project.description ? (
          <p className="line-clamp-2 text-sm text-slate-400">{project.description}</p>
        ) : (
          <p className="text-sm italic text-slate-600">No description</p>
        )}
        <span className="text-xs text-slate-500">{mappingLabel}</span>
      </div>

      {/* Footer */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
        {allNotDeployed ? (
          <span className="text-xs text-slate-500" data-testid="deploy-condensed">
            Not deployed
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">DEV</span>
            <StatusBadge status={project.devDeploy} />
            <span className="text-xs text-slate-500">QA</span>
            <StatusBadge status={project.qaDeploy} />
            <span className="text-xs text-slate-500">PROD</span>
            <StatusBadge status={project.prodDeploy} />
          </div>
        )}
        <span className="text-xs text-slate-500">{formatDate(project.updatedAt)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectCardGrid
// ---------------------------------------------------------------------------

export interface ProjectCardGridProps {
  projects: ProjectListItem[];
  onProjectClick: (id: string) => void;
}

export function ProjectCardGrid({ projects, onProjectClick }: ProjectCardGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard
          key={project.projectId}
          project={project}
          onClick={onProjectClick}
        />
      ))}
    </div>
  );
}
