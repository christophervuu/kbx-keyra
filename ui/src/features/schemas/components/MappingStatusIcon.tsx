import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react';

import type { MappingNodeStatus } from '@/lib/types';

interface MappingStatusIconProps {
  status: MappingNodeStatus;
}

const CONFIG: Record<MappingNodeStatus, { Icon: typeof CheckCircle2; className: string; label: string }> = {
  mapped: { Icon: CheckCircle2, className: 'text-green-600', label: 'Mapped' },
  unmapped: { Icon: Circle, className: 'text-gray-400', label: 'Unmapped' },
  warning: { Icon: AlertTriangle, className: 'text-amber-500', label: 'Has warnings' },
};

export function MappingStatusIcon({ status }: MappingStatusIconProps) {
  const { Icon, className, label } = CONFIG[status];

  return (
    <Icon
      size={14}
      className={className}
      aria-label={label}
      role="img"
    />
  );
}
