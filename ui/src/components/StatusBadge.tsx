import type { DeployStatus } from '@/lib/types/domain';

export interface StatusBadgeProps {
  status: DeployStatus;
}

const statusConfig: Record<DeployStatus, { dotClass: string; label: string }> = {
  deployed: { dotClass: 'bg-green-500', label: 'Deployed' },
  stale: { dotClass: 'bg-orange-500', label: 'Stale' },
  'not-deployed': { dotClass: 'bg-slate-500', label: 'Not deployed' },
  deploying: { dotClass: 'bg-yellow-500', label: 'Deploying' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
      <span className={`h-2 w-2 rounded-full ${config.dotClass}`} aria-hidden="true" />
      {config.label}
    </span>
  );
}
