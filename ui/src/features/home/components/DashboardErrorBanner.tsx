// DashboardErrorBanner — Alert banner shown above stale content on load failure (FS-014 T-09)

import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/Button';

export interface DashboardErrorBannerProps {
  message?: string;
  onRetry: () => void;
}

export function DashboardErrorBanner({
  message = 'Failed to load dashboard data',
  onRetry,
}: DashboardErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded-md border border-red-800 bg-red-950 p-4"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle
          size={18}
          className="shrink-0 text-red-400"
          aria-hidden="true"
        />
        <p className="text-sm text-red-300">{message}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
