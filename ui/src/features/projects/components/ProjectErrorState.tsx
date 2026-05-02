import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/Button';

export interface ProjectErrorStateProps {
  error?: string;
  onRetry: () => void;
}

/**
 * Error state for the Project Overview page. Shows an alert icon,
 * optional error detail text, and a Retry button.
 */
export function ProjectErrorState({ error, onRetry }: ProjectErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-lg border border-red-800 bg-slate-900 p-8 text-center"
      data-testid="project-error-state"
      role="alert"
    >
      <AlertCircle size={40} className="text-red-400" aria-hidden="true" />
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Failed to load project</h2>
        {error && <p className="mt-1 text-xs text-slate-400">{error}</p>}
      </div>
      <Button variant="primary" size="sm" onClick={onRetry} data-testid="retry-button">
        Retry
      </Button>
    </div>
  );
}
