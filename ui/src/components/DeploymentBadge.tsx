import type { DeploymentStatus } from '@/lib/api/types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const statusConfig: Record<
  DeploymentStatus,
  { dotCls: string; textCls: string; label: string }
> = {
  current: {
    dotCls: 'bg-green-500',
    textCls: 'text-green-300',
    label: 'Current',
  },
  stale: {
    dotCls: 'bg-amber-500',
    textCls: 'text-amber-300',
    label: 'Stale',
  },
  'not-deployed': {
    dotCls: 'bg-slate-500',
    textCls: 'text-slate-400',
    label: 'Not deployed',
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DeploymentBadgeProps {
  /** Deployment status from getCurrentDeployments() */
  status: DeploymentStatus;
  /** Optional class override */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Per-environment deployment status badge.
 *
 * Uses `DeploymentStatus` ('current' | 'stale' | 'not-deployed') from the
 * deployments API, distinct from the legacy `DeployStatus` type.
 *
 * - current  → green dot + "Current"
 * - stale    → amber dot + "Stale"
 * - not-deployed → gray dot + "Not deployed"
 */
export function DeploymentBadge({ status, className = '' }: DeploymentBadgeProps) {
  const { dotCls, textCls, label } = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${textCls} ${className}`}
      data-testid={`deployment-badge-${status}`}
    >
      <span className={`h-2 w-2 rounded-full ${dotCls}`} aria-hidden="true" />
      {label}
    </span>
  );
}
