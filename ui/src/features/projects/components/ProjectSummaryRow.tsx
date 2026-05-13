import { AlertCircle, FileJson, GitBranch } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { PATHS } from '@/routes/paths';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProjectSummaryRowProps {
  readonly mappingCount: number;
  readonly schemaCount: number;
  readonly errorCount: number;
  readonly projectId: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface MetricItemProps {
  label: string;
  value: number | string;
  accent?: 'red' | 'neutral' | 'muted';
  icon?: ReactNode;
  ariaLabel?: string;
}

function MetricItem({ label, value, accent = 'neutral', icon, ariaLabel }: MetricItemProps) {
  const valueStyles: Record<string, string> = {
    red: 'text-red-400',
    neutral: 'text-slate-100',
    muted: 'text-slate-500',
  };

  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={ariaLabel ?? `${label}: ${value}`}
    >
      {icon && <span className="text-slate-500" aria-hidden="true">{icon}</span>}
      <span className={`text-sm font-semibold tabular-nums ${valueStyles[accent]}`}>
        {value}
      </span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectSummaryRow
// ---------------------------------------------------------------------------

/**
 * Compact horizontal summary row showing project health metrics.
 * Placed between the project header and the mappings section (FS-050 T-03).
 *
 * Deployment-related metrics (Stale Deployments, Ready to Deploy) are scaffold
 * placeholders until backend deployment status wiring exists.
 */
export function ProjectSummaryRow({
  mappingCount,
  schemaCount,
  errorCount,
  projectId,
}: ProjectSummaryRowProps) {
  const deploymentsPath = PATHS.PROJECT_DEPLOYMENTS.replace(':projectId', projectId);

  return (
    <div
      data-testid="project-summary-row"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-slate-800 bg-slate-900/50 px-4 py-2.5"
    >
      {/* Mappings count */}
      <MetricItem
        label="Mappings"
        value={mappingCount}
        icon={<GitBranch size={13} />}
      />

      {/* Separator */}
      <span className="text-slate-700 select-none" aria-hidden="true">·</span>

      {/* Schemas count */}
      <MetricItem
        label="Schemas"
        value={schemaCount}
        icon={<FileJson size={13} />}
      />

      {/* Separator */}
      <span className="text-slate-700 select-none" aria-hidden="true">·</span>

      {/* Error count — red accent when > 0 */}
      <MetricItem
        label="Errors"
        value={errorCount}
        accent={errorCount > 0 ? 'red' : 'neutral'}
        icon={
          <AlertCircle
            size={13}
            className={errorCount > 0 ? 'text-red-400' : 'text-slate-500'}
          />
        }
      />

      {/* Separator */}
      <span className="text-slate-700 select-none" aria-hidden="true">·</span>

      {/* Stale Deployments — scaffold placeholder */}
      <MetricItem
        label="Stale Deployments"
        value="—"
        accent="muted"
        ariaLabel="Stale Deployments: not yet available"
      />

      {/* Separator */}
      <span className="text-slate-700 select-none" aria-hidden="true">·</span>

      {/* Ready to Deploy — scaffold placeholder */}
      <MetricItem
        label="Ready to Deploy"
        value="—"
        accent="muted"
        ariaLabel="Ready to Deploy: not yet available"
      />

      {/* Spacer pushes link to the right on wider screens */}
      <div className="flex-1" aria-hidden="true" />

      {/* View Deployments link */}
      <Link
        to={deploymentsPath}
        className="text-xs text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950"
        data-testid="view-deployments-link"
      >
        View Deployments →
      </Link>
    </div>
  );
}
