// ProjectTable — Semantic table view for the project list (FS-014 T-06, FS-049 T-06)
// FS-049 T-06: condensed deploy columns when all environments are 'not-deployed'

import { StatusBadge } from '@/components/StatusBadge';

import type { ProjectListItem, ProjectWorstStatus } from '../types';

// ---------------------------------------------------------------------------
// Date helper (shared logic with ProjectCard)
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
// Worst-status badge (inline — mirrors ProjectCard's WorstStatusBadge)
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  ProjectWorstStatus,
  { label: string; dotClass: string; textClass: string; bgClass: string } | null
> = {
  ready: { label: 'Ready', dotClass: 'bg-green-500', textClass: 'text-green-400', bgClass: 'bg-green-500/15' },
  draft: { label: 'Draft', dotClass: 'bg-slate-400', textClass: 'text-slate-300', bgClass: 'bg-slate-800' },
  'has-errors': { label: 'Has Errors', dotClass: 'bg-red-500', textClass: 'text-red-400', bgClass: 'bg-red-500/15' },
  'no-mappings': null,
};

interface WorstStatusBadgeProps {
  status: ProjectWorstStatus;
}

function WorstStatusBadge({ status }: WorstStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  if (!config) {
    return <span className="text-xs text-slate-500">—</span>;
  }

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
// ProjectTable
// ---------------------------------------------------------------------------

export interface ProjectTableProps {
  projects: ProjectListItem[];
  onProjectClick: (id: string) => void;
}

export function ProjectTable({ projects, onProjectClick }: ProjectTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full text-sm" aria-label="Projects table">
        <thead className="bg-slate-800 text-left">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium text-slate-400">
              Name
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-slate-400">
              Description
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-slate-400">
              Mappings
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-slate-400">
              Status
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-slate-400">
              SANDBOX
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-slate-400">
              DEV
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-slate-400">
              PREPROD
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-slate-400">
              PROD
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-slate-400">
              Last Modified
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {projects.map((project) => {
            const allNotDeployed =
              project.sandboxDeploy === 'not-deployed' &&
              project.devDeploy === 'not-deployed' &&
              project.preprodDeploy === 'not-deployed' &&
              project.prodDeploy === 'not-deployed';

            return (
            <tr
              key={project.projectId}
              onClick={() => onProjectClick(project.projectId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onProjectClick(project.projectId);
                }
              }}
              tabIndex={0}
              aria-label={project.name}
              className="cursor-pointer bg-slate-900 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
            >
              <td className="max-w-[160px] truncate px-4 py-3 font-medium text-slate-100">
                {project.name}
              </td>
              <td className="max-w-xs truncate px-4 py-3 text-slate-400">
                {project.description || <span className="italic text-slate-600">—</span>}
              </td>
              <td className="px-4 py-3 text-slate-300">{project.mappingCount}</td>
              <td className="px-4 py-3">
                <WorstStatusBadge status={project.worstStatus} />
              </td>
              {allNotDeployed ? (
                <td colSpan={4} className="px-4 py-3 text-xs text-slate-500" data-testid={`deploy-condensed-${project.projectId}`}>
                  Not deployed
                </td>
              ) : (
                <>
                  <td className="px-4 py-3">
                    <StatusBadge status={project.sandboxDeploy} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={project.devDeploy} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={project.preprodDeploy} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={project.prodDeploy} />
                  </td>
                </>
              )}
              <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                {formatDate(project.updatedAt)}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
