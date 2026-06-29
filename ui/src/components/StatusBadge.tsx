import type { DeployStatus } from '@/lib/types/domain';

export interface StatusBadgeProps {
  status: DeployStatus;
  showLabel?: boolean;
}

const statusConfig: Record<DeployStatus, { dotClass: string; label: string }> = {
  deployed: { dotClass: 'bg-green-500', label: 'Deployed' },
  stale: { dotClass: 'bg-orange-500', label: 'Stale' },
  'not-deployed': { dotClass: 'bg-slate-500', label: 'Not deployed' },
  deploying: { dotClass: 'bg-yellow-500', label: 'Deploying' },
};

export function StatusBadge({ status, showLabel = true }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center text-xs font-medium text-slate-300 ${
        showLabel ? 'gap-1.5' : ''
      }`}
      aria-label={config.label}
      title={config.label}
    >
      <span className={`h-2 w-2 rounded-full ${config.dotClass}`} aria-hidden="true" />
      {showLabel ? config.label : null}
    </span>
  );
}
